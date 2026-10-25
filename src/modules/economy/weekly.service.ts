import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { nextMonday, weekKey } from '../../core/time.js';
import { getSettings } from '../settings/settings.service.js';
import { getOrCreateAccount } from './economy.service.js';

const log = createLogger('weekly');

export interface WeeklyStatus {
  claimedThisWeek: boolean;
  /** Prochain lundi à minuit dans le fuseau du serveur */
  nextAt: Date;
  amount: number;
}

export async function getWeeklyStatus(memberId: string, guildId: string, now = new Date()): Promise<WeeklyStatus> {
  const settings = await getSettings(guildId);
  const claim = await prisma.weeklyClaim.findUnique({
    where: { memberId_weekKey: { memberId, weekKey: weekKey(now, settings.timezone) } },
  });
  return { claimedThisWeek: claim !== null, nextAt: nextMonday(now, settings.timezone), amount: settings.weeklyAmount };
}

export type WeeklyClaimResult =
  | { ok: true; amount: number; balanceAfter: number }
  | { ok: false; reason: 'already_claimed'; nextAt: Date };

/** Réclame la récompense de la semaine civile courante (lundi → dimanche). Une seule par membre et par semaine. */
export async function claimWeekly(memberId: string, guildId: string, discordUserId: string, now = new Date()): Promise<WeeklyClaimResult> {
  const settings = await getSettings(guildId);
  const key = weekKey(now, settings.timezone);
  const account = await getOrCreateAccount(memberId);

  try {
    const result = await prisma.$transaction(async (db) => {
      const updated = await db.account.update({ where: { id: account.id }, data: { balance: { increment: settings.weeklyAmount } } });
      const tx = await db.transaction.create({
        data: {
          accountId: account.id,
          type: 'WEEKLY',
          delta: settings.weeklyAmount,
          balanceAfter: updated.balance,
          reason: `Récompense de la semaine ${key}`,
          actorDiscordId: discordUserId,
        },
      });
      await db.weeklyClaim.create({ data: { memberId, weekKey: key, transactionId: tx.id } });
      return { ok: true as const, amount: settings.weeklyAmount, balanceAfter: updated.balance };
    });
    log.info(`Récompense ${key} : +${settings.weeklyAmount} pour ${discordUserId}`);
    return result;
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
      return { ok: false, reason: 'already_claimed', nextAt: nextMonday(now, settings.timezone) };
    }
    throw err;
  }
}
