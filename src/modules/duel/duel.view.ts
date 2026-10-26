import { ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles, userMention, type MessageActionRowComponentBuilder } from 'discord.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { notifyMention } from '../notify/notify.service.js';
import type { DuelResolution, DuelWithMembers } from './duel.service.js';

export const DUEL_ACCEPT_PREFIX = 'duel:accept:';
export const DUEL_DECLINE_PREFIX = 'duel:decline:';
export const DUEL_CANCEL_PREFIX = 'duel:cancel:';

const COLOR = 0xc0392b;

export function buildChallengeMessage(duel: DuelWithMembers, s: GuildSettings) {
  const ping = notifyMention(s, 'duel');
  const c = card(COLOR);
  c.addTextDisplayComponents(text(`${ping}${userMention(duel.opponent.discordUserId)}, on te défie !\n# ⚔️ Défi en duel !\n${userMention(duel.challenger.discordUserId)} jette son gant au visage de ${userMention(duel.opponent.discordUserId)} !`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(`💰 **Mise** · ${formatAmount(duel.stake, s)} chacun · le vainqueur empoche **${formatAmount(duel.stake * 2, s)}**\n⏳ Le défi expire ${time(duel.expiresAt, TimestampStyles.RelativeTime)}.\n-# Seul le défié peut accepter ou refuser. Le défieur peut annuler.`));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(DUEL_ACCEPT_PREFIX + duel.id).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId(DUEL_DECLINE_PREFIX + duel.id).setLabel('Refuser').setStyle(ButtonStyle.Secondary).setEmoji('🏳️'),
    new ButtonBuilder().setCustomId(DUEL_CANCEL_PREFIX + duel.id).setLabel('Annuler').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return { ...screen(c, [row]), allowedMentions: { users: [duel.opponent.discordUserId], parse: ['roles' as const] } };
}

export function buildClosedMessage(duel: DuelWithMembers, s: GuildSettings, outcome: 'declined' | 'cancelled' | 'expired') {
  const body = {
    declined: `${userMention(duel.opponent.discordUserId)} décline le duel. ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
    cancelled: `${userMention(duel.challenger.discordUserId)} retire son défi et récupère sa mise.`,
    expired: `${userMention(duel.opponent.discordUserId)} n’a pas répondu. Le défi s’éteint et ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
  }[outcome];
  const c = card(0x95a5a6);
  c.addTextDisplayComponents(text(`# ⚔️ Duel sans suite\n${body}\n-# Mise : ${formatAmount(duel.stake, s)}`));
  return { ...screen(c), allowedMentions: { parse: [] as [] } };
}

export function buildResolvedMessage(r: DuelResolution, s: GuildSettings) {
  const { duel } = r;
  const winner = r.winnerId === duel.challengerId ? duel.challenger : duel.opponent;
  const lines = r.rounds.map((round) => `• ${round.text}\n  🎲 ${duel.challenger.displayName} **${round.challengerRoll}** · ${duel.opponent.displayName} **${round.opponentRoll}**`);
  const c = card(0xf1c40f);
  c.addTextDisplayComponents(text(`# ⚔️ Duel !\n${userMention(duel.challenger.discordUserId)} affronte ${userMention(duel.opponent.discordUserId)} pour ${formatAmount(duel.stake, s)} chacun.`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(lines.join('\n')));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`## 🏆 Résultat\n${r.finish}\n${userMention(winner.discordUserId)} empoche **${formatAmount(r.pot, s)}**.`));
  return { ...screen(c), allowedMentions: { parse: [] as [] } };
}
