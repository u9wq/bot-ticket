import { ChannelType, OverwriteType, PermissionFlagsBits as P } from 'discord.js';
import { getSettings } from '#core/settings.js';
import { staffRolesFor } from '#core/perms.js';
import { v2, notice, timestamp } from '#core/ui.js';
import * as store from '#tickets/store.js';
import { log, ticketLabel } from '#tickets/logs.js';
import { buildTranscript } from '#tickets/transcript.js';
import { controlMessage, closedMessage, ratingRequest } from '#tickets/views.js';

/**
 * Logique métier des tickets.
 *
 * Commandes et boutons appellent les mêmes fonctions : fermer un ticket avec
 * +close ou avec le bouton produit exactement le même résultat. Chaque
 * fonction renvoie { ok, message } et laisse l'appelant choisir comment
 * répondre (message dans le salon, réponse éphémère…).
 */

const MEMBER_ALLOW = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions];
const STAFF_ALLOW = [...MEMBER_ALLOW, P.ManageMessages];
// ManageRoles (« Gérer les permissions ») est volontairement absent : Discord
// n'autorise que les administrateurs à l'accorder dans une surcharge.
const BOT_ALLOW = [...STAFF_ALLOW, P.ManageChannels];

// Même droits que MEMBER_ALLOW, sous la forme attendue par permissionOverwrites.edit().
const MEMBER_OVERWRITE = {
	ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true, AddReactions: true
};

const DELETE_DELAY = 5000;

/** Ouvertures en cours, pour qu'un double clic ne crée pas deux tickets. */
const opening = new Set();

const fail = (message) => ({ ok: false, message });
const done = (message, extra = {}) => ({ ok: true, message, ...extra });

function slug(text) {
	return String(text ?? '')
		.normalize('NFD').replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-|-$/g, '');
}

export function channelName(format, { ticket, user, category }) {
	const name = String(format || 'ticket-{number}')
		.replaceAll('{number}', String(ticket.number).padStart(4, '0'))
		.replaceAll('{user}', user.username)
		.replaceAll('{category}', category?.name ?? 'general');
	return slug(name).slice(0, 100) || `ticket-${ticket.number}`;
}

const channelOf = (guild, ticket) => (ticket.channel_id ? guild.channels.cache.get(ticket.channel_id) : null);
const categoryOf = (ticket) => (ticket.category_id ? store.getCategory(ticket.category_id) : null);

/** Rôles existants encore sur le serveur : un rôle supprimé ferait échouer la création. */
const existingRoles = (guild, ids) => ids.filter((id) => guild.roles.cache.has(id));

// ─── Ouverture ─────────────────────────────────────────────────────────────

/**
 * Contrôles préalables à une ouverture. Séparés de openTicket pour être
 * vérifiés avant d'afficher le formulaire : inutile de faire remplir cinq
 * questions à quelqu'un qui sera refusé ensuite.
 */
export function checkCanOpen(guild, member, settings) {
	const banned = store.getBlacklist(guild.id, member.id);
	if (banned) return `Tu ne peux pas ouvrir de ticket sur ce serveur.${banned.reason ? `\n> ${banned.reason}` : ''}`;

	if (opening.has(`${guild.id}:${member.id}`)) return 'Ton ticket est déjà en cours de création.';

	if (settings.features.ticketLimit) {
		const open = store.openTicketsOf(guild.id, member.id).filter((t) => t.channel_id && guild.channels.cache.has(t.channel_id));
		if (open.length >= settings.maxTickets) {
			return `Tu as déjà ${open.length} ticket${open.length > 1 ? 's' : ''} ouvert${open.length > 1 ? 's' : ''} : ${open.map((t) => `<#${t.channel_id}>`).join(', ')}`;
		}
	}

	return null;
}

