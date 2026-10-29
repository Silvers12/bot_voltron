import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { fetchAvatarPng, loadIllustration } from '../../core/duo-card.js';
import { renderSoloCard } from '../../core/solo-card.js';
import { allowedUsers } from '../notify/mentions.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

/** Carte d'annonce du jackpot : avatar du chanceux, montant, cagnotte suivante, illustration. */
export async function buildJackpotMessage(member: GuildMember, payout: number, pool: number, s: GuildSettings) {
  const image = await renderSoloCard({
    title: 'JACKPOT !', badge: `+${formatAmount(payout, s)}`, badgeColor: '#b71c1c', from: '#4a148c', to: '#ffb300',
    name: member.displayName, avatarPng: await fetchAvatarPng(member.displayAvatarURL({ extension: 'png', size: 256 })),
    lines: [`${member.displayName} aligne trois loutres et rafle toute la cagnotte ! Quelle veine !`, `La cagnotte repart à ${formatAmount(pool, s)}.`],
    illustration: await loadIllustration('jeux', 'jackpot'),
  });
  const c = card(0xffb300);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://jackpot.png').setDescription(`${member.displayName} décroche le jackpot`)));
  c.addTextDisplayComponents(text(`-# 🎰🦦 ${userMention(member.id)} · jackpot de **${formatAmount(payout, s)}**`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'jackpot.png' })], allowedMentions: { users: await allowedUsers(member.guild.id, 'gains', member.id) } };
}
