import { updateSettings } from '#core/settings.js';
import { ephemeral } from '#core/ui.js';
import { featureByKey } from '#tickets/features.js';
import * as store from '#tickets/store.js';
import { publishPanel, refreshPublishedPanel } from '#tickets/publish.js';
import { renderSetup } from '#setup/views.js';
import { EDITS, editModal, readFields } from '#setup/edits.js';

/**
 * Interactions du panneau de configuration (+setup).
 *
 * Toutes les actions modifient la base puis réaffichent la page concernée en
 * remplaçant le message : le panneau reflète toujours l'état réel. Réservé aux
 * administrateurs, contrôlé par le routeur à chaque clic.
 */

const CHANNEL_KEYS = ['tickets', 'closed', 'logs', 'transcripts'];

/** Réaffiche une page et, si besoin, met à jour le panneau public publié. */
async function show(interaction, view, arg, { refreshPanel = false } = {}) {
	await interaction.update(renderSetup(interaction.guild, view, arg));
	if (refreshPanel) await refreshPublishedPanel(interaction.guild).catch(() => null);
}

function ownCategory(interaction, id) {
	const c = store.getCategory(Number(id));
	return c && c.guild_id === interaction.guild.id ? c : null;
}

export default {
	namespace: 'setup',
	level: 'admin',
	actions: {
		// Menu de navigation présent en bas de chaque page.
		nav: (i) => show(i, i.values[0]),

		go: (i, { args: [view, arg] }) => show(i, view, arg),

		toggle(i, { args: [key] }) {
			const feature = featureByKey(key);
			if (!feature) return ephemeral(i, null, 'Fonctionnalité inconnue.');
			updateSettings(i.guild.id, (s) => { s.features[key] = !s.features[key]; });
			return show(i, feature.group === 'open' ? 'opening' : 'closing');
		},

		edit(i, { args: [key, arg] }) {
			const m = editModal(i.guild, key, arg);
			return m ? i.showModal(m) : ephemeral(i, null, 'Réglage inconnu.');
		},

		async save(i, { args: [key, arg], settings }) {
			const edit = EDITS[key];
			if (!edit) return;

			const result = edit.apply(i.guild, readFields(i, key, arg), arg);
			if (typeof result === 'string') return ephemeral(i, settings.color, `❌ ${result}`);

			return show(i, result?.view ?? edit.view, result?.arg ?? arg, { refreshPanel: edit.panel });
		},

		// Sélecteurs de rôles et de salons de la configuration générale.
		pick(i, { args: [key] }) {
			if (key === 'staffRoles') {
				updateSettings(i.guild.id, (s) => { s.staffRoles = [...i.values]; });
				return show(i, 'general');
			}
			if (CHANNEL_KEYS.includes(key)) {
				updateSettings(i.guild.id, (s) => { s.channels[key] = i.values[0] ?? null; });
				return show(i, 'channels');
			}
		},

		// ─── Catégories ────────────────────────────────────────────────────
		cat: (i) => show(i, 'category', i.values[0]),

		'cat-toggle'(i, { args: [id] }) {
			const c = ownCategory(i, id);
			if (!c) return show(i, 'categories');
			store.updateCategory(c.id, { enabled: !c.enabled });
			return show(i, 'category', c.id, { refreshPanel: true });
		},

		'cat-delete'(i, { args: [id] }) {
			const c = ownCategory(i, id);
			if (c) store.deleteCategory(c.id);
			return show(i, 'categories', null, { refreshPanel: true });
		},

		'cat-roles'(i, { args: [id] }) {
			const c = ownCategory(i, id);
			if (!c) return show(i, 'categories');
			store.updateCategory(c.id, { roles: [...i.values] });
			return show(i, 'category', c.id);
		},

		'cat-parent'(i, { args: [id] }) {
			const c = ownCategory(i, id);
			if (!c) return show(i, 'categories');
			store.updateCategory(c.id, { parent_id: i.values[0] ?? null });
			return show(i, 'category', c.id);
		},

		'cat-move'(i, { args: [id, direction] }) {
			const c = ownCategory(i, id);
			if (!c) return show(i, 'categories');
			store.moveCategory(i.guild.id, c.id, direction);
			return show(i, 'category', c.id, { refreshPanel: true });
		},

		// ─── Panneau public ────────────────────────────────────────────────
		'panel-style'(i) {
			updateSettings(i.guild.id, (s) => { s.panel.style = s.panel.style === 'buttons' ? 'menu' : 'buttons'; });
			return show(i, 'panel', null, { refreshPanel: true });
		},

		async 'panel-publish'(i, { settings }) {
			const channel = i.guild.channels.cache.get(i.values[0]);
			if (!channel?.isTextBased()) return ephemeral(i, settings.color, 'Salon introuvable.');

			const sent = await publishPanel(i.guild, channel).catch((error) => {
				console.warn('[SETUP] publication impossible :', error.message);
				return null;
			});
			if (!sent) return ephemeral(i, settings.color, `❌ Impossible de publier dans ${channel} : vérifie que le bot peut y voir le salon et y écrire.`);

			return show(i, 'panel');
		}
	}
};
