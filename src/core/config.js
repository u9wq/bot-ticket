import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Configuration de l'instance, lue une seule fois au démarrage.
 *
 * Seul ce qui ne peut pas se régler depuis Discord vit ici : le token, les
 * propriétaires et l'emplacement de la base. Tout le reste (préfixe, salons,
 * fonctionnalités…) est propre à chaque serveur et se règle avec +setup.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const VERSION = (() => {
	try {
		return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
	} catch {
		return 'inconnue';
	}
})();

function list(value) {
	return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function stop(title, lines) {
	console.error(`\x1b[31m\n${title}\x1b[0m`);
	for (const line of lines) console.error(`  ${line}`);
	console.error('');
	process.exit(1);
}

if (!process.env.TOKEN) {
	stop('Le token du bot est absent', [
		'Renseignez la variable TOKEN dans un fichier .env (voir .env.example)',
		'ou dans le panneau de votre hébergeur.',
		'Le token se récupère sur https://discord.com/developers/applications'
	]);
}

const config = Object.freeze({
	token: process.env.TOKEN,
	// Propriétaires du bot : accès administrateur sur tous les serveurs.
	owners: list(process.env.OWNERS),
	// Valeurs par défaut d'un nouveau serveur, modifiables ensuite en jeu.
	defaultPrefix: process.env.PREFIX || '+',
	defaultColor: process.env.COLOR || '#5865F2',
	dbPath: path.resolve(ROOT, process.env.DB_PATH || 'data/bot.sqlite')
});

export default config;
