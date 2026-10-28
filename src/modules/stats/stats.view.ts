import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { imageScreen } from '../../discord/v2.js';
import { renderListCard, type ListLine } from '../../core/listimage.js';
import { backRow } from '../community/profile.view.js';
import type { GameStats } from './stats.service.js';
import { botName } from '../../core/identity.js';

const COLOR = 0x16a085;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Écran des statistiques en image ; `withBack` ajoute le retour au profil (version privée). */
export async function buildStatsView(displayName: string, st: GameStats, s: GuildSettings, { withBack = false } = {}) {
  const on = (k: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(s, k);
  const net = (n: number): { value: string; valueColor: string } => ({ value: `${n >= 0 ? '+' : ''}${formatAmount(n, s)}`, valueColor: n >= 0 ? '#2ecc71' : '#e74c3c' });
  const blocks: Array<[show: boolean, group: string, rows: ListLine[]]> = [
    [true, '⭐ Activité', [
      { label: plural(st.messages, 'message'), value: `niveau ${st.level}` },
      { label: `${st.voiceHours.toFixed(1)} h de vocal` },
      { label: 'Meilleure série quotidienne', value: plural(st.maxStreak, 'jour') },
    ]],
    [on('calin'), '🤗 Câlins', [
      { label: `Donnés : ${st.hugsSent}`, value: formatAmount(st.hugsSentTotal, s), valueColor: '#e74c3c' },
      { label: `Reçus : ${st.hugsReceived}`, value: formatAmount(st.hugsReceivedTotal, s), valueColor: '#2ecc71' },
    ]],
    [on('blackjack'), '🃏 Blackjack', [{ label: `${plural(st.blackjackGames, 'partie')} · ${plural(st.blackjackWins, 'victoire')} · ${plural(st.blackjackNaturals, 'naturel')}`, ...net(st.blackjackNet) }]],
    [on('machine'), '🎰 Machine à sous', [{ label: `${plural(st.slotSpins, 'tour')} · ${plural(st.jackpots, 'jackpot')}`, ...net(st.slotsNet) }]],
    [on('duel'), '⚔️ Duels', [{ label: plural(st.duelWins, 'victoire'), ...net(st.duelNet) }]],
    [on('vol'), '🥷 Vols', [{ label: `${plural(st.thefts, 'tentative')} · ${plural(st.theftSuccesses, 'réussite')}`, ...net(st.theftNet) }]],
    [on('tombola'), '🎟️ Tombola', [{ label: `${plural(st.lotteryTickets, 'ticket')} · ${plural(st.lotteryWins, 'tombola gagnée', 'tombolas gagnées')}`, ...net(st.lotteryNet) }]],
    [on('calin_collectif'), '🫂 Câlins collectifs', [{ label: plural(st.groupHugs, 'participation'), value: formatAmount(st.groupHugEarned, s), valueColor: '#2ecc71' }]],
    [on('comptage') && st.countingFines > 0, '🔢 Comptage', [{ label: plural(st.countingFines, 'erreur'), value: `−${formatAmount(st.countingFineTotal, s)}`, valueColor: '#e74c3c' }]],
  ];
  const lines: ListLine[] = [];
  for (const [show, group, rows] of blocks) {
    if (!show) continue;
    lines.push({ group }, ...rows);
  }
  const image = await renderListCard({ title: `Statistiques de ${displayName}`, subtitle: 'Les chiffres de jeu et d’activité', color: '#16a085', lines, footer: `${st.unlocked} succès débloqués · ${botName()} tient les comptes.` });
  return imageScreen(image, 'stats.png', COLOR, withBack ? [backRow()] : [], { caption: `Statistiques de ${displayName}` });
}
