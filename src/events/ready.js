import { ActivityType, Events } from 'discord.js';
import { VERSION } from '#core/config.js';
import { sweepInactive } from '#tickets/service.js';

const SWEEP_INTERVAL = 5 * 60_000;

export default {
	name: Events.ClientReady,
	once: true,
	execute(bot) {
		console.log(`[BOT] connecté en tant que ${bot.user.tag} · v${VERSION} · ${bot.guilds.cache.size} serveur(s)`);
		bot.user.setActivity({ name: 'les tickets · @mention pour l\'aide', type: ActivityType.Watching });

		// Fermeture automatique des tickets inactifs, pour les serveurs qui l'ont activée.
		const sweep = () => sweepInactive(bot).catch((error) => console.error('[AUTOCLOSE]', error));
		setInterval(sweep, SWEEP_INTERVAL).unref();
		sweep();
	}
};
