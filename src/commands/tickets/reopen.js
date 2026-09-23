import { reopenTicket } from '#tickets/service.js';

export default {
	name: 'reopen',
	aliases: ['rouvrir'],
	description: 'Rouvre un ticket fermé',
	level: 'staff',
	ticket: true,
	async run({ message, guild, ticket, reply }) {
		const res = await reopenTicket({ guild, ticket, actor: message.author });
		if (!res.ok) return reply(`❌ ${res.message}`);
	}
};
