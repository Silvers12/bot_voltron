import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { fetchAvatarPng, loadIllustration, renderDuoCard } from '../../core/duo-card.js';
import { allowedUsers } from '../notify/mentions.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { TheftOutcome } from './theft.service.js';

/** Carte publique d'une tentative de vol : voleur et cible, verdict, butin ou amende, récit, illustration selon l'issue. */
export async function buildTheftMessage(thief: GuildMember, target: GuildMember, outcome: TheftOutcome, s: GuildSettings) {
  const ok = outcome.success;
  const badge = ok ? (outcome.amount > 0 ? `Butin : ${formatAmount(outcome.amount, s)}` : 'Butin : rien du tout') : (outcome.amount > 0 ? `Amende : ${formatAmount(outcome.amount, s)}` : 'Pris, mais fauché');
  const [left, right, illustration] = await Promise.all([fetchAvatarPng(thief.displayAvatarURL({ extension: 'png', size: 256 })), fetchAvatarPng(target.displayAvatarURL({ extension: 'png', size: 256 })), loadIllustration('vol', ok ? 'reussite' : 'echec')]);
  const image = await renderDuoCard({
    title: ok ? 'Vol réussi !' : 'Pris sur le fait !', badge, badgeColor: ok ? '#1b5e20' : '#b71c1c', from: ok ? '#0d1b2a' : '#3e2723', to: ok ? '#1b5e20' : '#c62828',
    left: { name: thief.displayName, avatarPng: left }, right: { name: target.displayName, avatarPng: right }, link: ok ? '🥷' : '🚔',
    text: outcome.text, illustration,
  });
  const c = card(ok ? 0x2e7d32 : 0xc62828);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://vol.png').setDescription(outcome.text)));
  c.addTextDisplayComponents(text(`-# ${ok ? '🥷' : '🚔'} ${userMention(thief.id)} → ${userMention(target.id)}`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'vol.png' })], allowedMentions: { users: await allowedUsers(thief.guild.id, 'vol', target.id) } };
}
