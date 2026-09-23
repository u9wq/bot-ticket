import { getSettings, updateSettings } from '#core/settings.js';
import { modal, normalizeEmoji } from '#core/ui.js';
import * as store from '#tickets/store.js';

/**
 * Réglages modifiés par formulaire (fenêtre modale).
 *
 * Chaque entrée décrit un réglage de bout en bout :
 *   fields(settings, arg)   champs du formulaire, pré-remplis avec la valeur actuelle
 *   apply(guild, values, arg)  valide et enregistre ; renvoie un message d'erreur,
 *                           ou { view, arg } pour afficher une autre page que `view`
 *   view                    page du panneau à réafficher après enregistrement
 *   panel                   true si le panneau public doit être mis à jour
 *
 * Le bouton `setup:edit:<clé>[:arg]` ouvre le formulaire, sa validation arrive
 * sur `setup:save:<clé>[:arg]`.
 */

const MAX_QUESTION = 45; // une question devient le libellé d'un champ, limité à 45 caractères

const int = (value, min, max) => {
	const n = Number.parseInt(value, 10);
	return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function ownCategory(guild, id) {
	const c = store.getCategory(Number(id));
	return c && c.guild_id === guild.id ? c : null;
}

export const EDITS = {
	prefix: {
		title: 'Préfixe',
		view: 'general',
		fields: (s) => [{ id: 'prefix', label: 'Préfixe des commandes', value: s.prefix, required: true, max: 5, placeholder: '+ ! ? . t!' }],
		apply(guild, v) {
			const prefix = v.prefix.trim();
			if (!prefix || /\s/.test(prefix)) return 'Le préfixe ne peut pas être vide ni contenir d\'espace.';
			updateSettings(guild.id, (s) => { s.prefix = prefix; });
		}
	},

	color: {
		title: 'Couleur',
		view: 'general',
		panel: true,
		fields: (s) => [{ id: 'color', label: 'Couleur hexadécimale', value: s.color, required: true, max: 7, placeholder: '#5865F2' }],
		apply(guild, v) {
			const hex = v.color.trim().replace(/^#?/, '#').toUpperCase();
			if (!/^#[0-9A-F]{6}$/.test(hex)) return 'Couleur invalide. Format attendu : `#RRGGBB`, par exemple `#5865F2`.';
			updateSettings(guild.id, (s) => { s.color = hex; });
		}
	},

	name: {
		title: 'Nom des salons',
		view: 'general',
		fields: (s) => [{
			id: 'format', label: 'Format du nom', value: s.nameFormat, required: true, max: 60,
			description: 'Variables : {number} {user} {category}'
		}],
		apply(guild, v) {
			const format = v.format.trim();
			if (!/\{number\}|\{user\}/.test(format)) return 'Le format doit contenir `{number}` ou `{user}`, sinon tous les tickets porteraient le même nom.';
			updateSettings(guild.id, (s) => { s.nameFormat = format; });
		}
	},

	welcome: {
		title: "Message d'accueil",
		view: 'general',
		fields: (s) => [{
			id: 'welcome', label: "Message d'accueil", value: s.welcome, required: true, long: true, max: 2000,
			description: 'Variables : {user} {username} {category} {number} {server}'
		}],
		apply(guild, v) {
			updateSettings(guild.id, (s) => { s.welcome = v.welcome.trim(); });
		}
	},

	limit: {
		title: 'Limite de tickets',
		view: 'opening',
		fields: (s) => [{ id: 'limit', label: 'Tickets ouverts par membre (1 à 10)', value: s.maxTickets, required: true, max: 2 }],
		apply(guild, v) {
			const n = int(v.limit, 1, 10);
			if (n === null) return 'Indique un nombre entre 1 et 10.';
			updateSettings(guild.id, (s) => { s.maxTickets = n; });
		}
	},

	autoclose: {
		title: 'Fermeture automatique',
		view: 'closing',
		fields: (s) => [{ id: 'hours', label: "Heures d'inactivité (1 à 720)", value: s.autoCloseHours, required: true, max: 3 }],
		apply(guild, v) {
			const n = int(v.hours, 1, 720);
			if (n === null) return 'Indique un nombre d\'heures entre 1 et 720 (30 jours).';
			updateSettings(guild.id, (s) => { s.autoCloseHours = n; });
		}
	},

	panel: {
		title: 'Panneau public',
		view: 'panel',
		panel: true,
		fields: ({ panel: p }) => [
			{ id: 'title', label: 'Titre', value: p.title, max: 100 },
			{ id: 'description', label: 'Description', value: p.description, required: true, long: true, max: 2000 },
			{ id: 'placeholder', label: 'Texte du menu déroulant', value: p.placeholder, required: true, max: 100 },
			{ id: 'buttonLabel', label: "Bouton quand il n'y a aucune catégorie", value: p.buttonLabel, required: true, max: 80 },
			{ id: 'banner', label: 'Bannière (lien d\'image)', value: p.banner, max: 500, placeholder: 'https://…' }
		],
		apply(guild, v) {
			const banner = v.banner.trim();
			if (banner && !/^https?:\/\/\S+$/i.test(banner)) return 'La bannière doit être un lien commençant par `https://`.';
			updateSettings(guild.id, (s) => {
				s.panel.title = v.title.trim();
				s.panel.description = v.description.trim();
				s.panel.placeholder = v.placeholder.trim();
				s.panel.buttonLabel = v.buttonLabel.trim();
				s.panel.banner = banner;
			});
		}
	},

	'cat-create': {
		title: 'Nouvelle catégorie',
		view: 'categories',
		panel: true,
		fields: () => [
			{ id: 'name', label: 'Nom', required: true, max: 80, placeholder: 'Support, Achat, Partenariat…' },
			{ id: 'emoji', label: 'Émoji', max: 64, placeholder: '🛠️ ou <:nom:id>' },
			{ id: 'description', label: 'Description courte', max: 100, description: 'Affichée sous le nom dans le menu.' }
		],
		apply(guild, v) {
			if (store.listCategories(guild.id).length >= 25) return 'Discord limite un menu à 25 choix.';
			const emoji = normalizeEmoji(v.emoji);
			if (v.emoji.trim() && !emoji) return 'Émoji invalide. Utilise un émoji standard ou la forme `<:nom:id>`.';
			const created = store.createCategory(guild.id, { name: v.name.trim(), emoji, description: v.description.trim() || null });
			return { view: 'category', arg: created.id };
		}
	},

	'cat-texts': {
		title: 'Textes de la catégorie',
		view: 'category',
		panel: true,
		fields: (s, id) => {
			const c = store.getCategory(Number(id));
			return [
				{ id: 'name', label: 'Nom', value: c?.name, required: true, max: 80 },
				{ id: 'emoji', label: 'Émoji', value: c?.emoji, max: 64 },
				{ id: 'description', label: 'Description courte', value: c?.description, max: 100 },
				{ id: 'welcome', label: "Message d'accueil", value: c?.welcome, long: true, max: 2000, description: 'Vide = message par défaut. Variables : {user} {category} {number}' }
			];
		},
		apply(guild, v, id) {
			if (!ownCategory(guild, id)) return 'Cette catégorie n\'existe plus.';
			const emoji = normalizeEmoji(v.emoji);
			if (v.emoji.trim() && !emoji) return 'Émoji invalide. Utilise un émoji standard ou la forme `<:nom:id>`.';
			store.updateCategory(Number(id), {
				name: v.name.trim(),
				emoji,
				description: v.description.trim() || null,
				welcome: v.welcome.trim() || null
			});
		}
	},

	'cat-questions': {
		title: 'Formulaire d\'ouverture',
		view: 'category',
		fields: (s, id) => {
			const questions = store.getCategory(Number(id))?.questions ?? [];
			return [0, 1, 2, 3, 4].map((i) => ({
				id: `q${i}`,
				label: `Question ${i + 1}`,
				value: questions[i],
				max: MAX_QUESTION,
				...(i === 0 && { description: 'Laisse vide pour retirer une question. 45 caractères au plus.' })
			}));
		},
		apply(guild, v, id) {
			if (!ownCategory(guild, id)) return 'Cette catégorie n\'existe plus.';
			const questions = [0, 1, 2, 3, 4].map((i) => v[`q${i}`].trim()).filter(Boolean);
			store.updateCategory(Number(id), { questions });
		}
	}
};

/** Construit la fenêtre modale d'un réglage. */
export function editModal(guild, key, arg) {
	const edit = EDITS[key];
	if (!edit) return null;
	const customId = ['setup', 'save', key, arg].filter((x) => x !== undefined).join(':');
	return modal(customId, edit.title, edit.fields(getSettings(guild.id), arg));
}

/** Lit les valeurs soumises d'après les champs déclarés. */
export function readFields(interaction, key, arg) {
	const fields = EDITS[key].fields(getSettings(interaction.guild.id), arg);
	return Object.fromEntries(fields.map((f) => [f.id, interaction.fields.getTextInputValue(f.id) ?? '']));
}
