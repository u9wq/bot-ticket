import { deleteTicket } from '#tickets/service.js';

export default {
	name: 'delete',
	aliases: ['supprimer'],
	description: 'Supprime définitivement un ticket fermé',
	level: 'staff',
	ticket: true,
	async run({ message, guild, ticket, reply }) {
		const res = await deleteTicket({ guild, ticket, actor: message.author });
		if (!res.ok) return reply(`❌ ${res.message}`);
	}
};
