import {
	ChannelSelectMenuBuilder,
	ChannelType,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder
} from 'discord.js';
import { VERSION } from '#core/config.js';
import { getSettings } from '#core/settings.js';
import { panel, button, toggle, v2, ButtonStyle, emojiData, linkButton } from '#core/ui.js';
import { FEATURES } from '#tickets/features.js';
import { listCategories, getCategory } from '#tickets/store.js';
import { panelUrl } from '#tickets/publish.js';

/**
 * Pages du panneau de configuration (+setup).
 *
 * Chaque page est une fonction pure des réglages : après n'importe quelle
 * interaction, on reconstruit la page entière et on remplace le message. Il
 * n'y a donc aucun état à synchroniser entre l'affichage et la base.
 *
 * Contrainte Discord : 40 composants au plus par message, conteneur compris.
 * Les fonctionnalités sont donc réparties sur deux pages (ouverture et
 * fermeture) plutôt qu'une seule qui dépasserait la limite.
 */

export const PAGES = [
	{ id: 'home', label: 'Accueil', emoji: '🏠', description: "Vue d'ensemble et mise en route" },
	{ id: 'general', label: 'Général', emoji: '⚙️', description: 'Préfixe, couleur, rôles staff, accueil' },
	{ id: 'channels', label: 'Salons', emoji: '📁', description: 'Catégories Discord, logs, transcriptions' },
	{ id: 'opening', label: 'Ouverture', emoji: '📥', description: 'Prise en charge, formulaire, limite' },
	{ id: 'closing', label: 'Fermeture', emoji: '🔒', description: 'Confirmation, archivage, transcription, avis' },
	{ id: 'categories', label: 'Catégories de tickets', emoji: '🗂️', description: 'Choix proposés dans le panneau public' },
	{ id: 'panel', label: 'Panneau public', emoji: '📣', description: 'Textes, style et publication' }
];

// Page du menu à mettre en surbrillance pour les sous-pages.
const PARENT = { category: 'categories', 'category-delete': 'categories' };

function nav(current) {
	const active = PARENT[current] ?? current;
	return new StringSelectMenuBuilder()
		.setCustomId('setup:nav')
		.setPlaceholder('Aller à…')
		.addOptions(PAGES.map((p) => ({
			label: p.label,
			value: p.id,
			description: p.description,
			emoji: p.emoji,
			default: p.id === active
		})));
}

const header = (emoji, title, subtitle) => `## ${emoji} ${title}${subtitle ? `\n-# ${subtitle}` : ''}`;
const check = (ok) => (ok ? '✅' : '⬜');
const channelRef = (guild, id) => (id && guild.channels.cache.has(id) ? `<#${id}>` : null);
const preview = (text, max = 180) => {
	const t = String(text ?? '').trim();
	return t.length > max ? `${t.slice(0, max)}…` : t;
};
const quote = (text) => preview(text).split('\n').map((l) => `> ${l}`).join('\n');

function roleSelect(customId, guild, selected, placeholder) {
	const menu = new RoleSelectMenuBuilder()
		.setCustomId(customId)
		.setPlaceholder(placeholder)
		.setMinValues(0)
		.setMaxValues(25);
	const existing = selected.filter((id) => guild.roles.cache.has(id));
	if (existing.length) menu.setDefaultRoles(existing);
	return menu;
}

function channelSelect(customId, guild, selected, placeholder, types) {
	const menu = new ChannelSelectMenuBuilder()
		.setCustomId(customId)
		.setPlaceholder(placeholder)
		.setChannelTypes(types)
		.setMinValues(0)
		.setMaxValues(1);
	if (selected && guild.channels.cache.has(selected)) menu.setDefaultChannels([selected]);
	return menu;
}

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// ─── Pages ─────────────────────────────────────────────────────────────────

