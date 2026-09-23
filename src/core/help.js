import { StringSelectMenuBuilder } from 'discord.js';
import { commands } from '#core/commands.js';
import { LEVEL_LABELS } from '#core/perms.js';
import { panel, v2 } from '#core/ui.js';

/**
 * Aide interactive : une page d'accueil et une page par groupe de commandes,
 * parcourues avec un menu. Le groupe est le dossier de la commande.
 */

export const GROUPS = {
	general: { label: 'Général', emoji: '📖', description: 'Aide et informations' },
	tickets: { label: 'Tickets', emoji: '🎫', description: 'À utiliser dans un ticket' },
	staff: { label: 'Staff', emoji: '🛡️', description: 'Liste noire et statistiques' },
	config: { label: 'Configuration', emoji: '⚙️', description: 'Réglages du bot' }
};

function menu(current) {
	return new StringSelectMenuBuilder()
		.setCustomId('help:group')
		.setPlaceholder('Choisir une catégorie de commandes')
		.addOptions([
			{ label: 'Accueil', value: 'home', emoji: '🏠', default: current === 'home' },
			...Object.entries(GROUPS).map(([id, g]) => ({ label: g.label, value: id, emoji: g.emoji, description: g.description, default: current === id }))
		]);
}

const usage = (prefix, c) => `\`${prefix}${c.name}${c.usage ? ` ${c.usage}` : ''}\``;

export function helpView(settings, group = 'home') {
	const { prefix, color } = settings;
	const p = panel(color);

	if (group === 'home' || !GROUPS[group]) {
		p.text([
			'## 🎫 Aide',
			`Préfixe : \`${prefix}\` · mentionner le bot fonctionne aussi.`,
			`Détail d'une commande : \`${prefix}help <commande>\``
		].join('\n'))
			.separator()
			.text(Object.entries(GROUPS).map(([id, g]) => {
				const count = [...commands.values()].filter((c) => c.group === id).length;
				return `${g.emoji} **${g.label}** · ${count} commande${count > 1 ? 's' : ''}\n-# ${g.description}`;
			}).join('\n'))
			.separator()
			.text(`-# Toute la configuration se fait depuis \`${prefix}setup\`, avec des boutons et des menus.`);
	} else {
		const list = [...commands.values()].filter((c) => c.group === group);
		p.text(`## ${GROUPS[group].emoji} ${GROUPS[group].label}`)
			.separator()
			.text(list.map((c) => `${usage(prefix, c)}\n-# ${c.description} · ${LEVEL_LABELS[c.level]}`).join('\n'));
	}

	return v2(p.row(menu(group)).build());
}

export function commandHelp(settings, command) {
	const { prefix, color } = settings;
	return v2(panel(color).text([
		`## ${prefix}${command.name}`,
		command.description,
		'',
		`**Utilisation** ${usage(prefix, command)}`,
		command.aliases?.length ? `**Alias** ${command.aliases.map((a) => `\`${a}\``).join(' ')}` : null,
		`**Accès** ${LEVEL_LABELS[command.level]}${command.ticket ? ' · dans un ticket' : ''}`
	].filter((l) => l !== null).join('\n')).build());
}
