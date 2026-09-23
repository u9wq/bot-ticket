/**
 * Vérification hors ligne, sans connexion à Discord.
 *
 *   npm run check
 *
 * Charge tous les modules, construit chaque page du panneau de configuration
 * et chaque message du bot sur un faux serveur, puis vérifie les limites que
 * Discord imposerait à l'envoi (40 composants par message, validation des
 * builders). Utilise une base jetable : la base réelle n'est pas touchée.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-ticket-check-'));
process.env.TOKEN ||= 'check';
process.env.DB_PATH = path.join(tmp, 'check.sqlite');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { importAll } = await import('#core/loader.js');
const { registerCommand, commands, findCommand } = await import('#core/commands.js');
const { registerComponents, handleComponent } = await import('#core/router.js');
const { tokenize } = await import('#core/args.js');
const { getSettings, updateSettings } = await import('#core/settings.js');
const { normalizeEmoji } = await import('#core/ui.js');
const store = await import('#tickets/store.js');
const { channelName } = await import('#tickets/service.js');
const views = await import('#tickets/views.js');
const { renderSetup, PAGES } = await import('#setup/views.js');
const { EDITS, editModal } = await import('#setup/edits.js');
const { helpView } = await import('#core/help.js');
const { renderHtml } = await import('#tickets/transcript.js');

let passed = 0;
const test = async (name, fn) => {
	try {
		await fn();
		passed++;
		console.log(`  ✔ ${name}`);
	} catch (error) {
		console.error(`  ✘ ${name}\n    ${error.stack}`);
		process.exitCode = 1;
	}
};

// ─── Faux serveur ──────────────────────────────────────────────────────────
const ids = { guild: '100000000000000001', role: '200000000000000001', cat: '300000000000000001', text: '300000000000000002', user: '400000000000000001' };
const guild = {
	id: ids.guild,
	name: 'Serveur de test',
	roles: { cache: new Map([[ids.role, { id: ids.role, name: 'Staff' }]]), everyone: { id: ids.guild } },
	channels: { cache: new Map([[ids.cat, { id: ids.cat, name: 'Tickets', type: 4 }], [ids.text, { id: ids.text, name: 'logs', type: 0 }]]) },
	members: { cache: new Map(), me: { permissionsIn: () => ({ has: () => true }) } },
	client: { users: { cache: new Map() } }
};

/** Compte les composants d'une charge utile, imbriqués compris, comme Discord. */
function countComponents(nodes) {
	let n = 0;
	const walk = (c) => {
		n++;
		c.components?.forEach(walk);
		if (c.accessory) walk(c.accessory);
	};
	nodes.forEach(walk);
	return n;
}

function validate(payload) {
	const json = payload.components.map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c));
	const total = countComponents(json);
	assert.ok(total <= 40, `${total} composants (limite 40)`);
	const text = JSON.stringify(json);
	for (const [, id] of text.matchAll(/"custom_id":"([^"]+)"/g)) assert.ok(id.length <= 100, `custom_id trop long : ${id}`);
	return total;
}

console.log('\nChargement');

await test('commandes', async () => {
	for (const { file, module } of await importAll(path.join(root, 'src/commands'))) {
		assert.ok(registerCommand(module, path.basename(path.dirname(file))), `commande invalide : ${file}`);
		assert.ok(['everyone', 'staff', 'admin'].includes(module.level), `niveau invalide : ${module.name}`);
		assert.ok(module.description, `description manquante : ${module.name}`);
	}
	assert.ok(commands.size >= 15);
	assert.equal(findCommand('fermer')?.name, 'close');
	assert.equal(findCommand('CONFIG')?.name, 'setup');
});

await test('composants', async () => {
	const mods = await importAll(path.join(root, 'src/components'));
	assert.ok(mods.every(({ module }) => registerComponents(module)));
	assert.deepEqual(mods.map(({ module }) => module.namespace).sort(), ['help', 'rating', 'setup', 'ticket']);
});

await test('événements', async () => {
	const events = await importAll(path.join(root, 'src/events'));
	assert.ok(events.every(({ module }) => module.name && typeof module.execute === 'function'));
});

console.log('\nOutils');

await test('découpage des arguments', () => {
	assert.deepEqual(tokenize('add "Support technique" 🛠️'), ['add', 'Support technique', '🛠️']);
	assert.deepEqual(tokenize('  a   b '), ['a', 'b']);
});

await test('émojis', () => {
	assert.equal(normalizeEmoji('🛠️'), '🛠️');
	assert.equal(normalizeEmoji('👍🏽'), '👍🏽');
	assert.equal(normalizeEmoji('<:test:123456789012345678>'), '<:test:123456789012345678>');
	assert.equal(normalizeEmoji('abc'), null);
	assert.equal(normalizeEmoji(''), null);
});

