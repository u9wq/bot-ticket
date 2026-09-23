import { AttachmentBuilder } from 'discord.js';

/**
 * Transcription d'un ticket en une page HTML autonome.
 *
 * Un salon supprimé emporte toute la conversation : sur un serveur de vente ou
 * de support, c'est une preuve ou l'historique d'un litige qui disparaît. La
 * page s'ouvre dans n'importe quel navigateur, sans dépendance externe hormis
 * les avatars et les pièces jointes, servis par Discord.
 */

const PAGE_SIZE = 100;
const MAX_MESSAGES = 5000;

/** Remonte l'historique du salon, du plus ancien au plus récent. */
export async function fetchMessages(channel, max = MAX_MESSAGES) {
	const all = [];
	let before;

	while (all.length < max) {
		const page = await channel.messages.fetch({ limit: PAGE_SIZE, ...(before && { before }) }).catch(() => null);
		if (!page?.size) break;
		const batch = [...page.values()];
		all.push(...batch);
		before = batch.at(-1).id;
		if (page.size < PAGE_SIZE) break;
	}

	return all.reverse();
}

const escape = (s) => String(s ?? '')
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;');

/**
 * Texte des Components V2 : ces messages n'ont pas de `content`, leur texte
 * vit dans des blocs imbriqués (conteneur > section > texte).
 */
function componentText(components) {
	const out = [];
	const walk = (node) => {
		if (!node) return;
		if (typeof node.content === 'string') out.push(node.content);
		node.components?.forEach(walk);
		if (node.accessory) walk(node.accessory);
	};
	components.forEach((c) => walk(typeof c.toJSON === 'function' ? c.toJSON() : c));
	return out.join('\n');
}

/** Markdown Discord réduit à l'essentiel, appliqué sur du texte déjà échappé. */
function markdown(text, guild) {
	return escape(text)
		.replace(/```(?:\w+\n)?([\s\S]*?)```/g, '<pre>$1</pre>')
		.replace(/`([^`\n]+)`/g, '<code>$1</code>')
		.replace(/^#{1,3} (.+)$/gm, '<strong class="h">$1</strong>')
		.replace(/^-# (.+)$/gm, '<small>$1</small>')
		.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/__(.+?)__/g, '<u>$1</u>')
		.replace(/~~(.+?)~~/g, '<s>$1</s>')
		.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => `<span class="mention">@${escape(guild.members.cache.get(id)?.displayName ?? guild.client.users.cache.get(id)?.username ?? id)}</span>`)
		.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="mention">@${escape(guild.roles.cache.get(id)?.name ?? id)}</span>`)
		.replace(/&lt;#(\d+)&gt;/g, (_, id) => `<span class="mention">#${escape(guild.channels.cache.get(id)?.name ?? id)}</span>`)
		.replace(/&lt;t:(\d+)(?::\w)?&gt;/g, (_, s) => new Date(Number(s) * 1000).toLocaleString('fr-FR'))
		.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
		.replace(/\n/g, '<br>');
}

function renderMessage(m, guild) {
	const author = m.author;
	const name = m.member?.displayName ?? author?.globalName ?? author?.username ?? 'Inconnu';
	const color = m.member?.displayHexColor && m.member.displayHexColor !== '#000000' ? m.member.displayHexColor : '#f2f3f5';
	const date = new Date(m.createdTimestamp).toLocaleString('fr-FR');

	const parts = [];
	if (m.content) parts.push(`<div class="content">${markdown(m.content, guild)}</div>`);

	const v2 = m.components?.length ? componentText(m.components) : '';
	if (v2) parts.push(`<div class="card">${markdown(v2, guild)}</div>`);

	for (const embed of m.embeds ?? []) {
		const body = [embed.title && `<strong>${escape(embed.title)}</strong>`, embed.description && markdown(embed.description, guild),
			...(embed.fields ?? []).map((f) => `<strong>${escape(f.name)}</strong><br>${markdown(f.value, guild)}`)]
			.filter(Boolean).join('<br>');
		if (body) parts.push(`<div class="card" style="border-color:${embed.hexColor ?? '#4e5058'}">${body}</div>`);
	}

	for (const file of m.attachments?.values() ?? []) {
		parts.push(file.contentType?.startsWith('image/')
			? `<a href="${escape(file.url)}" target="_blank"><img class="attachment" src="${escape(file.url)}" alt="${escape(file.name)}"></a>`
			: `<a class="file" href="${escape(file.url)}" target="_blank">📎 ${escape(file.name)}</a>`);
	}

	if (!parts.length) parts.push('<div class="content muted">[message sans texte]</div>');

	return `<div class="message">
	<img class="avatar" src="${escape(author?.displayAvatarURL({ size: 64 }) ?? '')}" alt="">
	<div class="body">
		<div class="meta"><span class="name" style="color:${color}">${escape(name)}</span>${author?.bot ? '<span class="bot">BOT</span>' : ''}<span class="date">${date}</span></div>
		${parts.join('\n\t\t')}
	</div>
</div>`;
}