export async function openTicket({ guild, member, category = null, answers = [] }) {
	const settings = getSettings(guild.id);

	if (category && !category.enabled) return fail('Cette catégorie est désactivée.');
	const refused = checkCanOpen(guild, member, settings);
	if (refused) return fail(refused);

	const key = `${guild.id}:${member.id}`;
	opening.add(key);

	try {
		let ticket = store.reserveTicket({ guildId: guild.id, ownerId: member.id, categoryId: category?.id, answers });

		const parentId = category?.parent_id || settings.channels.tickets;
		const parent = parentId && guild.channels.cache.get(parentId);
		const staffRoles = existingRoles(guild, staffRolesFor(settings, category));

		const channel = await guild.channels.create({
			name: channelName(settings.nameFormat, { ticket, user: member.user, category }),
			type: ChannelType.GuildText,
			parent: parent?.type === ChannelType.GuildCategory ? parent : null,
			topic: `Ticket ${ticketLabel(ticket)} · ${member.user.username} · ${category?.name ?? 'Général'}`,
			reason: `Ticket ouvert par ${member.user.username}`,
			permissionOverwrites: [
				{ id: guild.roles.everyone.id, deny: [P.ViewChannel] },
				{ id: guild.client.user.id, allow: BOT_ALLOW },
				{ id: member.id, allow: MEMBER_ALLOW },
				...staffRoles.map((id) => ({ id, allow: STAFF_ALLOW }))
			]
		}).catch((error) => {
			console.error('[TICKET] création du salon impossible :', error.message);
			return null;
		});

		if (!channel) {
			store.discardTicket(ticket.id);
			return fail("Le ticket n'a pas pu être créé : le bot manque sans doute de la permission « Gérer les salons ». Préviens un administrateur.");
		}

		ticket = store.updateTicket(ticket.id, { channel_id: channel.id, status: 'open' });

		const pingRoles = settings.features.pingStaff ? staffRoles : [];
		const control = await channel.send(v2(
			controlMessage({ ticket, category, settings, guild, owner: member.user, pingRoles }),
			{ allowedMentions: { users: [member.id], roles: pingRoles } }
		)).catch((error) => {
			console.error('[TICKET] message de contrôle impossible :', error.message);
			return null;
		});
		if (control) store.updateTicket(ticket.id, { control_message: control.id });

		log(guild, settings, {
			type: 'open',
			title: `Ticket ouvert · ${ticketLabel(ticket)}`,
			fields: [['Auteur', `<@${member.id}>`], ['Catégorie', category?.name ?? 'Général'], ['Salon', `<#${channel.id}>`]]
		});

		return done(`Ton ticket est ouvert : ${channel}`, { channel, ticket });
	} finally {
		opening.delete(key);
	}
}

// ─── Message de contrôle ───────────────────────────────────────────────────

export async function refreshControl(guild, ticket) {
	const channel = channelOf(guild, ticket);
	if (!channel || !ticket.control_message) return;

	const settings = getSettings(guild.id);
	const category = categoryOf(ticket);
	const owner = await guild.client.users.fetch(ticket.owner_id).catch(() => null);
	const pingRoles = settings.features.pingStaff ? existingRoles(guild, staffRolesFor(settings, category)) : [];

	await channel.messages.edit(ticket.control_message, v2(
		controlMessage({ ticket, category, settings, guild, owner, pingRoles })
	)).catch(() => null);
}

// ─── Fermeture, réouverture, suppression ───────────────────────────────────