await test('nom des salons', () => {
	const ticket = { number: 7 };
	assert.equal(channelName('ticket-{number}', { ticket, user: { username: 'Élodie' } }), 'ticket-0007');
	assert.equal(channelName('{category}-{user}', { ticket, user: { username: 'Élodie.B' }, category: { name: 'Achat Boutique' } }), 'achat-boutique-elodie-b');
	assert.equal(channelName('!!!', { ticket, user: { username: 'x' } }), 'ticket-7');
});

console.log('\nDonnées');

await test('réglages : valeurs par défaut et fusion', () => {
	const s = getSettings(ids.guild);
	assert.equal(s.prefix, '+');
	updateSettings(ids.guild, (x) => { x.prefix = '!'; x.features.rating = true; x.staffRoles = [ids.role]; x.channels.tickets = ids.cat; });
	assert.equal(getSettings(ids.guild).prefix, '!');
	assert.equal(getSettings(ids.guild).features.claim, true);
});

await test('catégories : création, modification, ordre', () => {
	const a = store.createCategory(ids.guild, { name: 'Support', emoji: '🛠️' });
	const b = store.createCategory(ids.guild, { name: 'Achat' });
	store.updateCategory(a.id, { roles: [ids.role], questions: ['Ton pseudo ?', 'Ton problème ?'], enabled: false });
	assert.deepEqual(store.getCategory(a.id).roles, [ids.role]);
	assert.equal(store.getCategory(a.id).enabled, false);
	store.moveCategory(ids.guild, b.id, 'up');
	assert.deepEqual(store.listCategories(ids.guild).map((c) => c.name), ['Achat', 'Support']);
	store.updateCategory(a.id, { enabled: true });
});

await test('tickets : numérotation, fermeture unique, réouverture', () => {
	const t1 = store.reserveTicket({ guildId: ids.guild, ownerId: ids.user, categoryId: null, answers: [] });
	const t2 = store.reserveTicket({ guildId: ids.guild, ownerId: ids.user, categoryId: null, answers: [] });
	assert.equal(t2.number, t1.number + 1);
	store.updateTicket(t1.id, { status: 'open', channel_id: '500000000000000001' });
	assert.equal(store.markClosed(t1.id, ids.user, 'test'), true);
	assert.equal(store.markClosed(t1.id, ids.user, 'test'), false, 'double fermeture');
	assert.equal(store.markReopened(t1.id), true);
	store.discardTicket(t2.id);
	assert.equal(store.openTicketsOf(ids.guild, ids.user).length, 1);
});

await test('liste noire', () => {
	store.addBlacklist(ids.guild, ids.user, 'spam', ids.user);
	assert.equal(store.getBlacklist(ids.guild, ids.user).reason, 'spam');
	assert.equal(store.removeBlacklist(ids.guild, ids.user), true);
	assert.equal(store.removeBlacklist(ids.guild, ids.user), false);
});

console.log('\nAffichage');

const categoryId = store.listCategories(ids.guild)[1].id;

for (const page of [...PAGES.map((p) => [p.id]), ['category', categoryId], ['category-delete', categoryId]]) {
	await test(`page ${page.join(' ')}`, () => {
		const total = validate(renderSetup(guild, ...page));
		console.log(`    ${total} composants`);
	});
}

await test('pages avec toutes les options inversées', () => {
	updateSettings(ids.guild, (s) => { for (const k of Object.keys(s.features)) s.features[k] = !s.features[k]; s.panel.style = 'buttons'; });
	for (const p of PAGES) validate(renderSetup(guild, p.id));
});

