import { getSettings } from '#core/settings.js';
import { hasLevel, LEVEL_LABELS } from '#core/perms.js';
import { tokenize } from '#core/args.js';
import { say } from '#core/ui.js';
import * as store from '#tickets/store.js';

/**
 * Registre et répartiteur des commandes à préfixe.
 *
 * Une commande est un module de src/commands qui exporte :
 *   { name, aliases?, description, usage?, level, ticket?, run(ctx) }
 *
 * `level` ('everyone' | 'staff' | 'admin') est contrôlé ici, avant l'appel :
 * aucune commande ne répète sa propre vérification. `ticket: true` exige que
 * la commande soit tapée dans un ticket ; le ticket et sa catégorie sont alors
 * fournis dans le contexte, et les rôles de la catégorie comptent comme staff.
 */

export const commands = new Map();   // nom -> commande
const aliases = new Map();           // nom ou alias -> nom

export function registerCommand(command, group) {
	if (!command?.name || typeof command.run !== 'function') return false;
	command.group = group;
	command.level ??= 'everyone';
	commands.set(command.name, command);
	for (const name of [command.name, ...(command.aliases ?? [])]) aliases.set(name.toLowerCase(), command.name);
	return true;
}

export const findCommand = (name) => commands.get(aliases.get(String(name).toLowerCase()));

/**
 * Deux façons d'appeler une commande : le préfixe du serveur, ou une mention
 * du bot. La mention sert de filet quand on a oublié le préfixe choisi.
 */
export async function dispatch(message, bot) {
	const settings = getSettings(message.guild.id);
	const { prefix, color } = settings;
	const mention = new RegExp(`^<@!?${bot.user.id}>\\s*`);

	let content;
	if (message.content.startsWith(prefix)) {
		content = message.content.slice(prefix.length);
	} else if (mention.test(message.content)) {
		content = message.content.replace(mention, '');
		if (!content.trim()) {
			return say(message, color, `Mon préfixe ici est \`${prefix}\`. Tape \`${prefix}help\` pour voir les commandes.`);
		}
	} else {
		return;
	}

	const [name = ''] = content.trimStart().split(/\s+/);
	const command = name && findCommand(name);
	if (!command) return;

	const raw = content.trimStart().slice(name.length).trim();
	const ctx = {
		bot,
		message,
		guild: message.guild,
		member: message.member,
		settings,
		prefix,
		args: tokenize(raw),
		raw,
		reply: (text) => say(message, color, text)
	};

	if (command.ticket) {
		ctx.ticket = store.getTicketByChannel(message.channel.id);
		if (!ctx.ticket || ctx.ticket.status === 'deleted') {
			return ctx.reply('Cette commande se tape dans un ticket.');
		}
		ctx.category = ctx.ticket.category_id ? store.getCategory(ctx.ticket.category_id) : null;
	}

	if (!hasLevel(message.member, command.level, settings, ctx.category)) {
		return ctx.reply(`Cette commande est réservée au niveau **${LEVEL_LABELS[command.level]}**.`);
	}

	try {
		await command.run(ctx);
	} catch (error) {
		console.error(`[COMMAND] ${command.name} :`, error);
		await ctx.reply(`La commande a échoué. Utilisation : \`${prefix}${command.name} ${command.usage ?? ''}\``.trim());
	}
}
