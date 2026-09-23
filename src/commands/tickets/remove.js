import { resolveMember } from '#core/args.js';
import { removeMember } from '#tickets/service.js';

export default {
	name: 'remove',
	aliases: ['retirer'],
	description: 'Retire un membre ajouté au ticket',
	usage: '<@membre | id>',
	level: 'staff',
	ticket: true,
	async run({ message, guild, ticket, args, prefix, reply }) {
		const target = await resolveMember(guild, args[0]);
		if (!target) return reply(`Membre introuvable. Utilisation : \`${prefix}remove <@membre | id>\``);

		const res = await removeMember({ guild, ticket, target, actor: message.author });
		return reply(`${res.ok ? '✅' : '❌'} ${res.message}`);
	}
};
