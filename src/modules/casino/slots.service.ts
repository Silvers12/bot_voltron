import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { credit, debit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { evaluate, spinReels, type SpinOutcome } from './slots.js';

const log = createLogger('slots');

export class SlotsError extends Error {}

export interface SpinResult extends SpinOutcome {
  bet: number;
  /** Gain total crédité */
  payout: number;
  /** Part du gain qui est la cagnotte raflée (trois loutres) */
  jackpotWon: number;
  balanceAfter: number;
  /** Cagnotte après ce tour */
  pool: number;
}

export async function getJackpot(guildId: string) {
  const s = await getSettings(guildId);
  return prisma.slotJackpot.upsert({ where: { guildId }, create: { guildId, pool: s.slotJackpotSeed }, update: {} });
}

/**
 * Modèle fermé : chaque mise entre intégralement dans la cagnotte, chaque gain en sort.
 * Trois loutres raflent tout ce qu'elle contient. La banque n'intervient que pour l'amorcer
 * (montant de départ) et pour couvrir un gain plus grand que la cagnotte.
 */
export async function playSlots(member: { id: string; guildId: string; discordUserId: string }, bet: number): Promise<SpinResult> {
  const s = await getSettings(member.guildId);
  if (!Number.isInteger(bet) || bet < s.slotMinBet || bet > s.slotMaxBet) {
    throw new SlotsError(`La mise doit être comprise entre ${s.slotMinBet} et ${s.slotMaxBet}.`);
  }

  const debited = await debit({ memberId: member.id, amount: bet, type: 'BET', actorDiscordId: member.discordUserId, reason: 'Machine à sous : mise' });
  await getJackpot(member.guildId);

  const outcome = evaluate(spinReels());
  const win = bet * outcome.multiplier;

  // Mise versée, gain prélevé et cagnotte raflée dans une seule transaction, sur la ligne verrouillée.
  const { payout, jackpotWon, pool } = await prisma.$transaction(async (db) => {
    const [row] = await db.$queryRaw<Array<{ pool: number }>>`SELECT "pool" FROM "SlotJackpot" WHERE "guildId" = ${member.guildId} FOR UPDATE`;
    const before = (row?.pool ?? 0) + bet;
    let payout = win;
    let jackpotWon = 0;
    let after: number;
    if (outcome.jackpot) {
      jackpotWon = before;
      payout = before; // le ×10 des loutres est compris dans la cagnotte
      after = s.slotJackpotSeed;
    } else {
      after = before - win; // peut passer sous le montant de départ ; la banque couvre si négatif
      if (after < 0) after = 0;
    }
    await db.slotJackpot.update({
      where: { guildId: member.guildId },
      data: outcome.jackpot
        ? { pool: after, lastWinnerDiscordId: member.discordUserId, lastWonAmount: jackpotWon, lastWonAt: new Date() }
        : { pool: after },
    });
    return { payout, jackpotWon, pool: after };
  });

  let balanceAfter = debited.balanceAfter;
  if (payout > 0) {
    const reason = jackpotWon > 0 ? `Machine à sous : JACKPOT ${outcome.reels.join('')}` : `Machine à sous : ${outcome.reels.join('')} ×${outcome.multiplier}`;
    balanceAfter = (await credit({ memberId: member.id, amount: payout, type: 'BET_WIN', actorDiscordId: member.discordUserId, reason })).balanceAfter;
  }
  log.info(`${member.discordUserId} : ${outcome.reels.join(' ')} ×${outcome.multiplier}${jackpotWon ? ` cagnotte ${jackpotWon}` : ''} (mise ${bet}, cagnotte ${pool})`);
  return { ...outcome, bet, payout, jackpotWon, balanceAfter, pool };
}
