import db from '#core/db.js';
import config from '#core/config.js';

/**
 * Réglages d'un serveur.
 *
 * Stockés en un seul document JSON par serveur : ajouter un réglage revient à
 * ajouter une clé dans DEFAULTS, sans migration de schéma. À la lecture, le
 * document est fusionné avec les valeurs par défaut, si bien qu'un serveur
 * configuré avant l'ajout d'une clé en hérite automatiquement.
 */

export const DEFAULTS = {
	prefix: config.defaultPrefix,
	color: config.defaultColor,
	staffRoles: [],
	channels: {
		tickets: null,     // catégorie Discord où s'ouvrent les tickets
		closed: null,      // catégorie où ranger les tickets fermés
		logs: null,
		transcripts: null
	},
	nameFormat: 'ticket-{number}',
	welcome: "Bonjour {user}, merci d'avoir ouvert un ticket.\nExplique ta demande : un membre du staff va te répondre.",
	maxTickets: 1,
	autoCloseHours: 48,
	panel: {
		title: 'Support',
		description: 'Choisis une catégorie ci-dessous pour ouvrir un ticket.',
		placeholder: 'Choisir une catégorie',
		buttonLabel: 'Ouvrir un ticket',
		banner: '',
		style: 'menu',     // 'menu' ou 'buttons'
		channelId: null,
		messageId: null
	},
	features: {
		claim: true,
		pingStaff: true,
		questions: true,
		ticketLimit: true,
		closeConfirm: true,
		closeReason: false,
		memberClose: true,
		archive: true,
		transcript: true,
		transcriptDM: false,
		rating: false,
		autoClose: false
	}
};

const cache = new Map();

const selectRow = db.prepare('SELECT data FROM guild_settings WHERE guild_id = ?');
const upsertRow = db.prepare(`
	INSERT INTO guild_settings (guild_id, data) VALUES (?, ?)
	ON CONFLICT (guild_id) DO UPDATE SET data = excluded.data
`);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Fusion récursive : les objets sont fusionnés, le reste est remplacé. */
function merge(base, override) {
	const out = structuredClone(base);
	for (const [key, value] of Object.entries(override ?? {})) {
		out[key] = isPlainObject(value) && isPlainObject(out[key]) ? merge(out[key], value) : value;
	}
	return out;
}

export function getSettings(guildId) {
	if (cache.has(guildId)) return cache.get(guildId);

	let stored = {};
	try {
		stored = JSON.parse(selectRow.get(guildId)?.data ?? '{}');
	} catch {
		console.warn(`[SETTINGS] réglages illisibles pour ${guildId}, valeurs par défaut utilisées`);
	}

	const settings = merge(DEFAULTS, stored);
	cache.set(guildId, settings);
	return settings;
}

/**
 * Modifie les réglages d'un serveur et les enregistre.
 * `mutate` reçoit l'objet à modifier : updateSettings(id, (s) => { s.prefix = '!'; })
 */
export function updateSettings(guildId, mutate) {
	const settings = getSettings(guildId);
	mutate(settings);
	upsertRow.run(guildId, JSON.stringify(settings));
	return settings;
}
