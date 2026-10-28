import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import { backRow } from '../community/profile.view.js';
import type { GameStats } from './stats.service.js';

import { botName } from '../../core/identity.js';
const COLOR = 0x16a085;

function net(n: number, s: GuildSettings): string {
  return `bilan **${n >= 0 ? '+' : ''}${formatAmount(n, s)}**`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Écran des statistiques ; `withBack` ajoute le retour au profil (version privée). */
export function buildStatsView(displayName: string, st: GameStats, s: GuildSettings, { withBack = false } = {}) {
  const on = (k: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(s, k);
  const c = card(COLOR);
  if (!withBack) c.addTextDisplayComponents(text(`# 📊 Statistiques de ${displayName}`));

  const blocks: Array<[show: boolean, body: string]> = [
    [true, `## ⭐ Activité\n${plural(st.messages, 'message')} · ${st.voiceHours.toFixed(1)} h de vocal · niveau **${st.level}**\nMeilleure série quotidienne : **${plural(st.maxStreak, 'jour')}**`],
    [on('calin'), `## 🤗 Câlins\nDonnés : **${st.hugsSent}** (${formatAmount(st.hugsSentTotal, s)}) · reçus : **${st.hugsReceived}** (${formatAmount(st.hugsReceivedTotal, s)})`],
    [on('blackjack'), `## 🃏 Blackjack\n${plural(st.blackjackGames, 'partie')} · **${plural(st.blackjackWins, 'victoire')}** · ${plural(st.blackjackNaturals, 'blackjack naturel', 'blackjacks naturels')} · ${net(st.blackjackNet, s)}`],
    [on('machine'), `## 🎰 Machine à sous\n${plural(st.slotSpins, 'tour')} · **${plural(st.jackpots, 'jackpot')}** · ${net(st.slotsNet, s)}`],
    [on('duel'), `## ⚔️ Duels\n**${plural(st.duelWins, 'victoire')}** · ${net(st.duelNet, s)}`],
    [on('vol'), `## 🥷 Vols\n${plural(st.thefts, 'tentative')} · **${plural(st.theftSuccesses, 'réussite')}** · ${net(st.theftNet, s)}`],
    [on('tombola'), `## 🎟️ Tombola\n${plural(st.lotteryTickets, 'ticket')} · **${plural(st.lotteryWins, 'tombola gagnée', 'tombolas gagnées')}** · ${net(st.lotteryNet, s)}`],
    [on('calin_collectif'), `## 🫂 Câlins collectifs\n${plural(st.groupHugs, 'participation')} · **${formatAmount(st.groupHugEarned, s)}** récoltés`],
    [on('comptage') && st.countingFines > 0, `## 🔢 Comptage\n${plural(st.countingFines, 'erreur')} · ${formatAmount(st.countingFineTotal, s)} d’amendes`],
  ];
  for (const [show, body] of blocks) {
    if (!show) continue;
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(body));
  }
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${st.unlocked} succès débloqués · ${botName()} tient les comptes.`));
  return screen(c, withBack ? [backRow()] : []);
}
