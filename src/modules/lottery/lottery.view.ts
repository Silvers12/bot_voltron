import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention } from 'discord.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { DrawResult } from './lottery.service.js';

export const LOTTERY_BUY_PREFIX = 'lottery:buy:';
const COLOR = 0x8e44ad;

export function buildLotteryMessage(lottery: Lottery, s: GuildSettings) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎟️ Tombola de la compagnie')
    .setDescription(
      `Un seul gagnant rafle toute la cagnotte. Chaque ticket est une chance de plus.\n` +
        `**Tirage ${time(lottery.drawAt, TimestampStyles.RelativeTime)}** (${time(lottery.drawAt, TimestampStyles.LongDateTime)}).`,
    )
    .addFields(
      { name: 'Cagnotte', value: `**${formatAmount(lottery.pot, s)}**`, inline: true },
      { name: 'Ticket', value: formatAmount(lottery.ticketPrice, s), inline: true },
      { name: 'Tickets vendus', value: `${lottery.totalTickets}`, inline: true },
    )
    .setFooter({ text: s.lotteryMaxTickets > 0 ? `Maximum ${s.lotteryMaxTickets} tickets par membre. Chacun paie avec sa bourse.` : 'Chacun paie avec sa bourse.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}1`).setLabel(`1 ticket (${formatAmount(lottery.ticketPrice, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️'),
    new ButtonBuilder().setCustomId(`${LOTTERY_BUY_PREFIX}5`).setLabel(`5 tickets (${formatAmount(lottery.ticketPrice * 5, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎟️').setDisabled(s.lotteryMaxTickets > 0 && s.lotteryMaxTickets < 5),
  );
  return { embeds: [embed], components: [row] };
}

export function buildDrawAnnouncement(r: DrawResult, totalTickets: number, s: GuildSettings) {
  const embed = new EmbedBuilder().setColor(r.winner ? 0xf1c40f : 0x95a5a6).setTitle('🎟️ Tirage de la tombola !');
  if (r.winner) {
    const chance = Math.round((100 * r.winner.tickets) / totalTickets);
    embed.setDescription(
      `Voltron plonge la patte dans le chapeau, farfouille longuement… et en sort le ticket de ${userMention(r.winner.discordUserId)} !\n\n` +
        `🏆 **${formatAmount(r.lottery.pot, s)}** remportés avec ${r.winner.tickets} ticket${r.winner.tickets > 1 ? 's' : ''} sur ${totalTickets} (${chance} % de chances).\n\n` +
        `Prochain tirage ${time(r.next.drawAt, TimestampStyles.RelativeTime)} : la cagnotte repart à ${formatAmount(r.next.pot, s)}. Tapez \`/tombola\` pour vos tickets !`,
    );
    return { embeds: [embed], allowedMentions: { users: [r.winner.discordUserId] } };
  }
  embed.setDescription(
    `Personne n’a pris de ticket cette semaine. Voltron range le chapeau, un peu déçu.\n\n` +
      `La cagnotte de **${formatAmount(r.lottery.pot, s)}** est reportée : prochain tirage ${time(r.next.drawAt, TimestampStyles.RelativeTime)} avec **${formatAmount(r.next.pot, s)}** en jeu. Tapez \`/tombola\` !`,
  );
  return { embeds: [embed] };
}