function home(guild, s) {
	const categories = listCategories(guild.id);
	const url = panelUrl(guild);
	const active = FEATURES.filter((f) => s.features[f.key]).length;

	const steps = [
		`${check(s.staffRoles.length)} **Rôles staff** — ${s.staffRoles.length ? s.staffRoles.map((id) => `<@&${id}>`).join(' ') : 'aucun, seuls les admins voient les tickets'}`,
		`${check(channelRef(guild, s.channels.tickets))} **Catégorie des tickets** — ${channelRef(guild, s.channels.tickets) ?? 'aucune, les tickets s\'ouvrent hors catégorie'}`,
		`${check(channelRef(guild, s.channels.logs))} **Salon de logs** — ${channelRef(guild, s.channels.logs) ?? 'aucun'}`,
		`${check(categories.length)} **Catégories de tickets** — ${categories.length || 'aucune, un simple bouton sera affiché'}`,
		`${check(url)} **Panneau publié** — ${url ? `dans <#${s.panel.channelId}>` : 'pas encore'}`
	];

	const p = panel(s.color)
		.text(header('🎫', 'Configuration des tickets', 'Chaque changement est enregistré immédiatement.'))
		.separator()
		.text(`**Mise en route**\n${steps.join('\n')}`)
		.separator()
		.text([
			`Préfixe \`${s.prefix}\` · Couleur \`${s.color}\` · Fonctionnalités actives **${active}/${FEATURES.length}**`,
			`-# bot-ticket v${VERSION} · \`${s.prefix}help\` pour la liste des commandes`
		].join('\n'))
		.separator();

	if (url) p.row(linkButton(url, 'Voir le panneau publié'));
	return p.row(nav('home')).build();
}

function general(guild, s) {
	return panel(s.color)
		.text(header('⚙️', 'Général'))
		.separator()
		.section(`**Préfixe** \`${s.prefix}\`\n-# Mentionner le bot fonctionne aussi, par exemple si le préfixe est oublié.`,
			button('setup:edit:prefix', 'Modifier'))
		.section(`**Couleur** \`${s.color}\`\n-# Barre latérale des panneaux et des messages du bot.`,
			button('setup:edit:color', 'Modifier'))
		.section(`**Nom des salons** \`${s.nameFormat}\`\n-# Variables : \`{number}\` \`{user}\` \`{category}\``,
			button('setup:edit:name', 'Modifier'))
		.section(`**Message d'accueil**\n${quote(s.welcome)}\n-# Remplacé par celui de la catégorie s'il existe. Variables : \`{user}\` \`{category}\` \`{number}\``,
			button('setup:edit:welcome', 'Modifier'))
		.separator()
		.text('**Rôles staff**\n-# Voient tous les tickets et ont accès aux commandes staff. Les admins y ont toujours accès.')
		.row(roleSelect('setup:pick:staffRoles', guild, s.staffRoles, 'Choisir les rôles staff'))
		.separator()
		.row(nav('general'))
		.build();
}

function channels(guild, s) {
	const target = s.channels.tickets && guild.channels.cache.get(s.channels.tickets);
	const canCreate = !target || guild.members.me.permissionsIn(target).has(PermissionFlagsBits.ManageChannels);

	return panel(s.color)
		.text(header('📁', 'Salons'))
		.separator()
		.text(`**Catégorie des tickets**\n-# Où les tickets sont créés. Une catégorie de ticket peut en avoir une dédiée.${canCreate ? '' : '\n⚠️ Le bot n\'a pas la permission « Gérer les salons » dans cette catégorie.'}`)
		.row(channelSelect('setup:pick:tickets', guild, s.channels.tickets, 'Choisir une catégorie', [ChannelType.GuildCategory]))
		.text('**Catégorie des tickets fermés**\n-# Facultatif. Les tickets archivés y sont déplacés, et ramenés à la réouverture.')
		.row(channelSelect('setup:pick:closed', guild, s.channels.closed, 'Aucune', [ChannelType.GuildCategory]))
		.text('**Salon de logs**\n-# Ouvertures, fermetures, prises en charge, avis…')
		.row(channelSelect('setup:pick:logs', guild, s.channels.logs, 'Aucun', TEXT_CHANNELS))
		.text('**Salon des transcriptions**\n-# Facultatif. Sans lui, les transcriptions sont jointes aux logs.')
		.row(channelSelect('setup:pick:transcripts', guild, s.channels.transcripts, 'Aucun', TEXT_CHANNELS))
		.separator()
		.row(nav('channels'))
		.build();
}

