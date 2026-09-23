import { Events } from 'discord.js';
import { handleComponent } from '#core/router.js';

export default {
	name: Events.InteractionCreate,
	async execute(interaction, bot) {
		// Le bot n'a volontairement aucune commande slash : tout passe par le
		// préfixe, et les interactions ne viennent que de ses propres panneaux.
		if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
			await handleComponent(interaction, bot);
		}
	}
};