export async function closeTicket({ guild, ticket, actor, reason = null }) {
	const settings = getSettings(guild.id);
	const { features } = settings;

	// Le passage à « fermé » se fait en base avant tout le reste : deux clics
	// simultanés sur « Fermer » ne produisent qu'une seule fermeture.
	if (!store.markClosed(ticket.id, actor.id, reason)) return fail('Ce ticket est déjà fermé.');
	ticket = store.getTicket(ticket.id);

	const category = categoryOf(ticket);
	const channel = channelOf(guild, ticket);
	const transcript = features.transcript && channel
		? await buildTranscript(channel, ticket, category).catch((error) => {
			console.error('[TRANSCRIPT] génération impossible :', error.message);
			return null;
		})
		: null;

	const fields = [
		['Auteur', `<@${ticket.owner_id}>`],
		['Fermé par', `<@${actor.id}>`],
		['Catégorie', category?.name ?? 'Général'],
		['Pris en charge par', ticket.claimed_by && `<@${ticket.claimed_by}>`],
		['Messages', transcript?.count],
		['Raison', reason, false]
	];
	const title = `Ticket fermé · ${ticketLabel(ticket)}${channel ? ` (${channel.name})` : ''}`;

	// Transcription dans son propre salon si configuré, sinon jointe au log.
	const separate = transcript && settings.channels.transcripts && settings.channels.transcripts !== settings.channels.logs;
	if (separate) {
		await log(guild, settings, { type: 'close', title, fields, files: [transcript.file], channelId: settings.channels.transcripts });
	}
	await log(guild, settings, { type: 'close', title, fields, files: transcript && !separate ? [transcript.file] : [] });

	const owner = await guild.client.users.fetch(ticket.owner_id).catch(() => null);
	if (owner && transcript && features.transcriptDM) {
		await owner.send({
			content: `Transcription de ton ticket **${ticketLabel(ticket)}** sur **${guild.name}**.`,
			files: [transcript.file]
		}).catch(() => null);
	}
	if (owner && features.rating) {
		await owner.send(v2(ratingRequest({ ticket, guild, settings }))).catch(() => null);
	}

	if (!channel) {
		store.updateTicket(ticket.id, { status: 'deleted' });
		return done('Ticket fermé.');
	}

	if (!features.archive) {
		store.updateTicket(ticket.id, { status: 'deleted' });
		await channel.send(v2(notice(settings.color,
			`🔒 Ticket fermé par <@${actor.id}>. Suppression du salon ${timestamp(Date.now() + DELETE_DELAY)}.`))).catch(() => null);
		setTimeout(() => channel.delete(`Ticket fermé par ${actor.username}`).catch(() => null), DELETE_DELAY);
		return done('Ticket fermé.');
	}

	// Archivage : l'auteur et les membres ajoutés perdent l'accès, le staff le garde.
	for (const id of [ticket.owner_id, ...ticket.members]) {
		await channel.permissionOverwrites.edit(id, { ViewChannel: false }, { type: OverwriteType.Member }).catch(() => null);
	}

	const closedCategory = settings.channels.closed && guild.channels.cache.get(settings.channels.closed);
	if (closedCategory && channel.parentId !== closedCategory.id) {
		await channel.setParent(closedCategory, { lockPermissions: false }).catch(() => null);
	}

	const message = await channel.send(v2(closedMessage({ ticket, settings }))).catch(() => null);
	if (message) store.updateTicket(ticket.id, { closed_message: message.id });

	return done('Ticket fermé.');
}

export async function reopenTicket({ guild, ticket, actor }) {
	const settings = getSettings(guild.id);
	const channel = channelOf(guild, ticket);
	if (!channel) return fail("Le salon de ce ticket n'existe plus.");
	if (!store.markReopened(ticket.id)) return fail("Ce ticket n'est pas fermé.");

	for (const id of [ticket.owner_id, ...ticket.members]) {
		await channel.permissionOverwrites.edit(id, { ViewChannel: true }, { type: OverwriteType.Member }).catch(() => null);
	}

	const category = categoryOf(ticket);
	const parentId = category?.parent_id || settings.channels.tickets;
	const parent = parentId && guild.channels.cache.get(parentId);
	if (parent && channel.parentId !== parent.id) {
		await channel.setParent(parent, { lockPermissions: false }).catch(() => null);
	}

	if (ticket.closed_message) await channel.messages.delete(ticket.closed_message).catch(() => null);

	await channel.send(v2(notice(settings.color, `🔓 Ticket rouvert par <@${actor.id}>.`))).catch(() => null);
	log(guild, settings, {
		type: 'reopen',
		title: `Ticket rouvert · ${ticketLabel(ticket)}`,
		fields: [['Par', `<@${actor.id}>`], ['Salon', `<#${channel.id}>`]]
	});

	return done('Ticket rouvert.');
}

