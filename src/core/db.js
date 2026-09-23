import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '#core/config.js';

/**
 * Base SQLite synchrone.
 *
 * better-sqlite3 plutôt que sqlite3 : les requêtes renvoient directement leur
 * résultat, sans callback ni promesse à envelopper. Pour un bot qui fait des
 * lectures courtes et locales, l'API synchrone est à la fois plus simple et
 * plus rapide, et les transactions deviennent de simples fonctions.
 */

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
	CREATE TABLE IF NOT EXISTS guild_settings (
		guild_id TEXT PRIMARY KEY,
		data     TEXT NOT NULL DEFAULT '{}'
	);

	CREATE TABLE IF NOT EXISTS categories (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		guild_id    TEXT NOT NULL,
		name        TEXT NOT NULL,
		emoji       TEXT,
		description TEXT,
		welcome     TEXT,
		parent_id   TEXT,
		roles       TEXT NOT NULL DEFAULT '[]',
		questions   TEXT NOT NULL DEFAULT '[]',
		position    INTEGER NOT NULL DEFAULT 0,
		enabled     INTEGER NOT NULL DEFAULT 1
	);
	CREATE INDEX IF NOT EXISTS idx_categories_guild ON categories (guild_id, position);

	CREATE TABLE IF NOT EXISTS tickets (
		id                INTEGER PRIMARY KEY AUTOINCREMENT,
		guild_id          TEXT NOT NULL,
		number            INTEGER NOT NULL,
		channel_id        TEXT UNIQUE,
		owner_id          TEXT NOT NULL,
		category_id       INTEGER,
		status            TEXT NOT NULL DEFAULT 'pending',
		members           TEXT NOT NULL DEFAULT '[]',
		answers           TEXT NOT NULL DEFAULT '[]',
		claimed_by        TEXT,
		control_message   TEXT,
		closed_message    TEXT,
		created_at        INTEGER NOT NULL,
		last_activity     INTEGER NOT NULL,
		closed_at         INTEGER,
		closed_by         TEXT,
		close_reason      TEXT,
		rating            INTEGER,
		UNIQUE (guild_id, number)
	);
	CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets (guild_id, owner_id, status);
	CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status, last_activity);

	CREATE TABLE IF NOT EXISTS blacklist (
		guild_id   TEXT NOT NULL,
		user_id    TEXT NOT NULL,
		reason     TEXT,
		added_by   TEXT NOT NULL,
		added_at   INTEGER NOT NULL,
		PRIMARY KEY (guild_id, user_id)
	);
`);

export default db;
