import type { Guild } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { credit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { ACHIEVEMENTS, TIER_REWARD, type Achievement, type MemberStats } from './achievements.catalog.js';
import { buildUnlockAnnouncement } from './achievements.view.js';

const log = createLogger('succes');

/** Rassemble l'instantané des statistiques d'un membre. */
export async function computeStats(memberId: string): Promise<MemberStats> {
  const [member, account, byType, naturals, jackpots, spins, bjGames, bjWins, streak, weekly, tickets, unlocked] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { messageCount: true, voiceSeconds: true, level: true } }),
    prisma.account.findUnique({ where: { memberId }, select: { balance: true } }),
    prisma.transaction.groupBy({ by: ['type'], where: { account: { memberId } }, _count: { _all: true }, _sum: { delta: true } }),
    prisma.transaction.count({ where: { account: { memberId }, type: 'BET_WIN', reason: 'Blackjack : blackjack' } }),
    prisma.transaction.count({ where: { account: { memberId }, type: 'BET_WIN', reason: { startsWith: 'Machine à sous : JACKPOT' } } }),
    prisma.transaction.count({ where: { account: { memberId }, type: 'BET', reason: 'Machine à sous : mise' } }),
    prisma.blackjackGame.count({ where: { memberId, state: { not: 'PLAYING' } } }),
    prisma.blackjackGame.count({ where: { memberId, state: { in: ['WON', 'BLACKJACK'] } } }),
    prisma.dailyClaim.aggregate({ where: { memberId }, _max: { streak: true } }),
    prisma.weeklyClaim.count({ where: { memberId } }),
    prisma.lotteryEntry.aggregate({ where: { memberId }, _sum: { tickets: true } }),
    prisma.memberAchievement.count({ where: { memberId, key: { notIn: ['collection', 'encyclopedie'] } } }),
  ]);
  const t = (type: string) => byType.find((b) => b.type === type);
  return {
    messages: member.messageCount,
    voiceHours: member.voiceSeconds / 3600,
    level: member.level,
    balance: account?.balance ?? 0,
    maxStreak: streak._max.streak ?? 0,
    weeklyClaims: weekly,
    hugsSent: t('HUG_SENT')?._count._all ?? 0,
    hugsSentTotal: -(t('HUG_SENT')?._sum.delta ?? 0),
    hugsReceived: t('HUG_RECEIVED')?._count._all ?? 0,
    purchases: t('PURCHASE')?._count._all ?? 0,
    blackjackGames: bjGames,
    blackjackWins: bjWins,
    blackjackNaturals: naturals,
    slotSpins: spins,
    jackpots,
    duelsPlayed: t('DUEL_STAKE')?._count._all ?? 0,
    duelWins: t('DUEL_WIN')?._count._all ?? 0,
    groupHugs: t('GROUP_HUG')?._count._all ?? 0,
    lotteryTickets: tickets._sum.tickets ?? 0,
    lotteryWins: t('LOTTERY_WIN')?._count._all ?? 0,
    unlocked,
  };
}

export async function listUnlocked(memberId: string) {
  return prisma.memberAchievement.findMany({ where: { memberId }, orderBy: { unlockedAt: 'asc' } });
}

export interface Unlock {
  achievement: Achievement;
  reward: number;
}

/**
 * Compare les statistiques au catalogue et débloque ce qui manque : crédit de la récompense, annonce.
 * Idempotent grâce à l'unicité (membre, clé). Les succès méta sont réévalués après les autres.
 */
export async function evaluateMember(guild: Guild, memberId: string, { announce = true } = {}): Promise<Unlock[]> {
  const s = await getSettings(guild.id);
  if (!isFeatureEnabled(s, 'succes')) return [];
  const unlocks: Unlock[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const stats = await computeStats(memberId);
    const owned = new Set((await listUnlocked(memberId)).map((a) => a.key));
    const candidates = ACHIEVEMENTS.filter((a) => !owned.has(a.key) && (pass === 0 ? a.category !== 'Collection' : a.category === 'Collection') && a.check(stats));
    for (const a of candidates) {
      try {
        await prisma.memberAchievement.create({ data: { memberId, key: a.key } });
      } catch (err) {
        if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') continue; // débloqué en parallèle
        throw err;
      }
      const reward = TIER_REWARD[a.tier];
      if (reward > 0) await credit({ memberId, amount: reward, type: 'ACHIEVEMENT', actorDiscordId: 'voltron', reason: `Succès : ${a.name}` });
      unlocks.push({ achievement: a, reward });
    }
    if (pass === 0 && candidates.length === 0 && stats.unlocked < 10) break; // rien de nouveau, inutile de tester les méta
  }
  if (unlocks.length) {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { discordUserId: true } });
    log.info(`${member.discordUserId} débloque : ${unlocks.map((u) => u.achievement.key).join(', ')}`);
    if (announce && s.achievementChannelId) {
      const channel = guild.channels.cache.get(s.achievementChannelId);
      if (channel?.isTextBased()) await channel.send(buildUnlockAnnouncement(member.discordUserId, unlocks, s)).catch((err) => log.warn('Annonce de succès impossible', err));
    }
  }
  return unlocks;
}

/** Point d'accroche sans blocage : à appeler après une action notable d'un membre. */
export function trackAchievements(guild: Guild, memberId: string) {
  void evaluateMember(guild, memberId).catch((err) => log.error(`Évaluation des succès échouée pour ${memberId}`, err));
}

/** Réévalue tous les membres présents, sans annonce (rattrapage). Retourne le nombre de succès débloqués. */
export async function evaluateAll(guild: Guild): Promise<number> {
  const members = await prisma.member.findMany({ where: { guildId: guild.id, leftAt: null }, select: { id: true } });
  let total = 0;
  for (const m of members) total += (await evaluateMember(guild, m.id, { announce: false })).length;
  return total;
}

/** Nombre de membres ayant chaque succès (pour l'intendance). */
export async function unlockCounts(guildId: string): Promise<Map<string, number>> {
  const rows = await prisma.memberAchievement.groupBy({ by: ['key'], where: { member: { guildId } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.key, r._count._all]));
}
