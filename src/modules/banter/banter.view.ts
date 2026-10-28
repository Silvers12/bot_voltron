import { EmbedBuilder, userMention } from 'discord.js';
import type { BanterDraw, BanterKind, Rarity } from './banter.service.js';

import { botName } from '../../core/identity.js';
const STYLE: Record<Rarity, { label: string; color: number; prefix: string }> = {
  classique: { label: 'Classique', color: 0x95a5a6, prefix: '' },
  rare: { label: '✨ Rare', color: 0x3498db, prefix: '✨ ' },
  epique: { label: '🌟 ÉPIQUE', color: 0xf1c40f, prefix: '🌟 ' },
};

export function buildBanterMessage(kind: BanterKind, draw: BanterDraw, authorId: string, targetId: string) {
  const style = STYLE[draw.rarity];
  const title = kind === 'compliment' ? '💖 Compliment' : '🗡️ Insulte (avec amour)';
  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setAuthor({ name: `${title} · ${style.label}` })
    .setDescription(`${style.prefix}${draw.text}`)
    .setFooter({ text: kind === 'compliment' ? `${botName()} approuve ce message.` : `${botName()} décline toute responsabilité. Mais il a ri.` });

  const intro = kind === 'compliment'
    ? `${userMention(authorId)} offre un compliment à ${userMention(targetId)} :`
    : `${userMention(authorId)} lance une pique à ${userMention(targetId)} :`;

  return { content: intro, embeds: [embed], allowedMentions: { users: [targetId] } };
}
