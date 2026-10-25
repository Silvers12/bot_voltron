import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { dayKey, nextMidnight } from '../../core/time.js';
import { getSettings } from '../settings/settings.service.js';
import { getOrCreateAccount } from './economy.service.js';

const log = createLogger('daily');

export interface DailyStatus {
  claimedToday: boolean;
  /** Prochain minuit dans le fuseau du serveur */
  nextAt: Date;
  amount: number;
}

export async function getDailyStatus(memberId: string, guildId: string, now = new Date()): Promise<DailyStatus> {
  const settings = await getSettings(guildId);
  const claim = await prisma.dailyClaim.findUnique({
    where: { memberId_dayKey: { memberId, dayKey: dayKey(now, settings.timezone) } },
  });
  return { claimedToday: claim !== null, nextAt: nextMidnight(now, settings.timezone), amount: settings.dailyAmount };
}

export type DailyClaimResult =
  | { ok: true; amount: number; balanceAfter: number }
  | { ok: false; reason: 'already_claimed'; nextAt: Date };

/**
 * Réclame la récompense du jour civil courant. L'unicité (membre, jour) en base
 * garantit une seule attribution même en cas de clics simultanés.
 */
export async function claimDaily(memberId: string, guildId: string, discordUserId: string, now = new Date()): Promise<DailyClaimResult> {
  const settings = await getSettings(guildId);
  const key = dayKey(now, settings.timezone);
  const account = await getOrCreateAccount(memberId);

  try {
    const result = await prisma.$transaction(async (db) => {
      const updated = await db.account.update({ where: { id: account.id }, data: { balance: { increment: settings.dailyAmount } } });
      const tx = await db.transaction.create({
        data: {
          accountId: account.id,
          type: 'DAILY',
          delta: settings.dailyAmount,
          balanceAfter: updated.balance,
          reason: `Récompense du ${key}`,
          actorDiscordId: discordUserId,
        },
      });
      await db.dailyClaim.create({ data: { memberId, dayKey: key, transactionId: tx.id } });
      return { ok: true as const, amount: settings.dailyAmount, balanceAfter: updated.balance };
    });
    log.info(`Récompense ${key} : +${settings.dailyAmount} pour ${discordUserId}`);
    return result;
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
      return { ok: false, reason: 'already_claimed', nextAt: nextMidnight(now, settings.timezone) };
    }
    throw err;
  }
}
