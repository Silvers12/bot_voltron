import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { dayKey, nextMidnight, previousDayKey } from '../../core/time.js';
import { getSettings } from '../settings/settings.service.js';
import { getOrCreateAccount } from './economy.service.js';

const log = createLogger('daily');

export interface DailyStatus {
  claimedToday: boolean;
  /** Prochain minuit dans le fuseau du serveur */
  nextAt: Date;
  /** Montant de base */
  amount: number;
  /** Série en cours (jours consécutifs, aujourd'hui inclus si réclamé) */
  streak: number;
  /** Série qu'aurait la prochaine réclamation, et montant correspondant */
  nextStreak: number;
  nextAmount: number;
}

/** Montant d'une récompense selon la série : base + bonus% × (série - 1). */
export function dailyAmountFor(base: number, streak: number, bonusPercent: number): number {
  return Math.round(base * (1 + (bonusPercent * Math.max(0, streak - 1)) / 100));
}

/** Série au moment d'une réclamation pour le jour `key` : 1, ou série de la veille + 1. */
async function streakFor(memberId: string, key: string): Promise<number> {
  const yesterday = await prisma.dailyClaim.findUnique({ where: { memberId_dayKey: { memberId, dayKey: previousDayKey(key) } } });
  return yesterday ? yesterday.streak + 1 : 1;
}

export async function getDailyStatus(memberId: string, guildId: string, now = new Date()): Promise<DailyStatus> {
  const settings = await getSettings(guildId);
  const key = dayKey(now, settings.timezone);
  const today = await prisma.dailyClaim.findUnique({ where: { memberId_dayKey: { memberId, dayKey: key } } });
  const streak = today ? today.streak : (await streakFor(memberId, key)) - 1;
  // Si pas encore réclamé aujourd'hui : prochaine série = aujourd'hui ; sinon : demain
  const nextStreak = today ? today.streak + 1 : streak + 1;
  return {
    claimedToday: today !== null,
    nextAt: nextMidnight(now, settings.timezone),
    amount: settings.dailyAmount,
    streak,
    nextStreak,
    nextAmount: dailyAmountFor(settings.dailyAmount, nextStreak, settings.dailyStreakBonusPercent),
  };
}

export type DailyClaimResult =
  | { ok: true; amount: number; streak: number; bonusPercent: number; balanceAfter: number }
  | { ok: false; reason: 'already_claimed'; nextAt: Date };

/**
 * Réclame la récompense du jour civil courant. L'unicité (membre, jour) en base
 * garantit une seule attribution même en cas de clics simultanés.
 */
export async function claimDaily(memberId: string, guildId: string, discordUserId: string, now = new Date()): Promise<DailyClaimResult> {
  const settings = await getSettings(guildId);
  const key = dayKey(now, settings.timezone);
  const account = await getOrCreateAccount(memberId);
  const streak = await streakFor(memberId, key);
  const amount = dailyAmountFor(settings.dailyAmount, streak, settings.dailyStreakBonusPercent);
  const bonusPercent = settings.dailyStreakBonusPercent * (streak - 1);

  try {
    const result = await prisma.$transaction(async (db) => {
      const updated = await db.account.update({ where: { id: account.id }, data: { balance: { increment: amount } } });
      const tx = await db.transaction.create({
        data: {
          accountId: account.id,
          type: 'DAILY',
          delta: amount,
          balanceAfter: updated.balance,
          reason: `Récompense du ${key} · série de ${streak} jour${streak > 1 ? 's' : ''}`,
          actorDiscordId: discordUserId,
        },
      });
      await db.dailyClaim.create({ data: { memberId, dayKey: key, streak, transactionId: tx.id } });
      return { ok: true as const, amount, streak, bonusPercent, balanceAfter: updated.balance };
    });
    log.info(`Récompense ${key} : +${amount} (série ${streak}) pour ${discordUserId}`);
    return result;
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
      return { ok: false, reason: 'already_claimed', nextAt: nextMidnight(now, settings.timezone) };
    }
    throw err;
  }
}
