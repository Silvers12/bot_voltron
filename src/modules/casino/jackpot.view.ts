import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, userMention, type GuildMember } from 'discord.js';
import { card, screen, text } from '../../discord/v2.js';
import { fetchAvatarPng, loadIllustration } from '../../core/duo-card.js';
import { renderSoloCard } from '../../core/solo-card.js';
import { allowedUsers } from '../notify/mentions.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

/** Carte d'annonce du jackpot (trois loutres, toute la cagnotte) ou du demi-jackpot (trois symboles identiques, la moitié). */
export async function buildJackpotMessage(member: GuildMember, payout: number, pool: number, s: GuildSettings, { half = false, reels = [] as string[] } = {}) {
  const image = await renderSoloCard({
    title: half ? 'Triple gagnant !' : 'JACKPOT !', badge: `+${formatAmount(payout, s)}`, badgeColor: half ? '#e65100' : '#b71c1c', from: half ? '#0d47a1' : '#4a148c', to: half ? '#26c6da' : '#ffb300',
    name: member.displayName, avatarPng: await fetchAvatarPng(member.displayAvatarURL({ extension: 'png', size: 256 })),
    lines: half
      ? [`${member.displayName} aligne trois symboles identiques et empoche ${s.slotTriplePercent} % de la cagnotte !`, `Il reste ${formatAmount(pool, s)} à gagner.`]
      : [`${member.displayName} aligne trois loutres et rafle toute la cagnotte ! Quelle veine !`, `La cagnotte repart à ${formatAmount(pool, s)}.`],
    illustration: await loadIllustration('jeux', half ? 'demi_jackpot' : 'jackpot'),
  });
  const c = card(half ? 0x26c6da : 0xffb300);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://jackpot.png').setDescription(`${member.displayName} décroche ${half ? 'un triple gagnant' : 'le jackpot'}`)));
  c.addTextDisplayComponents(text(`-# 🎰${half ? '' : '🦦'} ${userMention(member.id)} · ${half ? `${reels.join(' ')} · ${s.slotTriplePercent} % de la cagnotte` : 'jackpot'} : **${formatAmount(payout, s)}**`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'jackpot.png' })], allowedMentions: { users: await allowedUsers(member.guild.id, 'gains', member.id) } };
}
