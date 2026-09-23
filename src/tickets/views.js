import { StringSelectMenuBuilder } from 'discord.js';
import { panel, button, ButtonStyle, emojiData, timestamp } from '#core/ui.js';
import { ticketLabel } from '#tickets/logs.js';

/**
 * Messages publiés par le système de tickets : panneau public, message de
 * contrôle dans le ticket, message de ticket fermé, demande d'avis.
 * Ces fonctions ne font que construire : l'envoi appartient au service.
 */

/** Remplace les variables d'un texte configurable. */
export function fill(template, { user, category, ticket, guild }) {
	return String(template ?? '')
		.replaceAll('{user}', user ? `<@${user.id}>` : '')
		.replaceAll('{username}', user?.username ?? '')
		.replaceAll('{category}', category?.name ?? 'Général')
		.replaceAll('{number}', ticket ? String(ticket.number).padStart(4, '0') : '')
		.replaceAll('{server}', guild?.name ?? '');
}

export function publicPanel(settings, categories) {
	const { panel: config } = settings;
	const enabled = categories.filter((c) => c.enabled).slice(0, 25);

	const p = panel(settings.color)
		.image(config.banner)
		.text([config.title && `## ${config.title}`, config.description].filter(Boolean).join('\n'))
		.separator();

	if (!enabled.length) {
		return p.row(button('ticket:open:0', config.buttonLabel, { style: ButtonStyle.Primary, emoji: '📩' })).build();
	}

	if (config.style === 'buttons') {
		for (let i = 0; i < enabled.length; i += 5) {
			p.row(enabled.slice(i, i + 5).map((c) =>
				button(`ticket:open:${c.id}`, c.name.slice(0, 80), { style: ButtonStyle.Secondary, emoji: emojiData(c.emoji) })));
		}
		return p.build();
	}

	const menu = new StringSelectMenuBuilder()
		.setCustomId('ticket:open')
		.setPlaceholder(config.placeholder.slice(0, 150))
		.addOptions(enabled.map((c) => ({
			label: c.name.slice(0, 100),
			value: String(c.id),
			...(c.description && { description: c.description.slice(0, 100) }),
			...(c.emoji && { emoji: emojiData(c.emoji) })
		})));

	return p.row(menu).build();
}

/** Message épinglé en tête de ticket, mis à jour à chaque prise en charge. */
export function controlMessage({ ticket, category, settings, guild, owner, pingRoles = [] }) {
	const title = `## ${category?.emoji ? `${category.emoji} ` : ''}${category?.name ?? 'Ticket'} · ${ticketLabel(ticket)}`;
	const mentions = [`<@${ticket.owner_id}>`, ...pingRoles.map((id) => `<@&${id}>`)].join(' ');
	const welcome = fill(category?.welcome || settings.welcome, { user: owner, category, ticket, guild });

	const p = panel(settings.color).text(`${title}\n${mentions}`).text(welcome);

	if (ticket.answers.length) {
		p.separator().text(ticket.answers
			.map(({ question, answer }) => `**${question}**\n${answer.split('\n').map((l) => `> ${l}`).join('\n')}`)
			.join('\n'));
	}

	const status = [`Ouvert ${timestamp(ticket.created_at)}`];
	if (ticket.claimed_by) status.push(`pris en charge par <@${ticket.claimed_by}>`);
	p.text(`-# ${status.join(' · ')}`).separator();

	const buttons = [button('ticket:close', 'Fermer', { style: ButtonStyle.Danger, emoji: '🔒' })];
	if (settings.features.claim) {
		buttons.push(ticket.claimed_by
			? button('ticket:unclaim', 'Libérer', { emoji: '↩️' })
			: button('ticket:claim', 'Prendre en charge', { style: ButtonStyle.Success, emoji: '🙋' }));
	}
	buttons.push(button('ticket:transcript', 'Transcription', { emoji: '📄' }));

	return p.row(buttons).build();
}

export function closedMessage({ ticket, settings }) {
	const lines = [
		'### 🔒 Ticket fermé',
		`Fermé par <@${ticket.closed_by}> ${timestamp(ticket.closed_at)}`
	];
	if (ticket.close_reason) lines.push(`> ${ticket.close_reason}`);

	return panel(settings.color)
		.text(lines.join('\n'))
		.separator()
		.row(
			button('ticket:reopen', 'Rouvrir', { style: ButtonStyle.Success, emoji: '🔓' }),
			button('ticket:transcript', 'Transcription', { emoji: '📄' }),
			button('ticket:delete', 'Supprimer', { style: ButtonStyle.Danger, emoji: '🗑️' })
		)
		.build();
}

export function ratingRequest({ ticket, guild, settings }) {
	return panel(settings.color)
		.text(`### Ton avis compte\nTon ticket **${ticketLabel(ticket)}** sur **${guild.name}** a été fermé.\nComment s'est passé l'échange ?`)
		.row([1, 2, 3, 4, 5].map((n) =>
			button(`rating:give:${ticket.id}:${n}`, '⭐'.repeat(n), { style: n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary })))
		.build();
}
