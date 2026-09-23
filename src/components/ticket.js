import { MessageFlags } from 'discord.js';
import { isAdmin, isStaff } from '#core/perms.js';
import { ephemeral, modal, notice, panel, button, v2, ButtonStyle } from '#core/ui.js';
import * as store from '#tickets/store.js';
import * as service from '#tickets/service.js';
import { publicPanelPayload } from '#tickets/publish.js';

/**
 * Interactions des tickets : panneau public, formulaire d'ouverture et boutons
 * présents dans les tickets. Les permissions sont vérifiées ici, action par
 * action, car elles dépendent du ticket (auteur, rôles de sa catégorie).
 */

const MAX_ANSWER = 1000;

const result = (i, color, res) => ephemeral(i, color, `${res.ok ? '✅' : '❌'} ${res.message}`);

const defer = (i) => (i.deferred || i.replied ? null : i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null));

/** Ticket du salon où l'interaction a lieu, avec sa catégorie et le statut staff. */
function context(i, settings) {
	const ticket = store.getTicketByChannel(i.channelId);
	if (!ticket || ticket.status === 'deleted') return null;
	const category = ticket.category_id ? store.getCategory(ticket.category_id) : null;
	return { ticket, category, staff: isStaff(i.member, settings, category) };
}

function canClose(i, settings, ctx) {
	return ctx.staff || (settings.features.memberClose && i.user.id === ctx.ticket.owner_id);
}

function formModal(category) {
	return modal(`ticket:form:${category.id}`, category.name, category.questions.map((question, index) => ({
		id: `a${index}`,
		label: question,
		long: true,
		required: true,
		max: MAX_ANSWER
	})));
}

async function createTicket(i, { settings, category, answers }) {
	await defer(i);
	const res = await service.openTicket({ guild: i.guild, member: i.member, category, answers });
	return result(i, settings.color, res);
}

async function closeWith(i, settings, ticket, reason) {
	await defer(i);
	const res = await service.closeTicket({ guild: i.guild, ticket, actor: i.user, reason });
	return result(i, settings.color, res);
}

/** Garde commune aux actions réservées au staff dans un ticket. */
function staffOnly(handler) {
	return async (i, ctx) => {
		const t = context(i, ctx.settings);
		if (!t) return ephemeral(i, ctx.settings.color, "Ce salon n'est pas un ticket.");
		if (!t.staff) return ephemeral(i, ctx.settings.color, 'Action réservée au staff.');
		return handler(i, { ...ctx, ...t });
	};
}

export default {
	namespace: 'ticket',
	actions: {
		// Menu (ticket:open) ou bouton (ticket:open:<id>, 0 = sans catégorie) du panneau public.
		async open(i, { args: [buttonId], settings }) {
			const id = i.isStringSelectMenu() ? i.values[0] : buttonId;

			// Discord garde le choix affiché dans le menu : on republie le panneau
			// pour que le membre puisse rechoisir la même catégorie plus tard.
			if (i.isStringSelectMenu()) i.message.edit(publicPanelPayload(i.guild)).catch(() => null);

			let category = null;
			if (id && id !== '0') {
				category = store.getCategory(Number(id));
				if (!category || category.guild_id !== i.guild.id) return ephemeral(i, settings.color, 'Cette catégorie n\'existe plus.');
				if (!category.enabled) return ephemeral(i, settings.color, 'Cette catégorie est désactivée.');
			}

			const refused = service.checkCanOpen(i.guild, i.member, settings);
			if (refused) return ephemeral(i, settings.color, `❌ ${refused}`);

			if (settings.features.questions && category?.questions.length) {
				return i.showModal(formModal(category));
			}

			return createTicket(i, { settings, category, answers: [] });
		},

		async form(i, { args: [id], settings }) {
			const category = store.getCategory(Number(id));
			if (!category || category.guild_id !== i.guild.id) return ephemeral(i, settings.color, 'Cette catégorie n\'existe plus.');

			// Les questions ont pu changer entre l'affichage et l'envoi du
			// formulaire : on ne lit que les champs réellement présents.
			const answers = category.questions.flatMap((question, index) => {
				try {
					const answer = i.fields.getTextInputValue(`a${index}`)?.trim();
					return answer ? [{ question, answer }] : [];
				} catch {
					return [];
				}
			});

			return createTicket(i, { settings, category, answers });
		},

		async close(i, { settings }) {
			const ctx = context(i, settings);
			if (!ctx) return ephemeral(i, settings.color, "Ce salon n'est pas un ticket.");
			if (ctx.ticket.status !== 'open') return ephemeral(i, settings.color, 'Ce ticket est déjà fermé.');
			if (!canClose(i, settings, ctx)) return ephemeral(i, settings.color, 'Seul le staff peut fermer ce ticket.');

			if (settings.features.closeReason) {
				return i.showModal(modal('ticket:close-reason', 'Fermer le ticket', [
					{ id: 'reason', label: 'Raison de la fermeture', long: true, required: true, max: 500 }
				]));
			}

			if (settings.features.closeConfirm) {
				return i.reply(v2(panel(settings.color)
					.text('### Fermer ce ticket ?')
					.row(
						button('ticket:close-confirm', 'Fermer', { style: ButtonStyle.Danger, emoji: '🔒' }),
						button('ticket:close-cancel', 'Annuler')
					)
					.build(), { ephemeral: true }));
			}

			return closeWith(i, settings, ctx.ticket, null);
		},

		async 'close-confirm'(i, { settings }) {
			const ctx = context(i, settings);
			if (!ctx || !canClose(i, settings, ctx)) return i.update(v2(notice(settings.color, 'Action impossible.')));

			await i.update(v2(notice(settings.color, 'Fermeture en cours…')));
			const res = await service.closeTicket({ guild: i.guild, ticket: ctx.ticket, actor: i.user });
			return i.editReply(v2(notice(settings.color, `${res.ok ? '✅' : '❌'} ${res.message}`))).catch(() => null);
		},

		'close-cancel': (i, { settings }) => i.update(v2(notice(settings.color, 'Fermeture annulée.'))),

		async 'close-reason'(i, { settings }) {
			const ctx = context(i, settings);
			if (!ctx || !canClose(i, settings, ctx)) return ephemeral(i, settings.color, 'Action impossible.');
			return closeWith(i, settings, ctx.ticket, i.fields.getTextInputValue('reason').trim());
		},

		claim: staffOnly(async (i, { settings, ticket }) => {
			await defer(i);
			return result(i, settings.color, await service.claimTicket({ guild: i.guild, ticket, member: i.member }));
		}),

		unclaim: staffOnly(async (i, { settings, ticket }) => {
			await defer(i);
			return result(i, settings.color, await service.unclaimTicket({ guild: i.guild, ticket, member: i.member, force: isAdmin(i.member) }));
		}),

		reopen: staffOnly(async (i, { settings, ticket }) => {
			await defer(i);
			return result(i, settings.color, await service.reopenTicket({ guild: i.guild, ticket, actor: i.user }));
		}),

		delete: staffOnly(async (i, { settings, ticket }) => {
			await defer(i);
			return result(i, settings.color, await service.deleteTicket({ guild: i.guild, ticket, actor: i.user }));
		}),

		transcript: staffOnly(async (i, { settings, ticket }) => {
			await defer(i);
			const res = await service.transcriptOf({ guild: i.guild, ticket });
			if (!res.ok) return result(i, settings.color, res);
			return i.editReply({ content: `📄 ${res.message}`, files: [res.file] });
		})
	}
};
