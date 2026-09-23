import { EmbedBuilder } from 'discord.js';
import { resolveColor } from '#core/ui.js';

/**
 * Journal des tickets.
 *
 * Les journaux restent en embeds classiques plutôt qu'en Components V2 : ils
 * portent des pièces jointes (transcriptions) qui s'affichent directement sous
 * un embed, et se recherchent mieux dans Discord.
 */

const COLORS = {
	open: 0x57F287,
	close: 0xED4245,
	reopen: 0xFEE75C,
	delete: 0x992D22,
	claim: 0x5865F2,
	member: 0xEB459E,
	rating: 0xF1C40F,
	blacklist: 0x2B2D31
};

export const ticketLabel = (ticket) => `#${String(ticket.number).padStart(4, '0')}`;

/**
 * Envoie une entrée dans le salon de logs du serveur, s'il existe.
 * fields : [[nom, valeur], …]. Ne lève jamais : un journal raté ne doit pas
 * interrompre l'action journalisée.
 */
export async function log(guild, settings, { type, title, fields = [], files = [], channelId }) {
	const target = channelId ?? settings.channels.logs;
	const channel = target && guild.channels.cache.get(target);
	if (!channel?.isTextBased()) return null;

	const embed = new EmbedBuilder()
		.setColor(COLORS[type] ?? resolveColor(settings.color))
		.setTitle(title)
		.setTimestamp();

	const valid = fields.filter(([, value]) => value !== undefined && value !== null && value !== '');
	if (valid.length) {
		embed.addFields(valid.map(([name, value, inline = true]) => ({ name, value: String(value).slice(0, 1024), inline })));
	}

	return channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch((error) => {
		console.warn(`[LOGS] envoi impossible dans ${channel.id} :`, error.message);
		return null;
	});
}
