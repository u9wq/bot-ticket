import { ephemeral, notice, v2 } from '#core/ui.js';
import { rateTicket } from '#tickets/service.js';

/**
 * Note laissée par l'auteur d'un ticket, depuis ses messages privés.
 * `rating:give:<ticketId>:<note>`
 */
export default {
	namespace: 'rating',
	actions: {
		async give(i, { args: [ticketId, value] }) {
			const rating = Number(value);
			if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;

			const res = await rateTicket({ client: i.client, ticketId: Number(ticketId), user: i.user, rating });
			if (!res.ok) return ephemeral(i, null, res.message);

			// Les boutons disparaissent : on ne note qu'une fois.
			return i.update(v2(notice(null, `${'⭐'.repeat(rating)}\n${res.message}`)));
		}
	}
};
