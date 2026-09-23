import { renameTicket } from '#tickets/service.js';

export default {
	name: 'rename',
	aliases: ['renommer'],
	description: 'Renomme le salon du ticket',
	usage: '<nom>',
	level: 'staff',
	ticket: true,
	async run({ guild, ticket, raw, prefix, reply }) {
		if (!raw) return reply(`Utilisation : \`${prefix}rename <nom>\``);
		const res = await renameTicket({ guild, ticket, name: raw });
		return reply(`${res.ok ? '✅' : '❌'} ${res.message}`);
	}
};
