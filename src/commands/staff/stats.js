import { stats } from '#tickets/store.js';

export default {
	name: 'stats',
	aliases: ['statistiques'],
	description: 'Statistiques des tickets du serveur',
	level: 'staff',
	async run({ guild, reply }) {
		const s = stats(guild.id);
		const rating = s.ratings ? `${s.rating.toFixed(2)}/5 sur ${s.ratings} avis` : 'aucun avis';
		const top = s.topClaimers.length
			? s.topClaimers.map((t, i) => `\`${i + 1}.\` <@${t.user_id}> · ${t.count} ticket${t.count > 1 ? 's' : ''}`).join('\n')
			: '-# Aucune prise en charge.';

		return reply([
			'### 📊 Statistiques des tickets',
			`**Total** ${s.total} · **Ouverts** ${s.open ?? 0} · **Fermés** ${s.closed ?? 0}`,
			`**Satisfaction** ${rating}`,
			'',
			'**Staff le plus actif**',
			top
		].join('\n'));
	}
};
