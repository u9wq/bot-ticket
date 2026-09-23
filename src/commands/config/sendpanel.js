import { resolveChannel } from '#core/args.js';
import { publishPanel } from '#tickets/publish.js';

export default {
	name: 'sendpanel',
	aliases: ['panel', 'publish'],
	description: "Publie le panneau d'ouverture des tickets",
	usage: '[#salon]',
	level: 'admin',
	async run({ message, guild, args, reply }) {
		const channel = args[0] ? resolveChannel(guild, args[0]) : message.channel;
		if (!channel?.isTextBased()) return reply('Salon introuvable. Exemple : `#support`');

		const sent = await publishPanel(guild, channel).catch(() => null);
		if (!sent) return reply(`❌ Impossible de publier dans ${channel} : vérifie que le bot peut y écrire.`);

		if (channel.id === message.channel.id) return message.delete().catch(() => null);
		return reply(`✅ Panneau publié dans ${channel}. Il sera mis à jour automatiquement à chaque modification.`);
	}
};
