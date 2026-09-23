import { renderSetup, PAGES } from '#setup/views.js';

export default {
	name: 'setup',
	aliases: ['config', 'settings', 'configuration'],
	description: 'Ouvre le panneau de configuration interactif',
	usage: '[page]',
	level: 'admin',
	async run({ message, guild, args }) {
		// Raccourci vers une page : +setup fermeture, +setup categories…
		const wanted = (args[0] ?? '').toLowerCase();
		const page = PAGES.find((p) => p.id === wanted || p.label.toLowerCase().startsWith(wanted))?.id ?? 'home';
		return message.channel.send(renderSetup(guild, wanted ? page : 'home'));
	}
};
