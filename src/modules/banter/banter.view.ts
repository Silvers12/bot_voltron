import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AttachmentBuilder, SectionBuilder, ThumbnailBuilder, userMention } from 'discord.js';
import type { BanterDraw, BanterKind, Rarity } from './banter.service.js';
import { botName } from '../../core/identity.js';
import { contentDir } from '../../core/paths.js';
import { card, divider, screen, text } from '../../discord/v2.js';

const STYLE: Record<Rarity, { label: string; color: number; prefix: string }> = {
  classique: { label: 'Classique', color: 0x95a5a6, prefix: '' },
  rare: { label: '✨ Rare', color: 0x3498db, prefix: '✨ ' },
  epique: { label: '🌟 ÉPIQUE', color: 0xf1c40f, prefix: '🌟 ' },
};

/** Vignette fournie dans content/banter/<kind>.png, ou null si absente. */
async function loadVisual(kind: BanterKind): Promise<Buffer | null> {
  try {
    return await readFile(path.join(contentDir, 'banter', `${kind}.png`));
  } catch {
    return null;
  }
}

/** Carte V2 : intro avec mentions, texte tiré, signature ; vignette à droite si une image est fournie. */
export async function buildBanterMessage(kind: BanterKind, draw: BanterDraw, authorId: string, targetId: string) {
  const style = STYLE[draw.rarity];
  const title = kind === 'compliment' ? '💖 Compliment' : '🗡️ Insulte (avec amour)';
  const intro = kind === 'compliment'
    ? `${userMention(authorId)} offre un compliment à ${userMention(targetId)}`
    : `${userMention(authorId)} lance une pique à ${userMention(targetId)}`;
  const body = text(`**${title} · ${style.label}**\n${intro} :\n> ${style.prefix}${draw.text}`);

  const c = card(style.color);
  const visual = await loadVisual(kind);
  const files: AttachmentBuilder[] = [];
  if (visual) {
    files.push(new AttachmentBuilder(visual, { name: `${kind}.png` }));
    c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(body).setThumbnailAccessory(new ThumbnailBuilder().setURL(`attachment://${kind}.png`)));
  } else {
    c.addTextDisplayComponents(body);
  }
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${kind === 'compliment' ? `${botName()} approuve ce message.` : `${botName()} décline toute responsabilité. Mais il a ri.`}`));
  return { ...screen(c), files, allowedMentions: { users: [targetId] } };
}