export function renderHtml({ guild, channel, ticket, category, messages }) {
	const owner = guild.client.users.cache.get(ticket.owner_id);
	const info = [
		['Serveur', guild.name],
		['Ticket', `#${String(ticket.number).padStart(4, '0')} · ${channel.name}`],
		['Catégorie', category?.name ?? 'Général'],
		['Auteur', owner ? `${owner.username} (${owner.id})` : ticket.owner_id],
		['Ouvert le', new Date(ticket.created_at).toLocaleString('fr-FR')],
		['Messages', String(messages.length)]
	];

	return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transcription · ${escape(channel.name)}</title>
<style>
	* { box-sizing: border-box; }
	body { margin: 0; background: #313338; color: #dbdee1; font: 15px/1.4 "gg sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
	header { background: #2b2d31; padding: 20px 24px; border-bottom: 1px solid #1e1f22; }
	header h1 { margin: 0 0 12px; font-size: 20px; color: #f2f3f5; }
	dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; font-size: 14px; }
	dt { color: #949ba4; } dd { margin: 0; }
	main { padding: 16px 0; }
	.message { display: flex; gap: 16px; padding: 6px 24px; }
	.message:hover { background: #2e3035; }
	.avatar { width: 40px; height: 40px; border-radius: 50%; flex: none; background: #1e1f22; }
	.body { min-width: 0; flex: 1; }
	.meta { display: flex; align-items: baseline; gap: 8px; }
	.name { font-weight: 600; }
	.bot { background: #5865f2; color: #fff; font-size: 10px; font-weight: 600; padding: 1px 4px; border-radius: 3px; }
	.date { color: #949ba4; font-size: 12px; }
	.content { overflow-wrap: anywhere; }
	.muted { color: #949ba4; font-style: italic; }
	.card { margin-top: 4px; padding: 8px 12px; background: #2b2d31; border-left: 4px solid #5865f2; border-radius: 4px; max-width: 640px; overflow-wrap: anywhere; }
	.h { font-size: 16px; }
	small { color: #949ba4; }
	blockquote { margin: 0; padding-left: 8px; border-left: 4px solid #4e5058; }
	code, pre { background: #1e1f22; border-radius: 4px; font-family: Consolas, monospace; font-size: 13px; }
	code { padding: 1px 4px; } pre { padding: 8px; white-space: pre-wrap; margin: 4px 0; }
	.mention { background: rgba(88,101,242,.3); color: #c9cdfb; border-radius: 3px; padding: 0 2px; }
	a { color: #00a8fc; }
	.attachment { display: block; margin-top: 4px; max-width: 400px; max-height: 300px; border-radius: 4px; }
	.file { display: inline-block; margin-top: 4px; padding: 8px 12px; background: #2b2d31; border-radius: 4px; }
	footer { padding: 16px 24px; color: #949ba4; font-size: 12px; border-top: 1px solid #1e1f22; }
</style>
</head>
<body>
<header>
	<h1>Transcription du ticket</h1>
	<dl>${info.map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl>
</header>
<main>
${messages.map((m) => renderMessage(m, guild)).join('\n')}
</main>
<footer>Générée le ${new Date().toLocaleString('fr-FR')}${messages.length >= MAX_MESSAGES ? ` · limitée aux ${MAX_MESSAGES} premiers messages` : ''}</footer>
</body>
</html>
`;
}

/** Construit la pièce jointe prête à envoyer. */
export async function buildTranscript(channel, ticket, category) {
	const messages = await fetchMessages(channel);
	const html = renderHtml({ guild: channel.guild, channel, ticket, category, messages });
	const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
		name: `transcription-${String(ticket.number).padStart(4, '0')}.html`
	});
	return { file, count: messages.length };
}
