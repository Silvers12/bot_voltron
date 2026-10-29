import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { renderPrisonCard } from './prison.image.js';

/** Carte publique d'une mise en prison : bannière générée et une ligne avec la mention et l'heure de libération. */
export async function buildPrisonMessage(guildMember: GuildMember, { lines, minutes, until, next }: { lines: string[]; minutes: number; until: Date; next?: number }) {
  const avatarPng = Buffer.from(await (await fetch(guildMember.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
  const image = await renderPrisonCard({ name: guildMember.displayName, avatarPng, lines, minutes, next });
  const c = card(0x546e7a);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://prison.png').setDescription(`${guildMember.displayName} : ${lines[0] ?? 'en prison'}`)));
  c.addTextDisplayComponents(text(`-# 🚔 ${userMention(guildMember.id)} · libération <t:${Math.floor(until.getTime() / 1000)}:R>`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'prison.png' })], allowedMentions: { users: [guildMember.id] } };
}
