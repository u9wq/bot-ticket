import { findCommand } from '#core/commands.js';
import { helpView, commandHelp } from '#core/help.js';

export default {
	name: 'help',
	aliases: ['aide', 'h', 'commands'],
	description: 'Liste des commandes, ou détail de l\'une d\'elles',
	usage: '[commande]',
	level: 'everyone',
	async run({ message, settings, args, reply }) {
		if (args[0]) {
			const command = findCommand(args[0]);
			if (!command) return reply(`Commande inconnue : \`${args[0]}\``);
			return message.reply({ ...commandHelp(settings, command), allowedMentions: { repliedUser: false } });
		}
		return message.reply({ ...helpView(settings), allowedMentions: { repliedUser: false } });
	}
};
