import { Events } from 'discord.js';
import { dispatch } from '#core/commands.js';
import { touchTicket } from '#tickets/store.js';

export default {
	name: Events.MessageCreate,
	async execute(message, bot) {
		if (!message.guild || message.author.bot) return;

		// Dernière activité du ticket, pour la fermeture automatique.
		touchTicket(message.channel.id);

		await dispatch(message, bot);
	}
};
