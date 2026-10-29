import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, time, TimestampStyles, userMention, type Guild, type MessageActionRowComponentBuilder } from 'discord.js';
import { loadIllustration, memberAvatarPng } from '../../core/duo-card.js';
import { renderSoloCard } from '../../core/solo-card.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { DrawResult } from './lottery.service.js';
import { renderLotteryBanner } from './lottery.image.js';
import { card, divider, screen, text } from '../../discord/v2.js';

import { botName } from '../../core/identity.js';
export const LOTTERY_BUY_PREFIX = 'lottery:buy:';
const COLOR = 0x8e44ad;

/** Carte de la tombola : bannière générée (cagnotte, tickets, illustration), date du tirage en texte. `intro` (annonce, rappel, mention du rôle) s'affiche au-dessus ; `buttons: false` pour un message retiré. */
export async function buildLotteryMessage(lottery: Lottery, s: GuildSettings, intro?: string, { buttons = true } = {}) {
  const c = card(COLOR);
  if (intro) c.addTextDisplayComponents(text(intro));
  const image = await renderLotteryBanner(lottery, s);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://tombola.png').setDescription(`Tombola : cagnotte ${formatAmount(lottery.pot, s)}, ${lottery.totalTickets} ticket(s) vendu(s)`)));
  c.addTextDisplayComponents(text(`🎟️ **Tirage ${time(lottery.drawAt, TimestampStyles.RelativeTime)}** · ${time(lottery.drawAt, TimestampStyles.LongDateTime)}\n-# Chacun paie avec sa bourse.${buttons ? '' : ' Ce message n’est plus actif : voir le dernier message de tombola.'}`));
  const rows = buttons
    ? [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}1`).setLabel(`1 ticket (${formatAmount(lottery.ticketPrice, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️'),
        new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}5`).setLabel(`5 tickets (${formatAmount(lottery.ticketPrice * 5, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️').setDisabled(s.lotteryMaxTickets > 0 && s.lotteryMaxTickets < 5),
      )]
    : [];
  return { ...screen(c, rows), files: [new AttachmentBuilder(image, { name: 'tombola.png' })], attachments: [] };
}

/** Annonce du tirage : carte générée pour le gagnant (avatar, cagnotte, tickets, illustration), carte texte s'il n'y a personne. `pingUsers` : identifiants réellement notifiés. */
export async function buildDrawAnnouncement(guild: Guild, r: DrawResult, totalTickets: number, s: GuildSettings, pingUsers: string[]) {
  const c = card(r.winner ? 0xf1c40f : 0x95a5a6);
  if (r.winner) {
    const chance = Math.round((100 * r.winner.tickets) / totalTickets);
    const image = await renderSoloCard({
      title: 'Tirage gagné !', badge: `+${formatAmount(r.lottery.pot, s)}`, badgeColor: '#e65100', from: '#311b92', to: '#f1c40f',
      name: r.winner.displayName, avatarPng: await memberAvatarPng(guild, r.winner.discordUserId),
      lines: [`${botName()} plonge la patte dans le chapeau… et en sort le ticket de ${r.winner.displayName} !`, `${r.winner.tickets} ticket${r.winner.tickets > 1 ? 's' : ''} sur ${totalTickets} (${chance} % de chances).`],
      illustration: await loadIllustration('tombola', 'tirage'),
    }).catch(() => null);
    if (image) {
      c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://tirage.png').setDescription(`${r.winner.displayName} remporte la tombola`)));
      c.addTextDisplayComponents(text(`-# 🎟️ ${userMention(r.winner.discordUserId)} remporte **${formatAmount(r.lottery.pot, s)}** · prochain tirage ${time(r.next.drawAt, TimestampStyles.RelativeTime)}, la cagnotte repart à ${formatAmount(r.next.pot, s)}.`));
      return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'tirage.png' })], allowedMentions: { users: pingUsers } };
    }
    c.addTextDisplayComponents(text(`# 🎟️ Tirage de la tombola !\n${botName()} plonge la patte dans le chapeau, farfouille longuement… et en sort le ticket de ${userMention(r.winner.discordUserId)} !`));
    c.addSeparatorComponents(divider(true));
    c.addTextDisplayComponents(text(`🏆 **${formatAmount(r.lottery.pot, s)}** remportés avec ${r.winner.tickets} ticket${r.winner.tickets > 1 ? 's' : ''} sur ${totalTickets} (${chance} % de chances).`));
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(`-# Prochain tirage ${time(r.next.drawAt, TimestampStyles.RelativeTime)} : la cagnotte repart à ${formatAmount(r.next.pot, s)}.`));
    return { ...screen(c), allowedMentions: { users: pingUsers } };
  }
  c.addTextDisplayComponents(text(`# 🎟️ Tirage de la tombola\nPersonne n’a pris de ticket cette semaine. ${botName()} range le chapeau, un peu déçu.`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(`La cagnotte de **${formatAmount(r.lottery.pot, s)}** est reportée : prochain tirage ${time(r.next.drawAt, TimestampStyles.RelativeTime)} avec **${formatAmount(r.next.pot, s)}** en jeu.`));
  return { ...screen(c), allowedMentions: { parse: [] as [] } };
}
