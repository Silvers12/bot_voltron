import { allowedUsers } from '../notify/mentions.js';
import type { Guild } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { credit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { ACHIEVEMENTS, TIER_REWARD, type Achievement, type MemberStats } from './achievements.catalog.js';
import { buildUnlockAnnouncement } from './achievements.view.js';

const log = createLogger('succes');
const META_KEYS = ACHIEVEMENTS.filter((a) => a.category === 'Collection').map((a) => a.key);

/** Rassemble l'instantané des statistiques d'un membre. */
export async function computeStats(memberId: string): Promise<MemberStats> {
  const [member, account, byType, bjByState, streak, tickets, unlocked] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { messageCount: true, voiceSeconds: true, level: true, slotSpins: true, slotJackpots: true } }),
    prisma.account.findUnique({ where: { memberId }, select: { balance: true } }),
    prisma.transaction.groupBy({ by: ['type'], where: { account: { memberId } }, _count: { _all: true }, _sum: { delta: true } }),
    prisma.blackjackGame.groupBy({ by: ['state'], where: { memberId, state: { not: 'PLAYING' } }, _count: { _all: true } }),
    prisma.dailyClaim.aggregate({ where: { memberId }, _max: { streak: true } }),
    prisma.lotteryEntry.aggregate({ where: { memberId }, _sum: { tickets: true } }),
    prisma.memberAchievement.count({ where: { memberId, key: { notIn: META_KEYS } } }),
  ]);
  const bj = (state: string) => bjByState.find((b) => b.state === state)?._count._all ?? 0;
  const t = (type: string) => byType.find((b) => b.type === type);
  return {
    messages: member.messageCount,
    voiceHours: member.voiceSeconds / 3600,
    level: member.level,
    balance: account?.balance ?? 0,
    maxStreak: streak._max.streak ?? 0,
    hugsSent: t('HUG_SENT')?._count._all ?? 0,
    hugsSentTotal: -(t('HUG_SENT')?._sum.delta ?? 0),
    hugsReceived: t('HUG_RECEIVED')?._count._all ?? 0,
    purchases: t('PURCHASE')?._count._all ?? 0,
    blackjackGames: bjByState.reduce((n, b) => n + b._count._all, 0),
    blackjackWins: bj('WON') + bj('BLACKJACK'),
    blackjackNaturals: bj('BLACKJACK'),
    slotSpins: member.slotSpins,
    jackpots: member.slotJackpots,
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
 * Idempotent grâce à l'unicité (membre, clé). Les succès méta (Collection) sont évalués en dernier,
 * avec le compteur mis à jour par les déblocages de ce passage. `force` ignore la mise en pause (rattrapage admin).
 */
export async function evaluateMember(guild: Guild, memberId: string, { announce = true, force = false } = {}): Promise<Unlock[]> {
  const s = await getSettings(guild.id);
  if (!force && !isFeatureEnabled(s, 'succes')) return [];
  const unlocks: Unlock[] = [];
  const stats = await computeStats(memberId);
  const owned = new Set((await listUnlocked(memberId)).map((a) => a.key));
  const ordered = [...ACHIEVEMENTS.filter((a) => a.category !== 'Collection'), ...ACHIEVEMENTS.filter((a) => a.category === 'Collection')];
  for (const a of ordered) {
    if (owned.has(a.key) || !a.check(stats)) continue;
    try {
      await prisma.memberAchievement.create({ data: { memberId, key: a.key } });
    } catch (err) {
      if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') continue; // débloqué en parallèle
      throw err;
    }
    if (a.category !== 'Collection') stats.unlocked++;
    const reward = TIER_REWARD[a.tier];
    if (reward > 0) await credit({ memberId, amount: reward, type: 'ACHIEVEMENT', actorDiscordId: 'voltron', reason: `Succès : ${a.name}` });
    unlocks.push({ achievement: a, reward });
  }
  if (unlocks.length) {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { discordUserId: true } });
    log.info(`${member.discordUserId} débloque : ${unlocks.map((u) => u.achievement.key).join(', ')}`);
    if (announce && s.achievementChannelId) {
      const channel = guild.channels.cache.get(s.achievementChannelId);
      if (channel?.isTextBased()) await channel.send(buildUnlockAnnouncement(member.discordUserId, unlocks, s, await allowedUsers(guild.id, 'succes', member.discordUserId))).catch((err) => log.warn('Annonce de succès impossible', err));
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
  for (const m of members) total += (await evaluateMember(guild, m.id, { announce: false, force: true })).length;
  return total;
}

/** Nombre de membres ayant chaque succès (pour l'intendance). */
export async function unlockCounts(guildId: string): Promise<Map<string, number>> {
  const rows = await prisma.memberAchievement.groupBy({ by: ['key'], where: { member: { guildId } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.key, r._count._all]));
}
