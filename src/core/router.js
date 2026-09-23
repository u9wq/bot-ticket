import { getSettings } from '#core/settings.js';
import { hasLevel, LEVEL_LABELS } from '#core/perms.js';
import { ephemeral } from '#core/ui.js';

/**
 * Aiguillage des interactions (boutons, menus, modales).
 *
 * Chaque identifiant suit la forme `espace:action:arg1:arg2…`. Un module de
 * src/components déclare un espace et ses actions ; le routeur retrouve la
 * bonne fonction sans chaîne de if. Tout l'état utile tient dans
 * l'identifiant, si bien que les panneaux restent fonctionnels après un
 * redémarrage du bot, sans collecteur ni délai d'expiration.
 *
 * Un module peut exiger un niveau d'accès (`level`) : il est vérifié ici, à
 * chaque clic, et pas seulement à l'envoi du panneau. Sans cela, n'importe qui
 * pourrait cliquer sur un panneau de configuration laissé dans un salon.
 */

const routes = new Map();

export function registerComponents(mod) {
	if (!mod?.namespace || typeof mod.actions !== 'object') return false;
	routes.set(mod.namespace, mod);
	return true;
}

export async function handleComponent(interaction, bot) {
	const [namespace, action, ...args] = interaction.customId.split(':');
	const mod = routes.get(namespace);
	const handler = mod?.actions[action];
	if (!handler) return;

	const settings = interaction.guild ? getSettings(interaction.guild.id) : null;
	const color = settings?.color;

	if (mod.level && interaction.guild && !hasLevel(interaction.member, mod.level, settings)) {
		return ephemeral(interaction, color, `Réservé au niveau **${LEVEL_LABELS[mod.level]}**.`);
	}

	try {
		await handler(interaction, { args, settings, bot });
	} catch (error) {
		console.error(`[COMPONENT] ${interaction.customId} :`, error);
		await ephemeral(interaction, color, 'Une erreur est survenue pendant cette action.');
	}
}
