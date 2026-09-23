import db from '#core/db.js';

/**
 * Accès aux données des tickets, des catégories et de la liste noire.
 *
 * Tout le SQL du bot passe par ce fichier : les colonnes JSON (rôles,
 * questions, membres, réponses) y sont décodées une fois, et le reste du code
 * manipule des objets ordinaires.
 */

const json = (value, fallback) => {
	try {
		return JSON.parse(value ?? '');
	} catch {
		return fallback;
	}
};

// ─── Catégories ────────────────────────────────────────────────────────────

const toCategory = (row) => row && {
	...row,
	enabled: Boolean(row.enabled),
	roles: json(row.roles, []),
	questions: json(row.questions, [])
};

const q = {
	categories: db.prepare('SELECT * FROM categories WHERE guild_id = ? ORDER BY position, id'),
	category: db.prepare('SELECT * FROM categories WHERE id = ?'),
	insertCategory: db.prepare(`
		INSERT INTO categories (guild_id, name, emoji, description, position)
		VALUES (@guild_id, @name, @emoji, @description,
			(SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE guild_id = @guild_id))
	`),
	deleteCategory: db.prepare('DELETE FROM categories WHERE id = ?'),

	ticketById: db.prepare('SELECT * FROM tickets WHERE id = ?'),
	ticketByChannel: db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
	openByOwner: db.prepare(`SELECT * FROM tickets WHERE guild_id = ? AND owner_id = ? AND status IN ('open', 'pending')`),
	openTickets: db.prepare(`SELECT * FROM tickets WHERE status = 'open'`),
	nextNumber: db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM tickets WHERE guild_id = ?'),
	insertTicket: db.prepare(`
		INSERT INTO tickets (guild_id, number, owner_id, category_id, answers, created_at, last_activity)
		VALUES (@guild_id, @number, @owner_id, @category_id, @answers, @now, @now)
	`),
	deleteTicket: db.prepare('DELETE FROM tickets WHERE id = ?'),
	touch: db.prepare(`UPDATE tickets SET last_activity = ? WHERE channel_id = ? AND status = 'open'`),
	closeIfOpen: db.prepare(`
		UPDATE tickets SET status = 'closed', closed_at = @now, closed_by = @by, close_reason = @reason
		WHERE id = @id AND status = 'open'
	`),
	reopenIfClosed: db.prepare(`
		UPDATE tickets SET status = 'open', closed_at = NULL, closed_by = NULL, close_reason = NULL,
			closed_message = NULL, last_activity = @now
		WHERE id = @id AND status = 'closed'
	`),

	blacklisted: db.prepare('SELECT * FROM blacklist WHERE guild_id = ? AND user_id = ?'),
	blacklist: db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY added_at DESC'),
	addBlacklist: db.prepare(`
		INSERT INTO blacklist (guild_id, user_id, reason, added_by, added_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = excluded.reason, added_by = excluded.added_by, added_at = excluded.added_at
	`),
	removeBlacklist: db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?'),

	stats: db.prepare(`
		SELECT
			COUNT(*) AS total,
			SUM(status = 'open') AS open,
			SUM(status IN ('closed', 'deleted')) AS closed,
			AVG(rating) AS rating,
			COUNT(rating) AS ratings
		FROM tickets WHERE guild_id = ? AND status != 'pending'
	`),
	topClaimers: db.prepare(`
		SELECT claimed_by AS user_id, COUNT(*) AS count FROM tickets
		WHERE guild_id = ? AND claimed_by IS NOT NULL
		GROUP BY claimed_by ORDER BY count DESC LIMIT 5
	`)
};

export const listCategories = (guildId) => q.categories.all(guildId).map(toCategory);
export const getCategory = (id) => toCategory(q.category.get(id));

export function createCategory(guildId, { name, emoji = null, description = null }) {
	const { lastInsertRowid } = q.insertCategory.run({ guild_id: guildId, name, emoji, description });
	return getCategory(lastInsertRowid);
}

const CATEGORY_COLUMNS = ['name', 'emoji', 'description', 'welcome', 'parent_id', 'roles', 'questions', 'position', 'enabled'];