function featurePage(page, emoji, title, subtitle, extraButtons) {
	return (guild, s) => {
		const p = panel(s.color).text(header(emoji, title, subtitle)).separator();

		for (const f of FEATURES.filter((x) => x.group === page)) {
			p.section(`**${f.label}**\n-# ${f.description(s)}`, toggle(`setup:toggle:${f.key}`, s.features[f.key]));
		}

		return p.separator().row(extraButtons).row(nav(page === 'open' ? 'opening' : 'closing')).build();
	};
}

const opening = featurePage('open', '📥', 'Ouverture', 'Clique sur un interrupteur pour activer ou désactiver.', [
	button('setup:edit:limit', 'Modifier la limite', { emoji: '🔢' })
]);

const closing = featurePage('close', '🔒', 'Fermeture', 'Clique sur un interrupteur pour activer ou désactiver.', [
	button('setup:edit:autoclose', 'Modifier le délai d\'inactivité', { emoji: '⏱️' })
]);

function categories(guild, s) {
	const list = listCategories(guild.id);

	const lines = list.map((c, i) => {
		const details = [
			c.roles.length && `${c.roles.length} rôle${c.roles.length > 1 ? 's' : ''}`,
			c.questions.length && `${c.questions.length} question${c.questions.length > 1 ? 's' : ''}`,
			c.parent_id && `dans <#${c.parent_id}>`
		].filter(Boolean).join(' · ');
		return `\`${i + 1}.\` ${c.emoji ?? '▫️'} **${c.name}**${c.enabled ? '' : ' *(désactivée)*'}${details ? `\n-# ${details}` : ''}`;
	});

	const p = panel(s.color)
		.text(header('🗂️', 'Catégories de tickets', 'Choix proposés dans le panneau public. Chacune peut avoir ses rôles, sa catégorie Discord et son formulaire.'))
		.separator()
		.text(lines.length ? lines.join('\n') : "Aucune catégorie : le panneau public affichera un simple bouton d'ouverture.")
		.separator();

	if (list.length) {
		p.row(new StringSelectMenuBuilder()
			.setCustomId('setup:cat')
			.setPlaceholder('Modifier une catégorie…')
			.addOptions(list.slice(0, 25).map((c) => ({
				label: c.name.slice(0, 100),
				value: String(c.id),
				description: (c.description || (c.enabled ? 'Active' : 'Désactivée')).slice(0, 100),
				...(c.emoji && { emoji: emojiData(c.emoji) })
			}))));
	}

	return p
		.row(button('setup:edit:cat-create', 'Ajouter une catégorie', { style: ButtonStyle.Success, emoji: '➕', disabled: list.length >= 25 }))
		.row(nav('categories'))
		.build();
}