await test('panneau public : menu, boutons, sans catégorie', () => {
	const s = getSettings(ids.guild);
	const list = store.listCategories(ids.guild);
	validate({ components: [views.publicPanel({ ...s, panel: { ...s.panel, style: 'menu' } }, list)] });
	validate({ components: [views.publicPanel({ ...s, panel: { ...s.panel, style: 'buttons' } }, list)] });
	validate({ components: [views.publicPanel(s, [])] });
	const many = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Catégorie ${i}`, enabled: true }));
	validate({ components: [views.publicPanel({ ...s, panel: { ...s.panel, style: 'buttons' } }, many)] });
});

await test('messages de ticket', () => {
	const s = getSettings(ids.guild);
	const ticket = { id: 1, number: 12, owner_id: ids.user, created_at: Date.now(), answers: [{ question: 'Q ?', answer: 'Réponse\nsur deux lignes' }], claimed_by: ids.user, closed_by: ids.user, closed_at: Date.now(), close_reason: 'Résolu' };
	validate({ components: [views.controlMessage({ ticket, category: store.getCategory(categoryId), settings: s, guild, owner: { id: ids.user }, pingRoles: [ids.role] })] });
	validate({ components: [views.closedMessage({ ticket, settings: s })] });
	validate({ components: [views.ratingRequest({ ticket, guild, settings: s })] });
});

await test('formulaires de configuration', () => {
	for (const key of Object.keys(EDITS)) {
		const m = editModal(guild, key, key.startsWith('cat-') && key !== 'cat-create' ? categoryId : undefined);
		m.toJSON();
	}
});

await test('aide', () => {
	for (const group of ['home', 'general', 'tickets', 'staff', 'config']) validate(helpView(getSettings(ids.guild), group));
});

await test('transcription HTML', () => {
	const html = renderHtml({
		guild: { ...guild, members: { cache: new Map() } },
		channel: { name: 'ticket-0001' },
		ticket: { number: 1, owner_id: ids.user, created_at: Date.now() },
		category: null,
		messages: [{
			author: { username: 'a', bot: false, displayAvatarURL: () => '' },
			createdTimestamp: Date.now(),
			content: '**gras** <script>alert(1)</script> https://example.com',
			attachments: new Map(),
			embeds: [],
			components: []
		}]
	});
	assert.ok(html.includes('<strong>gras</strong>'));
	assert.ok(!html.includes('<script>alert'), 'HTML non échappé');
});

console.log('\nInteractions simulées');

/** Fausse interaction : enregistre les réponses au lieu de les envoyer. */
function click(customId, { values, fields, admin = true, select = false } = {}) {
	const calls = [];
	const i = {
		customId, values, guild, channelId: ids.text, deferred: false, replied: false,
		user: { id: ids.user },
		member: { id: ids.user, guild: { ownerId: '0' }, permissions: { has: () => admin }, roles: { cache: new Map() } },
		fields: { getTextInputValue: (id) => fields?.[id] ?? '' },
		isStringSelectMenu: () => select,
		update: async (payload) => { calls.push(['update', payload]); i.replied = true; },
		reply: async (payload) => { calls.push(['reply', payload]); i.replied = true; },
		followUp: async (payload) => calls.push(['followUp', payload]),
		editReply: async (payload) => calls.push(['editReply', payload]),
		showModal: async (m) => calls.push(['modal', m.toJSON()])
	};
	return handleComponent(i, null).then(() => calls);
}

const lastText = (calls) => JSON.stringify(calls.at(-1)?.[1]);

await test('un non-admin ne peut pas modifier la configuration', async () => {
	const before = getSettings(ids.guild).features.claim;
	const calls = await click('setup:toggle:claim', { admin: false });
	assert.equal(calls[0][0], 'reply');
	assert.match(lastText(calls), /Réservé/);
	assert.equal(getSettings(ids.guild).features.claim, before);
});

await test('interrupteur de fonctionnalité', async () => {
	const before = getSettings(ids.guild).features.claim;
	const calls = await click('setup:toggle:claim');
	assert.equal(calls[0][0], 'update');
	assert.equal(getSettings(ids.guild).features.claim, !before);
});

await test('modification du préfixe par formulaire', async () => {
	const [[kind, m]] = await click('setup:edit:prefix');
	assert.equal(kind, 'modal');
	assert.equal(m.custom_id, 'setup:save:prefix');

	assert.equal((await click('setup:save:prefix', { fields: { prefix: 'a b' } }))[0][0], 'reply');
	assert.notEqual(getSettings(ids.guild).prefix, 'a b');

	assert.equal((await click('setup:save:prefix', { fields: { prefix: '?' } }))[0][0], 'update');
	assert.equal(getSettings(ids.guild).prefix, '?');
});

await test('couleur invalide refusée, valide normalisée', async () => {
	await click('setup:save:color', { fields: { color: 'rouge' } });
	assert.notEqual(getSettings(ids.guild).color, 'rouge');
	await click('setup:save:color', { fields: { color: 'ed4245' } });
	assert.equal(getSettings(ids.guild).color, '#ED4245');
});

await test('sélecteurs de rôles et de salons', async () => {
	await click('setup:pick:staffRoles', { values: [ids.role] });
	assert.deepEqual(getSettings(ids.guild).staffRoles, [ids.role]);
	await click('setup:pick:logs', { values: [ids.text] });
	assert.equal(getSettings(ids.guild).channels.logs, ids.text);
	await click('setup:pick:logs', { values: [] });
	assert.equal(getSettings(ids.guild).channels.logs, null);
});

await test('création, formulaire et suppression de catégorie', async () => {
	const count = store.listCategories(ids.guild).length;
	assert.equal((await click('setup:save:cat-create', { fields: { name: 'Partenariat', emoji: 'pas un émoji' } }))[0][0], 'reply');
	await click('setup:save:cat-create', { fields: { name: 'Partenariat', emoji: '🤝', description: 'Proposer un partenariat' } });
	const created = store.listCategories(ids.guild).at(-1);
	assert.equal(store.listCategories(ids.guild).length, count + 1);
	assert.equal(created.emoji, '🤝');

	await click(`setup:save:cat-questions:${created.id}`, { fields: { q0: 'Nom du serveur ?', q2: 'Nombre de membres ?' } });
	assert.deepEqual(store.getCategory(created.id).questions, ['Nom du serveur ?', 'Nombre de membres ?']);

	await click(`setup:cat-delete:${created.id}`);
	assert.equal(store.getCategory(created.id), undefined);
});

console.log(`\n${passed} vérifications réussies${process.exitCode ? ', des échecs ci-dessus' : ''}.`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* base encore ouverte sous Windows */ }
process.exit(process.exitCode ?? 0);