export async function deleteTicket({ guild, ticket, actor }) {
	const settings = getSettings(guild.id);
	if (ticket.status === 'open') return fail(`Ferme d'abord le ticket avec \`${settings.prefix}close\` : la transcription est faite à la fermeture.`);

	const channel = channelOf(guild, ticket);
	store.updateTicket(ticket.id, { status: 'deleted' });

	log(guild, settings, {
		type: 'delete',
		title: `Ticket supprimé · ${ticketLabel(ticket)}`,
		fields: [['Par', `<@${actor.id}>`], ['Salon', channel?.name]]
	});

	if (channel) {
		await channel.send(v2(notice(settings.color, `🗑️ Suppression du salon ${timestamp(Date.now() + DELETE_DELAY)}.`))).catch(() => null);
		setTimeout(() => channel.delete(`Ticket supprimé par ${actor.username}`).catch(() => null), DELETE_DELAY);
	}

	return done('Ticket supprimé.');
}

// ─── Prise en charge ───────────────────────────────────────────────────────

export async function claimTicket({ guild, ticket, member, force = false }) {
	const settings = getSettings(guild.id);
	if (!settings.features.claim) return fail('La prise en charge est désactivée sur ce serveur.');
	if (ticket.status !== 'open') return fail("Ce ticket n'est pas ouvert.");
	if (ticket.claimed_by === member.id) return fail('Tu suis déjà ce ticket.');
	if (ticket.claimed_by && !force) return fail(`Ce ticket est déjà pris en charge par <@${ticket.claimed_by}>.`);

	ticket = store.updateTicket(ticket.id, { claimed_by: member.id });
	await refreshControl(guild, ticket);

	const channel = channelOf(guild, ticket);
	await channel?.send(v2(notice(settings.color, `🙋 <@${member.id}> prend en charge ce ticket.`))).catch(() => null);
	log(guild, settings, {
		type: 'claim',
		title: `Ticket pris en charge · ${ticketLabel(ticket)}`,
		fields: [['Par', `<@${member.id}>`], ['Salon', channel && `<#${channel.id}>`]]
	});

	return done('Ticket pris en charge.');
}

export async function unclaimTicket({ guild, ticket, member, force = false }) {
	const settings = getSettings(guild.id);
	if (!ticket.claimed_by) return fail("Ce ticket n'est pris en charge par personne.");
	if (ticket.claimed_by !== member.id && !force) return fail(`Seul <@${ticket.claimed_by}> ou un administrateur peut libérer ce ticket.`);

	ticket = store.updateTicket(ticket.id, { claimed_by: null });
	await refreshControl(guild, ticket);
	await channelOf(guild, ticket)?.send(v2(notice(settings.color, `↩️ <@${member.id}> a libéré ce ticket.`))).catch(() => null);

	return done('Ticket libéré.');
}

// ─── Participants et nom ───────────────────────────────────────────────────

export async function addMember({ guild, ticket, target, actor }) {
	const settings = getSettings(guild.id);
	const channel = channelOf(guild, ticket);
	if (!channel) return fail("Le salon de ce ticket n'existe plus.");
	if (target.user.bot) return fail("Un bot ne peut pas être ajouté à un ticket.");
	if (target.id === ticket.owner_id || ticket.members.includes(target.id)) return fail(`<@${target.id}> a déjà accès à ce ticket.`);

	// Ajouté à un ticket fermé, le membre n'y aura accès qu'à la réouverture.
	const overwrite = { ...MEMBER_OVERWRITE, ViewChannel: ticket.status !== 'closed' };
	await channel.permissionOverwrites.edit(target.id, overwrite, { type: OverwriteType.Member });

	store.updateTicket(ticket.id, { members: [...ticket.members, target.id] });
	log(guild, settings, {
		type: 'member',
		title: `Membre ajouté · ${ticketLabel(ticket)}`,
		fields: [['Membre', `<@${target.id}>`], ['Par', `<@${actor.id}>`], ['Salon', `<#${channel.id}>`]]
	});

	return done(`<@${target.id}> a été ajouté au ticket.`);
}

