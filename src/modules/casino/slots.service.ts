import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { credit, debit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { evaluate, spinReels, type SpinOutcome } from './slots.js';

const log = createLogger('slots');

export interface SpinResult extends SpinOutcome {
  bet: number;
  /** Gain crédité (0 si rien) */
  payout: number;
  balanceAfter: number;
  /** Cagnotte après ce tour */
  pool: number;
}

export async function getJackpot(guildId: string) {
  const s = await getSettings(guildId);
  return prisma.slotJackpot.upsert({ where: { guildId }, create: { guildId, pool: s.slotJackpotSeed }, update: {} });
}

/**
 * Modèle fermé : la mise entre intégralement dans la cagnotte. Trois loutres la raflent entière
 * (elle repart du montant de départ), trois autres symboles identiques en prennent une part.
 * La banque ne crée des cœurs que pour l'amorce.
 */
export async function playSlots(member: { id: string; guildId: string; discordUserId: string }): Promise<SpinResult> {
  const s = await getSettings(member.guildId);
  const bet = s.slotBet;

  const debited = await debit({ memberId: member.id, amount: bet, type: 'BET', actorDiscordId: member.discordUserId, reason: 'Machine à sous : mise' });
  await getJackpot(member.guildId);

  const outcome = evaluate(spinReels());

  const { payout, pool } = await prisma.$transaction(async (db) => {
    const [row] = await db.$queryRaw<Array<{ pool: number }>>`SELECT "pool" FROM "SlotJackpot" WHERE "guildId" = ${member.guildId} FOR UPDATE`;
    const before = (row?.pool ?? 0) + bet;
    let payout = 0;
    let after = before;
    if (outcome.kind === 'jackpot') {
      payout = before;
      after = s.slotJackpotSeed;
    } else if (outcome.kind === 'triple') {
      payout = Math.floor((before * s.slotTriplePercent) / 100);
      after = before - payout;
    }
    await db.member.update({ where: { id: member.id }, data: { slotSpins: { increment: 1 }, ...(outcome.kind === 'jackpot' ? { slotJackpots: { increment: 1 } } : {}) } });
    await db.slotJackpot.update({
      where: { guildId: member.guildId },
      data: outcome.kind === 'jackpot'
        ? { pool: after, lastWinnerDiscordId: member.discordUserId, lastWonAmount: payout, lastWonAt: new Date() }
        : { pool: after },
    });
    return { payout, pool: after };
  });

  let balanceAfter = debited.balanceAfter;
  if (payout > 0) {
    const reason = outcome.kind === 'jackpot' ? `Machine à sous : JACKPOT ${outcome.reels.join('')}` : `Machine à sous : ${outcome.reels.join('')}`;
    balanceAfter = (await credit({ memberId: member.id, amount: payout, type: 'BET_WIN', actorDiscordId: member.discordUserId, reason })).balanceAfter;
  }
  log.info(`${member.discordUserId} : ${outcome.reels.join(' ')} ${outcome.kind} gain ${payout} (cagnotte ${pool})`);
  return { ...outcome, bet, payout, balanceAfter, pool };
}
