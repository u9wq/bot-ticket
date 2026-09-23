import { resolveMember } from '#core/args.js';
import { addMember } from '#tickets/service.js';

export default {
	name: 'add',
	aliases: ['ajouter'],
	description: 'Donne accès au ticket à un membre',
	usage: '<@membre | id>',
	level: 'staff',
	ticket: true,
	async run({ message, guild, ticket, args, prefix, reply }) {
		const target = await resolveMember(guild, args[0]);
		if (!target) return reply(`Membre introuvable. Utilisation : \`${prefix}add <@membre | id>\``);

		const res = await addMember({ guild, ticket, target, actor: message.author });
		return reply(`${res.ok ? '✅' : '❌'} ${res.message}`);
	}
};