function category(guild, s, id) {
	const c = getCategory(Number(id));
	if (!c || c.guild_id !== guild.id) return categories(guild, s);

	const list = listCategories(guild.id);
	const index = list.findIndex((x) => x.id === c.id);
	const parent = channelRef(guild, c.parent_id);

	const details = [
		`**Message d'accueil**\n${c.welcome ? quote(c.welcome) : '-# Celui par défaut (page Général).'}`,
		`**Formulaire** (${c.questions.length}/5)\n${c.questions.length ? c.questions.map((q, i) => `\`${i + 1}.\` ${q}`).join('\n') : '-# Aucune question.'}${c.questions.length && !s.features.questions ? '\n⚠️ Le formulaire est désactivé dans la page Ouverture.' : ''}`,
		`**État** ${c.enabled ? 'Active' : 'Désactivée, masquée du panneau public'}`
	];

	return panel(s.color)
		.text(`## ${c.emoji ?? '🗂️'} ${c.name}\n${c.description ? c.description : '-# Pas de description.'}`)
		.separator()
		.text(details.join('\n\n'))
		.row(
			button(`setup:edit:cat-texts:${c.id}`, 'Textes', { emoji: '✏️' }),
			button(`setup:edit:cat-questions:${c.id}`, 'Formulaire', { emoji: '❓' }),
			button(`setup:cat-toggle:${c.id}`, c.enabled ? 'Désactiver' : 'Activer', { style: c.enabled ? ButtonStyle.Secondary : ButtonStyle.Success }),
			button(`setup:go:category-delete:${c.id}`, 'Supprimer', { style: ButtonStyle.Danger, emoji: '🗑️' })
		)
		.separator()
		.text('**Rôles de la catégorie**\n-# Ont accès à ces tickets, en plus des rôles staff.')
		.row(roleSelect(`setup:cat-roles:${c.id}`, guild, c.roles, 'Aucun rôle supplémentaire'))
		.text(`**Catégorie Discord dédiée**\n-# ${parent ? 'Les tickets de ce type y sont créés.' : 'Aucune : la catégorie des tickets par défaut est utilisée.'}`)
		.row(channelSelect(`setup:cat-parent:${c.id}`, guild, c.parent_id, 'Par défaut', [ChannelType.GuildCategory]))
		.separator()
		.row(
			button('setup:go:categories', 'Retour', { emoji: '⬅️' }),
			button(`setup:cat-move:${c.id}:up`, 'Monter', { emoji: '🔼', disabled: index <= 0 }),
			button(`setup:cat-move:${c.id}:down`, 'Descendre', { emoji: '🔽', disabled: index >= list.length - 1 })
		)
		.row(nav('category'))
		.build();
}

function categoryDelete(guild, s, id) {
	const c = getCategory(Number(id));
	if (!c || c.guild_id !== guild.id) return categories(guild, s);

	return panel(s.color)
		.text(`## 🗑️ Supprimer ${c.name} ?\nLa catégorie disparaît du panneau public. Les tickets déjà ouverts ne sont pas touchés.`)
		.separator()
		.row(
			button(`setup:cat-delete:${c.id}`, 'Supprimer', { style: ButtonStyle.Danger }),
			button(`setup:go:category:${c.id}`, 'Annuler')
		)
		.build();
}

function panelPage(guild, s) {
	const url = panelUrl(guild);
	const { panel: cfg } = s;

	return panel(s.color)
		.text(header('📣', 'Panneau public', 'Le message que les membres utilisent pour ouvrir un ticket.'))
		.separator()
		.text([
			`**Titre** ${cfg.title || '*aucun*'}`,
			`**Description**\n${quote(cfg.description)}`,
			`**Style** ${cfg.style === 'buttons' ? 'Boutons' : 'Menu déroulant'} · **Texte du menu** ${cfg.placeholder}`,
			`**Bouton sans catégorie** ${cfg.buttonLabel}`,
			`**Bannière** ${cfg.banner ? `[image](${cfg.banner})` : '*aucune*'}`,
			`**Publié** ${url ? `dans <#${cfg.channelId}>, mis à jour automatiquement à chaque modification` : '*pas encore*'}`
		].join('\n'))
		.row(
			button('setup:edit:panel', 'Textes', { emoji: '✏️' }),
			button('setup:panel-style', cfg.style === 'buttons' ? 'Passer en menu' : 'Passer en boutons', { emoji: '🔁' }),
			url ? linkButton(url, 'Voir') : null
		)
		.separator()
		.text('**Publier**\n-# Choisis un salon : le panneau y est envoyé et l\'ancien est retiré.')
		.row(channelSelect('setup:panel-publish', guild, null, 'Publier dans…', TEXT_CHANNELS).setMinValues(1))
		.separator()
		.row(nav('panel'))
		.build();
}

const VIEWS = {
	home,
	general,
	channels,
	opening,
	closing,
	categories,
	category,
	'category-delete': categoryDelete,
	panel: panelPage
};

/** Charge utile complète d'une page, prête pour send() ou update(). */
export function renderSetup(guild, view = 'home', arg) {
	const render = VIEWS[view] ?? home;
	return v2(render(guild, getSettings(guild.id), arg));
}
