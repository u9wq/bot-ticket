import { isStaff } from '#core/perms.js';
import { closeTicket } from '#tickets/service.js';

export default {
	name: 'close',
	aliases: ['fermer'],
	description: 'Ferme le ticket',
	usage: '[raison]',
	level: 'everyone',
	ticket: true,
	async run({ message, guild, member, settings, ticket, category, raw, prefix, reply }) {
		const allowed = isStaff(member, settings, category)
			|| (settings.features.memberClose && member.id === ticket.owner_id);
		if (!allowed) return reply('Seul le staff peut fermer ce ticket.');
		if (ticket.status !== 'open') return reply('Ce ticket est déjà fermé.');
		if (settings.features.closeReason && !raw) return reply(`Précise une raison : \`${prefix}close <raison>\``);

		const res = await closeTicket({ guild, ticket, actor: message.author, reason: raw || null });
		if (!res.ok) return reply(`❌ ${res.message}`);
	}
};
