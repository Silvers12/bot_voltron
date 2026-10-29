import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import type { BanterDraw, BanterKind } from './banter.service.js';
import { BANTER_STYLE, renderBanterCard } from './banter.image.js';
import { card, screen, text } from '../../discord/v2.js';
import { allowedUsers } from '../notify/mentions.js';

/** Bannière générée (texte entier, avatar, illustration) et une ligne de mentions pour prévenir la cible. */
export async function buildBanterMessage(kind: BanterKind, draw: BanterDraw, author: GuildMember, target: GuildMember) {
  const authorAvatarPng = Buffer.from(await (await fetch(author.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
  const image = await renderBanterCard({ kind, rarity: draw.rarity, authorName: author.displayName, authorAvatarPng, targetName: target.displayName, text: draw.text });
  const name = `${kind}.png`;
  const c = card(BANTER_STYLE[draw.rarity].accent);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription(draw.text)));
  c.addTextDisplayComponents(text(`-# ${kind === 'compliment' ? '💖' : '🗡️'} ${userMention(author.id)} → ${userMention(target.id)}`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name })], allowedMentions: { users: await allowedUsers(author.guild.id, 'piques', target.id) } };
}
