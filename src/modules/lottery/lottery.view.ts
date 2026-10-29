import { ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles, userMention, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { DrawResult } from './lottery.service.js';
import { card, divider, screen, text } from '../../discord/v2.js';

import { botName } from '../../core/identity.js';
export const LOTTERY_BUY_PREFIX = 'lottery:buy:';
const COLOR = 0x8e44ad;

/** Carte de la tombola. `intro` (annonce, rappel, mention du rôle) s'affiche au-dessus ; `buttons: false` pour un message retiré. */
export function buildLotteryMessage(lottery: Lottery, s: GuildSettings, intro?: string, { buttons = true } = {}) {
  const c = card(COLOR);
  if (intro) { c.addTextDisplayComponents(text(intro)); c.addSeparatorComponents(divider()); }
  c.addTextDisplayComponents(text(
    `# 🎟️ Tombola de la compagnie\nUn seul gagnant rafle toute la cagnotte. Chaque ticket est une chance de plus.\n**Tirage ${time(lottery.drawAt, TimestampStyles.RelativeTime)}** · ${time(lottery.drawAt, TimestampStyles.LongDateTime)}`,
  ));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(`💰 **Cagnotte** · **${formatAmount(lottery.pot, s)}**\n🎟️ **Ticket** · ${formatAmount(lottery.ticketPrice, s)} · **${lottery.totalTickets}** vendu${lottery.totalTickets > 1 ? 's' : ''}`));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${s.lotteryMaxTickets > 0 ? `Maximum ${s.lotteryMaxTickets} tickets par membre. ` : ''}Chacun paie avec sa bourse.${buttons ? '' : ' Ce message n’est plus actif : voir le dernier message de tombola.'}`));
  const rows = buttons
    ? [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}1`).setLabel(`1 ticket (${formatAmount(lottery.ticketPrice, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️'),
        new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}5`).setLabel(`5 tickets (${formatAmount(lottery.ticketPrice * 5, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️').setDisabled(s.lotteryMaxTickets > 0 && s.lotteryMaxTickets < 5),
      )]
    : [];
  return screen(c, rows);
}

/** `pingUsers` : identifiants réellement notifiés (le gagnant, sauf refus). */
export function buildDrawAnnouncement(r: DrawResult, totalTickets: number, s: GuildSettings, pingUsers: string[]) {
  const c = card(r.winner ? 0xf1c40f : 0x95a5a6);
  if (r.winner) {
    const chance = Math.round((100 * r.winner.tickets) / totalTickets);
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
