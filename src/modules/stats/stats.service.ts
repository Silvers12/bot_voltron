import { prisma } from '../../infrastructure/prisma.js';
import { computeStats } from '../achievements/achievements.service.js';
import type { MemberStats as BaseStats } from '../achievements/achievements.catalog.js';

export interface GameStats extends BaseStats {
  /** Bilans nets en cœurs (gains − mises) */
  blackjackNet: number;
  slotsNet: number;
  duelNet: number;
  lotteryNet: number;
  groupHugEarned: number;
  hugsReceivedTotal: number;
  countingFines: number;
  countingFineTotal: number;
  thefts: number;
  theftSuccesses: number;
  theftNet: number;
}

/** Statistiques de jeu d'un membre : compteurs du catalogue de succès + bilans en cœurs. */
export async function computeGameStats(memberId: string): Promise<GameStats> {
  const [base, bj, nets] = await Promise.all([
    computeStats(memberId),
    prisma.blackjackGame.aggregate({ where: { memberId, state: { not: 'PLAYING' } }, _sum: { payout: true, bet: true } }),
    prisma.$queryRaw<Array<{ slots: bigint | null; duel: bigint | null; lottery: bigint | null; hugs: bigint | null; received: bigint | null; fines: bigint | null; fine_count: bigint; theft: bigint | null; theft_count: bigint; theft_ok: bigint }>>`
      SELECT
        SUM(CASE WHEN t.type IN ('BET','BET_WIN') AND t.reason LIKE 'Machine à sous%' THEN t.delta ELSE 0 END) AS slots,
        SUM(CASE WHEN t.type IN ('DUEL_STAKE','DUEL_WIN','DUEL_REFUND') THEN t.delta ELSE 0 END) AS duel,
        SUM(CASE WHEN t.type IN ('LOTTERY_TICKET','LOTTERY_WIN') THEN t.delta ELSE 0 END) AS lottery,
        SUM(CASE WHEN t.type = 'GROUP_HUG' THEN t.delta ELSE 0 END) AS hugs,
        SUM(CASE WHEN t.type = 'HUG_RECEIVED' THEN t.delta ELSE 0 END) AS received,
        SUM(CASE WHEN t.type = 'COUNTING_FINE' THEN t.delta ELSE 0 END) AS fines,
        COUNT(CASE WHEN t.type = 'COUNTING_FINE' THEN 1 END) AS fine_count,
        SUM(CASE WHEN t.type IN ('THEFT_GAIN','THEFT_LOSS','THEFT_FINE','THEFT_COMPENSATION') THEN t.delta ELSE 0 END) AS theft,
        COUNT(CASE WHEN t.type IN ('THEFT_GAIN','THEFT_FINE') THEN 1 END) AS theft_count,
        COUNT(CASE WHEN t.type = 'THEFT_GAIN' THEN 1 END) AS theft_ok
      FROM "Transaction" t JOIN "Account" a ON a.id = t."accountId"
      WHERE a."memberId" = ${memberId}`,
  ]);
  const n = nets[0];
  const num = (v: bigint | null | undefined) => Number(v ?? 0);
  // Les doubles ne sont pas distingués dans l'agrégat : la mise d'une partie doublée vaut 2 × bet.
  const doubled = await prisma.blackjackGame.aggregate({ where: { memberId, state: { not: 'PLAYING' }, doubled: true }, _sum: { bet: true } });
  const staked = (bj._sum.bet ?? 0) + (doubled._sum.bet ?? 0);
  return {
    ...base,
    blackjackNet: (bj._sum.payout ?? 0) - staked,
    slotsNet: num(n?.slots),
    duelNet: num(n?.duel),
    lotteryNet: num(n?.lottery),
    groupHugEarned: num(n?.hugs),
    hugsReceivedTotal: num(n?.received),
    countingFines: num(n?.fine_count),
    countingFineTotal: -num(n?.fines),
    thefts: num(n?.theft_count),
    theftSuccesses: num(n?.theft_ok),
    theftNet: num(n?.theft),
  };
}