export async function removeMember({ guild, ticket, target, actor }) {
	const settings = getSettings(guild.id);
	const channel = channelOf(guild, ticket);
	if (!channel) return fail("Le salon de ce ticket n'existe plus.");
	if (target.id === ticket.owner_id) return fail("L'auteur du ticket ne peut pas en être retiré. Ferme le ticket à la place.");
	if (!ticket.members.includes(target.id)) return fail(`<@${target.id}> n'a pas été ajouté à ce ticket.`);

	await channel.permissionOverwrites.delete(target.id);
	store.updateTicket(ticket.id, { members: ticket.members.filter((id) => id !== target.id) });
	log(guild, settings, {
		type: 'member',
		title: `Membre retiré · ${ticketLabel(ticket)}`,
		fields: [['Membre', `<@${target.id}>`], ['Par', `<@${actor.id}>`], ['Salon', `<#${channel.id}>`]]
	});

	return done(`<@${target.id}> a été retiré du ticket.`);
}

/**
 * Discord limite le renommage d'un salon à deux fois par tranche de dix
 * minutes, et discord.js attend alors en silence. On borne l'attente pour
 * prévenir plutôt que de laisser la commande sans réponse.
 */
export async function renameTicket({ guild, ticket, name }) {
	const channel = channelOf(guild, ticket);
	if (!channel) return fail("Le salon de ce ticket n'existe plus.");

	const clean = slug(name).slice(0, 100);
	if (!clean) return fail('Ce nom est invalide.');

	const result = await Promise.race([
		channel.setName(clean).then(() => true).catch(() => false),
		new Promise((resolve) => setTimeout(() => resolve(null), 5000))
	]);

	if (result === null) return done('Discord limite le renommage à deux fois par tranche de dix minutes : le nouveau nom sera appliqué dès que possible.');
	return result ? done(`Ticket renommé : **${clean}**`) : fail("Le ticket n'a pas pu être renommé.");
}

export async function transcriptOf({ guild, ticket }) {
	const channel = channelOf(guild, ticket);
	if (!channel) return fail("Le salon de ce ticket n'existe plus.");
	const { file, count } = await buildTranscript(channel, ticket, categoryOf(ticket));
	return done(`Transcription générée, ${count} messages.`, { file });
}

// ─── Avis ──────────────────────────────────────────────────────────────────

export async function rateTicket({ client, ticketId, user, rating }) {
	const ticket = store.getTicket(ticketId);
	if (!ticket || ticket.owner_id !== user.id) return fail('Ce ticket est introuvable.');
	if (ticket.rating) return fail(`Tu as déjà donné une note de ${ticket.rating}/5 à ce ticket.`);

	store.updateTicket(ticket.id, { rating });

	const guild = client.guilds.cache.get(ticket.guild_id);
	if (guild) {
		log(guild, getSettings(guild.id), {
			type: 'rating',
			title: `Avis reçu · ${ticketLabel(ticket)}`,
			fields: [['Note', `${'⭐'.repeat(rating)} (${rating}/5)`], ['Auteur', `<@${user.id}>`], ['Pris en charge par', ticket.claimed_by && `<@${ticket.claimed_by}>`]]
		});
	}

	return done(`Merci pour ta note de ${rating}/5 !`);
}

// ─── Tâches de fond ────────────────────────────────────────────────────────

/** Ferme les tickets inactifs des serveurs qui ont activé la fermeture automatique. */
export async function sweepInactive(client) {
	const now = Date.now();

	for (const ticket of store.allOpenTickets()) {
		const guild = client.guilds.cache.get(ticket.guild_id);
		if (!guild) continue;

		const settings = getSettings(guild.id);
		if (!settings.features.autoClose) continue;
		if (now - ticket.last_activity < settings.autoCloseHours * 3_600_000) continue;

		await closeTicket({
			guild,
			ticket,
			actor: client.user,
			reason: `Fermeture automatique : aucun message depuis ${settings.autoCloseHours} h.`
		}).catch((error) => console.error('[AUTOCLOSE] ticket', ticket.id, error.message));
	}
}
