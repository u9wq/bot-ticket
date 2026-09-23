import {
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	SeparatorSpacingSize,
	TextInputBuilder,
	TextInputStyle,
	parseEmoji
} from 'discord.js';

/**
 * Boîte à outils d'affichage.
 *
 * Tous les messages du bot sont des Components V2 : un conteneur dans lequel
 * texte, séparateurs, boutons et menus sont des enfants au même niveau. Les
 * commandes et les panneaux décrivent ce qu'ils veulent afficher avec panel(),
 * sans manipuler les builders de discord.js.
 *
 * À savoir : le drapeau IsComponentsV2 interdit `content` et `embeds`. Les
 * mentions vont donc dans un bloc de texte, et ne notifient que ce que
 * `allowedMentions` autorise explicitement (rien par défaut, voir v2()).
 */

export function resolveColor(color, fallback = 0x5865F2) {
	if (typeof color === 'number') return color;
	const hex = parseInt(String(color ?? '').replace('#', ''), 16);
	return Number.isNaN(hex) ? fallback : hex;
}

/** Constructeur fluide d'un conteneur. `.build()` renvoie le ContainerBuilder. */
export function panel(color) {
	const container = new ContainerBuilder().setAccentColor(resolveColor(color));

	const api = {
		text(content) {
			if (content) container.addTextDisplayComponents((t) => t.setContent(String(content).slice(0, 4000)));
			return api;
		},
		/** Texte accompagné d'un bouton aligné à droite. */
		section(content, button) {
			container.addSectionComponents((s) => s
				.addTextDisplayComponents((t) => t.setContent(String(content).slice(0, 4000)))
				.setButtonAccessory(button));
			return api;
		},
		separator({ divider = true, large = false } = {}) {
			container.addSeparatorComponents((s) => s
				.setDivider(divider)
				.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
			return api;
		},
		row(...components) {
			const list = components.flat().filter(Boolean);
			if (list.length) container.addActionRowComponents((r) => r.setComponents(list));
			return api;
		},
		image(url) {
			if (url) container.addMediaGalleryComponents((g) => g.addItems((i) => i.setURL(url)));
			return api;
		},
		build: () => container
	};

	return api;
}

/** Conteneur d'une seule ligne de texte, pour les réponses courtes. */
export const notice = (color, content) => panel(color).text(content).build();

/** Charge utile d'un message Components V2. Aucune mention par défaut. */
export function v2(containers, extra = {}) {
	const { ephemeral, ...rest } = extra;
	return {
		components: [containers].flat(),
		flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
		allowedMentions: { parse: [] },
		...rest
	};
}

/** Répond à une commande à préfixe. */
export function say(message, color, content) {
	return message.reply(v2(notice(color, content), {
		allowedMentions: { parse: [], repliedUser: false }
	})).catch(() => message.channel.send(v2(notice(color, content))).catch(() => null));
}

/**
 * Réponse éphémère à une interaction, quel que soit son état : une interaction
 * déjà différée ou déjà répondue n'accepte plus reply().
 */
export function ephemeral(interaction, color, content) {
	const payload = v2(notice(color, content), { ephemeral: true });
	if (interaction.deferred) return interaction.editReply(payload).catch(() => null);
	if (interaction.replied) return interaction.followUp(payload).catch(() => null);
	return interaction.reply(payload).catch(() => null);
}

export function button(customId, label, { style = ButtonStyle.Secondary, emoji, disabled = false } = {}) {
	const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
	if (emoji) b.setEmoji(emoji);
	return b;
}

export function linkButton(url, label) {
	return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
}

/** Bouton interrupteur : vert quand actif, gris sinon. */
export function toggle(customId, enabled) {
	return button(customId, enabled ? 'Activé' : 'Désactivé', {
		style: enabled ? ButtonStyle.Success : ButtonStyle.Secondary
	});
}

/**
 * Fenêtre modale à champs texte.
 * fields : [{ id, label, description?, long?, value?, required?, max?, min?, placeholder? }]
 */
export function modal(customId, title, fields) {
	const m = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));

	for (const f of fields.slice(0, 5)) {
		const input = new TextInputBuilder()
			.setCustomId(f.id)
			.setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
			.setRequired(f.required ?? false)
			.setMaxLength(f.max ?? (f.long ? 4000 : 100));
		if (f.min) input.setMinLength(f.min);
		if (f.placeholder) input.setPlaceholder(f.placeholder.slice(0, 100));
		// setValue('') est refusé par la validation : un champ vide reste sans valeur.
		if (f.value !== undefined && f.value !== null && String(f.value) !== '') {
			input.setValue(String(f.value).slice(0, f.max ?? 4000));
		}

		const label = new LabelBuilder().setLabel(f.label.slice(0, 45)).setTextInputComponent(input);
		if (f.description) label.setDescription(f.description.slice(0, 100));
		m.addLabelComponents(label);
	}

	return m;
}

/**
 * Vérifie un émoji saisi par un utilisateur. Accepte un émoji Unicode ou un
 * émoji personnalisé `<:nom:id>`. Renvoie la forme à stocker, ou null.
 */
export function normalizeEmoji(input) {
	const value = String(input ?? '').trim();
	if (!value) return null;
	if (/^<a?:\w{2,32}:\d{17,20}>$/.test(value)) return value;
	if (/^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*$/u.test(value)) return value;
	if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(value)) return value; // drapeaux
	return null;
}

/** Forme attendue par setEmoji() et les options de menu. */
export const emojiData = (emoji) => (emoji ? parseEmoji(emoji) : undefined);

export const timestamp = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

export { ButtonStyle };
