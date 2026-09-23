/**
 * Point d'entrée.
 *
 * Ordre volontaire : commandes, interactions et événements sont chargés avant
 * la connexion. Connecté plus tôt, le bot recevrait ses premiers événements
 * avant que leurs écouteurs existent.
 */
import path from 'node:path';
import { Client, GatewayIntentBits } from 'discord.js';
import config, { ROOT, VERSION } from '#core/config.js';
import { importAll } from '#core/loader.js';
import { registerCommand } from '#core/commands.js';
import { registerComponents } from '#core/router.js';

const bot = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent // privilégié : à activer sur le portail développeur
	]
});

const src = (dir) => path.join(ROOT, 'src', dir);

console.log(`[BOT] bot-ticket v${VERSION}`);

let count = 0;
for (const { file, module } of await importAll(src('commands'))) {
	// Le dossier de la commande sert de groupe dans l'aide.
	if (registerCommand(module, path.basename(path.dirname(file)))) count++;
	else console.warn(`[COMMAND] ignorée (name ou run manquant) : ${file}`);
}
console.log(`[COMMAND] ${count} commandes chargées`);

count = 0;
for (const { module } of await importAll(src('components'))) if (registerComponents(module)) count++;
console.log(`[COMPONENT] ${count} espaces d'interactions chargés`);

count = 0;
for (const { module: event } of await importAll(src('events'))) {
	const run = (...args) => Promise.resolve()
		.then(() => event.execute(...args, bot))
		.catch((error) => console.error(`[EVENT] ${event.name} :`, error));
	bot[event.once ? 'once' : 'on'](event.name, run);
	count++;
}
console.log(`[EVENT] ${count} événements chargés`);

bot.on('error', (error) => console.error('[CLIENT]', error));
process.on('unhandledRejection', (reason) => console.error('[PROCESS] promesse rejetée :', reason));
process.on('uncaughtException', (error) => console.error('[PROCESS] exception :', error));

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, async () => {
		console.log(`[BOT] arrêt (${signal})`);
		await bot.destroy().catch(() => null);
		process.exit(0);
	});
}

try {
	await bot.login(config.token);
} catch (error) {
	console.error('\n\x1b[31mConnexion à Discord impossible.\x1b[0m');
	if (error.code === 'TokenInvalid') {
		console.error('  Le TOKEN est invalide. Régénère-le sur https://discord.com/developers/applications (Bot > Reset Token).');
	} else if (/disallowed intents/i.test(error.message)) {
		console.error('  Active « MESSAGE CONTENT INTENT » sur https://discord.com/developers/applications > ton application > Bot.');
	} else {
		console.error(`  ${error.message}`);
	}
	process.exit(1);
}
