import { createHash } from 'node:crypto';
import { dayKey } from '../../core/time.js';

/**
 * Taux du jour : aléatoire mais stable pour un membre, un taux et un jour civil donnés
 * (dérivé d'un hachage, aucun stockage). Change à minuit dans le fuseau du serveur.
 */
export function rateOfTheDay(guildId: string, userId: string, rateKey: string, timeZone: string, now = new Date()): number {
  const h = createHash('sha256').update(`${guildId}:${userId}:${rateKey}:${dayKey(now, timeZone)}`).digest();
  return h.readUInt16BE(0) % 101;
}

/** Taux du jour entre deux membres : symétrique (l'ordre ne change rien), stable sur la journée. */
export function duoRateOfTheDay(guildId: string, userA: string, userB: string, rateKey: string, timeZone: string, now = new Date()): number {
  const [a, b] = [userA, userB].sort();
  return rateOfTheDay(guildId, `${a}+${b}`, rateKey, timeZone, now);
}
