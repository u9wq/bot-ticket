/**
 * Découpage et résolution des arguments des commandes à préfixe.
 */

/**
 * Découpe une ligne en arguments. Les guillemets regroupent plusieurs mots :
 *   add "Support technique" 🛠️  ->  ['add', 'Support technique', '🛠️']
 */
export function tokenize(input) {
	const tokens = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match;
	while ((match = re.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3]);
	return tokens;
}

const USER = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;
const ROLE = /^(?:<@&(\d{17,20})>|(\d{17,20}))$/;
const CHANNEL = /^(?:<#(\d{17,20})>|(\d{17,20}))$/;

const idFrom = (re, arg) => {
	const m = re.exec(String(arg ?? '').trim());
	return m ? (m[1] || m[2]) : null;
};

/**
 * On lit l'argument lui-même, jamais message.mentions : Discord y range
 * l'auteur du message auquel on répond, ce qui ferait viser la mauvaise
 * personne quand la commande est tapée en réponse à quelqu'un.
 */
export async function resolveMember(guild, arg) {
	const id = idFrom(USER, arg);
	return id ? guild.members.fetch(id).catch(() => null) : null;
}

export async function resolveUser(client, arg) {
	const id = idFrom(USER, arg);
	return id ? client.users.fetch(id).catch(() => null) : null;
}

export function resolveRole(guild, arg) {
	const id = idFrom(ROLE, arg);
	return id ? guild.roles.cache.get(id) ?? null : null;
}

export function resolveChannel(guild, arg) {
	const id = idFrom(CHANNEL, arg);
	return id ? guild.channels.cache.get(id) ?? null : null;
}
