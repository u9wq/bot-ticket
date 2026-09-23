import { transcriptOf } from '#tickets/service.js';

export default {
	name: 'transcript',
	aliases: ['transcription'],
	description: 'Génère la transcription HTML du ticket',
	level: 'staff',
	ticket: true,
	async run({ message, guild, ticket, reply }) {
		const res = await transcriptOf({ guild, ticket });
		if (!res.ok) return reply(`❌ ${res.message}`);
		return message.reply({ content: `📄 ${res.message}`, files: [res.file], allowedMentions: { repliedUser: false } });
	}
};