export function updateCategory(id, changes) {
	const entries = Object.entries(changes).filter(([key]) => CATEGORY_COLUMNS.includes(key));
	if (!entries.length) return getCategory(id);

	const values = Object.fromEntries(entries.map(([key, value]) => [
		key,
		Array.isArray(value) ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value
	]));
	const set = entries.map(([key]) => `${key} = @${key}`).join(', ');
	db.prepare(`UPDATE categories SET ${set} WHERE id = @id`).run({ ...values, id });
	return getCategory(id);
}

export const deleteCategory = (id) => q.deleteCategory.run(id);

/** Échange la position d'une catégorie avec sa voisine. */
export const moveCategory = db.transaction((guildId, id, direction) => {
	const list = listCategories(guildId);
	const index = list.findIndex((c) => c.id === id);
	const target = index + (direction === 'up' ? -1 : 1);
	if (index < 0 || target < 0 || target >= list.length) return false;

	[list[index], list[target]] = [list[target], list[index]];
	list.forEach((c, position) => updateCategory(c.id, { position }));
	return true;
});

// ─── Tickets ───────────────────────────────────────────────────────────────

const toTicket = (row) => row && {
	...row,
	members: json(row.members, []),
	answers: json(row.answers, [])
};

export const getTicket = (id) => toTicket(q.ticketById.get(id));
export const getTicketByChannel = (channelId) => toTicket(q.ticketByChannel.get(channelId));
export const openTicketsOf = (guildId, userId) => q.openByOwner.all(guildId, userId).map(toTicket);
export const allOpenTickets = () => q.openTickets.all().map(toTicket);

/**
 * Réserve un numéro de ticket avant la création du salon. Le numéro est
 * attribué dans une transaction : deux ouvertures simultanées ne peuvent pas
 * recevoir le même, ce qu'un calcul fait après la création du salon permettait.
 */
export const reserveTicket = db.transaction(({ guildId, ownerId, categoryId, answers }) => {
	const { n } = q.nextNumber.get(guildId);
	const { lastInsertRowid } = q.insertTicket.run({
		guild_id: guildId,
		number: n,
		owner_id: ownerId,
		category_id: categoryId ?? null,
		answers: JSON.stringify(answers ?? []),
		now: Date.now()
	});
	return getTicket(lastInsertRowid);
});

export const discardTicket = (id) => q.deleteTicket.run(id);

const TICKET_COLUMNS = ['channel_id', 'status', 'members', 'claimed_by', 'control_message', 'closed_message', 'rating'];

export function updateTicket(id, changes) {
	const entries = Object.entries(changes).filter(([key]) => TICKET_COLUMNS.includes(key));
	if (!entries.length) return getTicket(id);

	const values = Object.fromEntries(entries.map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : value]));
	const set = entries.map(([key]) => `${key} = @${key}`).join(', ');
	db.prepare(`UPDATE tickets SET ${set} WHERE id = @id`).run({ ...values, id });
	return getTicket(id);
}

export const touchTicket = (channelId) => q.touch.run(Date.now(), channelId);

/** Passe le ticket à « fermé » s'il était ouvert. Renvoie false s'il l'était déjà. */
export const markClosed = (id, by, reason) =>
	q.closeIfOpen.run({ id, by, reason: reason ?? null, now: Date.now() }).changes === 1;

export const markReopened = (id) => q.reopenIfClosed.run({ id, now: Date.now() }).changes === 1;

// ─── Liste noire ───────────────────────────────────────────────────────────

export const getBlacklist = (guildId, userId) => q.blacklisted.get(guildId, userId);
export const listBlacklist = (guildId) => q.blacklist.all(guildId);
export const addBlacklist = (guildId, userId, reason, by) => q.addBlacklist.run(guildId, userId, reason ?? null, by, Date.now());
export const removeBlacklist = (guildId, userId) => q.removeBlacklist.run(guildId, userId).changes === 1;

// ─── Statistiques ──────────────────────────────────────────────────────────

export function stats(guildId) {
	return { ...q.stats.get(guildId), topClaimers: q.topClaimers.all(guildId) };
}
