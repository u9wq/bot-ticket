import { listCategories } from '#tickets/store.js';
import { openTicket } from '#tickets/service.js';

export default {
	name: 'new',
	aliases: ['open', 'ouvrir'],
	description: 'Ouvre un ticket, éventuellement dans une catégorie',
	usage: '[catégorie]',
	level: 'everyone',
	async run({ guild, member, raw, prefix, reply }) {
		const categories = listCategories(guild.id).filter((c) => c.enabled);
		let category = null;

		if (raw) {
			const wanted = raw.toLowerCase();
			category = categories.find((c) => c.name.toLowerCase() === wanted)
				?? categories.find((c) => c.name.toLowerCase().startsWith(wanted));
			if (!category) {
				return reply(`Catégorie inconnue. Disponibles : ${categories.map((c) => `\`${c.name}\``).join(', ') || 'aucune'}`);
			}
		} else if (categories.length) {
			return reply(`Précise une catégorie : ${categories.map((c) => `\`${prefix}new ${c.name}\``).join(', ')}`);
		}

		const res = await openTicket({ guild, member, category });
		return reply(`${res.ok ? '✅' : '❌'} ${res.message}`);
	}
};
