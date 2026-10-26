import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { DuelResolution, DuelWithMembers } from './duel.service.js';

export const DUEL_ACCEPT_PREFIX = 'duel:accept:';
export const DUEL_DECLINE_PREFIX = 'duel:decline:';
export const DUEL_CANCEL_PREFIX = 'duel:cancel:';

const COLOR = 0xc0392b;

export function buildChallengeMessage(duel: DuelWithMembers, s: GuildSettings) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('⚔️ Défi en duel !')
    .setDescription(
      `${userMention(duel.challenger.discordUserId)} jette son gant au visage de ${userMention(duel.opponent.discordUserId)} !\n\n` +
        `**Mise :** ${formatAmount(duel.stake, s)} chacun · le vainqueur empoche **${formatAmount(duel.stake * 2, s)}**.\n` +
        `Le défi expire ${time(duel.expiresAt, TimestampStyles.RelativeTime)}.`,
    )
    .setFooter({ text: 'Seul le défié peut accepter ou refuser. Le défieur peut annuler.' });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(DUEL_ACCEPT_PREFIX + duel.id).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId(DUEL_DECLINE_PREFIX + duel.id).setLabel('Refuser').setStyle(ButtonStyle.Secondary).setEmoji('🏳️'),
    new ButtonBuilder().setCustomId(DUEL_CANCEL_PREFIX + duel.id).setLabel('Annuler').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return { embeds: [embed], components: [row], allowedMentions: { users: [duel.opponent.discordUserId] } };
}

export function buildClosedMessage(duel: DuelWithMembers, s: GuildSettings, outcome: 'declined' | 'cancelled' | 'expired') {
  const text = {
    declined: `${userMention(duel.opponent.discordUserId)} décline le duel. ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
    cancelled: `${userMention(duel.challenger.discordUserId)} retire son défi et récupère sa mise.`,
    expired: `${userMention(duel.opponent.discordUserId)} n’a pas répondu. Le défi s’éteint et ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
  }[outcome];
  const embed = new EmbedBuilder().setColor(0x95a5a6).setTitle('⚔️ Duel sans suite').setDescription(`${text}\n(${formatAmount(duel.stake, s)})`);
  return { embeds: [embed], components: [], allowedMentions: { parse: [] as [] } };
}

export function buildResolvedMessage(r: DuelResolution, s: GuildSettings) {
  const { duel } = r;
  const winner = r.winnerId === duel.challengerId ? duel.challenger : duel.opponent;
  const lines = r.rounds.map((round) => `• ${round.text}\n  🎲 ${duel.challenger.displayName} **${round.challengerRoll}** · ${duel.opponent.displayName} **${round.opponentRoll}**`);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('⚔️ Duel !')
    .setDescription(`${userMention(duel.challenger.discordUserId)} affronte ${userMention(duel.opponent.discordUserId)} pour ${formatAmount(duel.stake, s)} chacun.\n\n${lines.join('\n')}`)
    .addFields({ name: '🏆 Résultat', value: `${r.finish}\n${userMention(winner.discordUserId)} empoche **${formatAmount(r.pot, s)}**.` });
  return { embeds: [embed], components: [], allowedMentions: { parse: [] as [] } };
}
