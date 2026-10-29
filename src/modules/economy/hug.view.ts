import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { fetchAvatarPng, loadIllustration, renderDuoCard } from '../../core/duo-card.js';
import { allowedUsers } from '../notify/mentions.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

const STORIES = [
  '{a} serre {b} très fort dans ses bras, assez longtemps pour que ça devienne un peu gênant, et lui glisse {m} dans la poche.',
  '{a} fonce sur {b} toutes pattes ouvertes. Câlin ! Et {m} en prime, parce que c’est comme ça.',
  'Grand câlin de {a} à {b}, avec bruitages. {m} changent de bourse dans la foulée.',
  '{a} dépose {m} chez {b} avec un câlin qui sent bon la rivière et le poisson grillé.',
  '{a} attrape {b} par surprise : câlin inattendu, {m} offerts, journée sauvée.',
];

/** Carte publique du câlin : les deux membres, le montant, un petit récit, le mot éventuel, l'illustration. */
export async function buildHugMessage(author: GuildMember, target: GuildMember, amount: number, note: string | null, s: GuildSettings) {
  const story = STORIES[Math.floor(Math.random() * STORIES.length)]!.replace(/\{a\}/g, author.displayName).replace(/\{b\}/g, target.displayName).replace(/\{m\}/g, formatAmount(amount, s));
  const [left, right, illustration] = await Promise.all([fetchAvatarPng(author.displayAvatarURL({ extension: 'png', size: 256 })), fetchAvatarPng(target.displayAvatarURL({ extension: 'png', size: 256 })), loadIllustration('calin', 'calin')]);
  const image = await renderDuoCard({
    title: 'Câlin !', badge: `+${formatAmount(amount, s)} pour ${target.displayName.slice(0, 16)}`, badgeColor: '#c2185b', from: '#4a148c', to: '#ec407a',
    left: { name: author.displayName, avatarPng: left }, right: { name: target.displayName, avatarPng: right }, link: '🤗',
    text: note ? `${story} « ${note} »` : story, illustration,
  });
  const c = card(0xec407a);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://calin.png').setDescription(story)));
  c.addTextDisplayComponents(text(`-# 🤗 ${userMention(author.id)} → ${userMention(target.id)}${note ? ` · « ${note} »` : ''}`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'calin.png' })], allowedMentions: { users: await allowedUsers(author.guild.id, 'calins', target.id) } };
}
