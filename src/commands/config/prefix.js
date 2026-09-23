import { updateSettings } from '#core/settings.js';

export default {
	name: 'prefix',
	aliases: ['prefixe'],
	description: 'Affiche ou change le préfixe des commandes',
	usage: '[nouveau préfixe]',
	level: 'admin',
	async run({ guild, args, prefix, reply }) {
		const next = args[0];
		if (!next) return reply(`Préfixe actuel : \`${prefix}\`\nPour le changer : \`${prefix}prefix <nouveau>\``);
		if (next.length > 5) return reply('Le préfixe ne peut pas dépasser 5 caractères.');

		updateSettings(guild.id, (s) => { s.prefix = next; });
		return reply(`✅ Nouveau préfixe : \`${next}\`\nExemple : \`${next}help\`. En cas d'oubli, mentionne le bot.`);
	}
};
