import { createLogger } from '../../core/logger.js';
import { credit, debit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { evaluate, spinReels, type SpinOutcome } from './slots.js';

const log = createLogger('slots');

export class SlotsError extends Error {}

export interface SpinResult extends SpinOutcome {
  bet: number;
  payout: number;
  balanceAfter: number;
}

/** Débite la mise, lance les rouleaux, crédite le gain éventuel. */
export async function playSlots(member: { id: string; guildId: string; discordUserId: string }, bet: number): Promise<SpinResult> {
  const s = await getSettings(member.guildId);
  if (!Number.isInteger(bet) || bet < s.slotMinBet || bet > s.slotMaxBet) {
    throw new SlotsError(`La mise doit être comprise entre ${s.slotMinBet} et ${s.slotMaxBet}.`);
  }
  const debited = await debit({ memberId: member.id, amount: bet, type: 'BET', actorDiscordId: member.discordUserId, reason: 'Machine à sous : mise' });
  const outcome = evaluate(spinReels());
  const payout = bet * outcome.multiplier;
  let balanceAfter = debited.balanceAfter;
  if (payout > 0) {
    const credited = await credit({ memberId: member.id, amount: payout, type: 'BET_WIN', actorDiscordId: member.discordUserId, reason: `Machine à sous : ${outcome.reels.join('')} ×${outcome.multiplier}` });
    balanceAfter = credited.balanceAfter;
  }
  log.info(`${member.discordUserId} : ${outcome.reels.join(' ')} ×${outcome.multiplier} (mise ${bet})`);
  return { ...outcome, bet, payout, balanceAfter };
}
