import { Events } from 'discord.js';
import { getSettings } from '#core/settings.js';
import * as store from '#tickets/store.js';
import { log, ticketLabel } from '#tickets/logs.js';

/** Un ticket dont le salon est supprimé à la main est marqué comme tel. */
export default {
	name: Events.ChannelDelete,
	execute(channel) {
		if (!channel.guild) return;
		const ticket = store.getTicketByChannel(channel.id);
		if (!ticket || ticket.status === 'deleted') return;

		store.updateTicket(ticket.id, { status: 'deleted' });
		log(channel.guild, getSettings(channel.guild.id), {
			type: 'delete',
			title: `Salon de ticket supprimé manuellement · ${ticketLabel(ticket)}`,
			fields: [['Salon', channel.name], ['Auteur', `<@${ticket.owner_id}>`]]
		});
	}
};
