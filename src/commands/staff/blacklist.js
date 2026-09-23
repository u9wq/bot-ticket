import { resolveUser } from '#core/args.js';
import { getSettings } from '#core/settings.js';
import { timestamp } from '#core/ui.js';
import * as store from '#tickets/store.js';
import { log } from '#tickets/logs.js';

export default {
	name: 'blacklist',
	aliases: ['bl'],
	description: "Empêche un membre d'ouvrir des tickets",
	usage: 'add <@membre | id> [raison] · remove <@membre | id> · list',
	level: 'staff',
	async run({ bot, message, guild, args, prefix, reply }) {
		const [action = 'list', target, ...reasonParts] = args;
		const sub = action.toLowerCase();

		if (sub === 'list') {
			const entries = store.listBlacklist(guild.id);
			if (!entries.length) return reply('La liste noire est vide.');
			return reply(`### Liste noire (${entries.length})\n${entries.slice(0, 30).map((e) =>
				`<@${e.user_id}> · ajouté ${timestamp(e.added_at)} par <@${e.added_by}>${e.reason ? `\n-# ${e.reason}` : ''}`).join('\n')}`);
		}

		const user = await resolveUser(bot, target);
		if (!['add', 'remove'].includes(sub) || !user) {
			return reply(`Utilisation :\n\`${prefix}blacklist add <@membre | id> [raison]\`\n\`${prefix}blacklist remove <@membre | id>\`\n\`${prefix}blacklist list\``);
		}

		const settings = getSettings(guild.id);

		if (sub === 'add') {
			if (user.bot) return reply('Un bot ne peut pas ouvrir de ticket de toute façon.');
			const reason = reasonParts.join(' ') || null;
			store.addBlacklist(guild.id, user.id, reason, message.author.id);
			log(guild, settings, { type: 'blacklist', title: 'Ajout à la liste noire', fields: [['Membre', `<@${user.id}>`], ['Par', `<@${message.author.id}>`], ['Raison', reason, false]] });
			return reply(`⛔ <@${user.id}> ne peut plus ouvrir de ticket.`);
		}

		if (!store.removeBlacklist(guild.id, user.id)) return reply(`<@${user.id}> n'est pas dans la liste noire.`);
		log(guild, settings, { type: 'blacklist', title: 'Retrait de la liste noire', fields: [['Membre', `<@${user.id}>`], ['Par', `<@${message.author.id}>`]] });
		return reply(`✅ <@${user.id}> peut de nouveau ouvrir des tickets.`);
	}
};
