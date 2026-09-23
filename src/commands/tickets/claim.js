import { isAdmin } from '#core/perms.js';
import { claimTicket } from '#tickets/service.js';

export default {
	name: 'claim',
	aliases: ['prendre'],
	description: 'Prend en charge le ticket (un admin peut reprendre celui d\'un autre)',
	level: 'staff',
	ticket: true,
	async run({ guild, member, ticket, reply }) {
		const res = await claimTicket({ guild, ticket, member, force: isAdmin(member) });
		if (!res.ok) return reply(`❌ ${res.message}`);
	}
};
