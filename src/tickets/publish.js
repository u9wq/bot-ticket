import { getSettings, updateSettings } from '#core/settings.js';
import { v2 } from '#core/ui.js';
import { listCategories } from '#tickets/store.js';
import { publicPanel } from '#tickets/views.js';

/**
 * Panneau public d'ouverture des tickets.
 *
 * L'emplacement du panneau publié est mémorisé : toute modification faite
 * dans +setup (catégories, textes, style) le met à jour sur place, sans avoir
 * à le republier ni à supprimer l'ancien.
 */

export const publicPanelPayload = (guild) => {
	const settings = getSettings(guild.id);
	return v2(publicPanel(settings, listCategories(guild.id)));
};

/** Publie le panneau dans un salon et remplace l'ancien s'il existe. */
export async function publishPanel(guild, channel) {
	const { panel } = getSettings(guild.id);

	const message = await channel.send(publicPanelPayload(guild));

	if (panel.messageId && panel.messageId !== message.id) {
		const previous = guild.channels.cache.get(panel.channelId);
		await previous?.messages.delete(panel.messageId).catch(() => null);
	}

	updateSettings(guild.id, (s) => {
		s.panel.channelId = channel.id;
		s.panel.messageId = message.id;
	});

	return message;
}

/** Met à jour le panneau publié. Renvoie false s'il n'existe plus. */
export async function refreshPublishedPanel(guild) {
	const { panel } = getSettings(guild.id);
	if (!panel.messageId) return false;

	const channel = guild.channels.cache.get(panel.channelId);
	const edited = channel && await channel.messages.edit(panel.messageId, publicPanelPayload(guild)).catch(() => null);

	if (!edited) {
		updateSettings(guild.id, (s) => {
			s.panel.channelId = null;
			s.panel.messageId = null;
		});
		return false;
	}
	return true;
}

export const panelUrl = (guild) => {
	const { panel } = getSettings(guild.id);
	return panel.messageId ? `https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId}` : null;
};
