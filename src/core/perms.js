import { PermissionFlagsBits } from 'discord.js';
import config from '#core/config.js';

/**
 * Trois niveaux d'accès, du plus large au plus restreint :
 *
 *   everyone  tout le monde (ouvrir un ticket, l'aide)
 *   staff     rôles staff du serveur, ou rôles propres à la catégorie du ticket
 *   admin     permission « Gérer le serveur », propriétaire du serveur, ou
 *             propriétaire du bot déclaré dans OWNERS
 *
 * Chaque niveau inclut les suivants : un admin est aussi staff. On s'appuie sur
 * les permissions natives de Discord pour l'admin plutôt que sur une liste à
 * entretenir : quiconque peut gérer le serveur peut déjà tout casser.
 */
export const LEVELS = { everyone: 0, staff: 1, admin: 2 };

export const LEVEL_LABELS = { everyone: 'Tout le monde', staff: 'Staff', admin: 'Admin' };

export function isOwner(userId) {
	return config.owners.includes(userId);
}

export function isAdmin(member) {
	if (!member) return false;
	return isOwner(member.id)
		|| member.guild.ownerId === member.id
		|| member.permissions.has(PermissionFlagsBits.ManageGuild);
}

/** Rôles qui donnent accès à un ticket : staff global + rôles de la catégorie. */
export function staffRolesFor(settings, category) {
	return [...new Set([...settings.staffRoles, ...(category?.roles ?? [])])];
}

export function isStaff(member, settings, category) {
	if (isAdmin(member)) return true;
	const roles = staffRolesFor(settings, category);
	return roles.some((id) => member.roles.cache.has(id));
}

export function hasLevel(member, level, settings, category) {
	if (level === 'admin') return isAdmin(member);
	if (level === 'staff') return isStaff(member, settings, category);
	return true;
}
