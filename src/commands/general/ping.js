export default {
	name: 'ping',
	description: 'Latence du bot',
	level: 'everyone',
	async run({ bot, message, reply }) {
		const api = Date.now() - message.createdTimestamp;
		return reply(`🏓 Passerelle **${Math.round(bot.ws.ping)} ms** · Message **${api} ms**`);
	}
};
