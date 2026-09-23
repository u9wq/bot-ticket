import { isAdmin } from '#core/perms.js';
import { unclaimTicket } from '#tickets/service.js';

export default {
	name: 'unclaim',
	aliases: ['liberer'],
	description: 'Libère le ticket pris en charge',
	level: 'staff',
	ticket: true,
	async run({ guild, member, ticket, reply }) {
		const res = await unclaimTicket({ guild, ticket, member, force: isAdmin(member) });
		if (!res.ok) return reply(`❌ ${res.message}`);
	}
};
