import { contentDir } from '../../core/paths.js';
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import type { Duel } from '../../generated/prisma/client.js';
import { credit, debit, InsufficientFundsError } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';

import { botName } from '../../core/identity.js';
const log = createLogger('duel');

export const DUEL_TTL_MS = 2 * 60 * 1000;

export class DuelError extends Error {}

interface DuelTexts { attaques: string[]; victoires: string[]; egalites: string[] }
let texts: DuelTexts = { attaques: ['{a} attaque'], victoires: ['{w} gagne'], egalites: ['Égalité'] };

export async function loadDuelTexts() {
  const file = path.join(contentDir, 'duels.json');
  const data = JSON.parse(await readFile(file, 'utf8')) as DuelTexts;
  for (const k of ['attaques', 'victoires', 'egalites'] as const) {
    if (!Array.isArray(data[k]) || !data[k].length) throw new Error(`duels.json : « ${k} » doit contenir au moins un texte`);
  }
  texts = data;
  log.info(`Textes de duel chargés : ${data.attaques.length} attaques, ${data.victoires.length} victoires`);
}

const pick = <T>(arr: T[]): T => arr[randomInt(arr.length)]!;

export type DuelWithMembers = Duel & { challenger: { discordUserId: string; displayName: string }; opponent: { discordUserId: string; displayName: string } };

const withMembers = { challenger: { select: { discordUserId: true, displayName: true } }, opponent: { select: { discordUserId: true, displayName: true } } } as const;

export function getDuel(id: string): Promise<DuelWithMembers | null> {
  return prisma.duel.findUnique({ where: { id }, include: withMembers });
}

/** Crée le défi et bloque la mise du défieur. */
export async function createDuel(input: { guildId: string; channelId: string; challenger: { id: string; discordUserId: string }; opponentId: string; stake: number }): Promise<DuelWithMembers> {
  const s = await getSettings(input.guildId);
  if (!Number.isInteger(input.stake) || input.stake < s.duelMinStake || input.stake > s.duelMaxStake) {
    throw new DuelError(`La mise doit être comprise entre ${s.duelMinStake} et ${s.duelMaxStake}.`);
  }
  if (input.challenger.id === input.opponentId) throw new DuelError(`Se défier soi-même ? ${botName()} admire l’audace, mais non.`);
  const pending = await prisma.duel.findFirst({ where: { challengerId: input.challenger.id, state: 'PENDING' } });
  if (pending) throw new DuelError('Tu as déjà un défi en attente. Attends la réponse ou annule-le.');

  await debit({ memberId: input.challenger.id, amount: input.stake, type: 'DUEL_STAKE', actorDiscordId: input.challenger.discordUserId, reason: 'Duel : mise bloquée' });
  let duel: DuelWithMembers;
  try {
    duel = await prisma.duel.create({
      data: { guildId: input.guildId, channelId: input.channelId, challengerId: input.challenger.id, opponentId: input.opponentId, stake: input.stake, expiresAt: new Date(Date.now() + DUEL_TTL_MS) },
      include: withMembers,
    });
  } catch (err) {
    // Index unique partiel : un second défi lancé au même instant est refusé et la mise rendue.
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
      await credit({ memberId: input.challenger.id, amount: input.stake, type: 'DUEL_REFUND', actorDiscordId: 'voltron', reason: 'Duel en double, mise rendue' });
      throw new DuelError('Tu as déjà un défi en attente. Attends la réponse ou annule-le.');
    }
    throw err;
  }
  log.info(`Duel ${duel.id} : ${input.challenger.discordUserId} défie ${duel.opponent.discordUserId} pour ${input.stake}`);
  return duel;
}

export function setMessage(id: string, messageId: string) {
  return prisma.duel.update({ where: { id }, data: { messageId } });
}

/** Passe le duel de PENDING à `state` de façon atomique ; renvoie false s'il n'était plus en attente. */
async function transition(id: string, state: 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'RESOLVED', extra: Record<string, unknown> = {}): Promise<boolean> {
  const { count } = await prisma.duel.updateMany({ where: { id, state: 'PENDING' }, data: { state, resolvedAt: new Date(), ...extra } });
  return count === 1;
}

async function refundChallenger(duel: Duel, reason: string) {
  await credit({ memberId: duel.challengerId, amount: duel.stake, type: 'DUEL_REFUND', actorDiscordId: 'voltron', reason });
}

export async function declineDuel(duel: Duel): Promise<boolean> {
  if (!(await transition(duel.id, 'DECLINED'))) return false;
  await refundChallenger(duel, 'Duel refusé');
  return true;
}

export async function cancelDuel(duel: Duel): Promise<boolean> {
  if (!(await transition(duel.id, 'CANCELLED'))) return false;
  await refundChallenger(duel, 'Duel annulé');
  return true;
}

export async function expireDuel(duel: Duel): Promise<boolean> {
  if (!(await transition(duel.id, 'EXPIRED'))) return false;
  await refundChallenger(duel, 'Duel sans réponse');
  return true;
}

export interface DuelResolution {
  duel: DuelWithMembers;
  rounds: Array<{ text: string; challengerRoll: number; opponentRoll: number }>;
  winnerId: string;
  loserId: string;
  pot: number;
  finish: string;
}

/**
 * L'adversaire accepte : sa mise est bloquée, puis les dés tranchent (d20 chacun, relance en cas d'égalité).
 * Le gagnant reçoit les deux mises. Rien n'est débité si le duel n'est plus en attente.
 */
export async function acceptDuel(duel: DuelWithMembers, opponent: { id: string; discordUserId: string }): Promise<DuelResolution | null> {
  const fresh = await getDuel(duel.id);
  if (!fresh || fresh.state !== 'PENDING') return null;
  if (fresh.expiresAt.getTime() <= Date.now()) { await expireDuel(fresh); return null; }

  // Mise de l'adversaire : si elle échoue, le duel reste en attente.
  await debit({ memberId: opponent.id, amount: fresh.stake, type: 'DUEL_STAKE', actorDiscordId: opponent.discordUserId, reason: 'Duel : mise bloquée' });

  const rounds: DuelResolution['rounds'] = [];
  let c = 0, o = 0;
  do {
    c = randomInt(1, 21); o = randomInt(1, 21);
    const attacker = randomInt(2) === 0 ? fresh.challenger : fresh.opponent;
    rounds.push({ text: pick(texts.attaques).replaceAll('{bot}', botName()).replaceAll('{a}', `**${attacker.displayName}**`), challengerRoll: c, opponentRoll: o });
    if (c === o) rounds.push({ text: pick(texts.egalites), challengerRoll: c, opponentRoll: o });
  } while (c === o && rounds.length < 10);
  if (c === o) c++; // garde-fou improbable

  const winnerId = c > o ? fresh.challengerId : fresh.opponentId;
  const loserId = winnerId === fresh.challengerId ? fresh.opponentId : fresh.challengerId;
  const pot = fresh.stake * 2;

  if (!(await transition(fresh.id, 'RESOLVED', { winnerId, challengerRoll: c, opponentRoll: o }))) {
    // Quelqu'un a annulé/expiré entre-temps : on rend sa mise à l'adversaire.
    await credit({ memberId: opponent.id, amount: fresh.stake, type: 'DUEL_REFUND', actorDiscordId: 'voltron', reason: 'Duel interrompu' });
    return null;
  }
  const winnerDiscordId = winnerId === fresh.challengerId ? fresh.challenger.discordUserId : fresh.opponent.discordUserId;
  await credit({ memberId: winnerId, amount: pot, type: 'DUEL_WIN', actorDiscordId: winnerDiscordId, reason: `Duel gagné (${c} contre ${o})` });

  const winner = winnerId === fresh.challengerId ? fresh.challenger : fresh.opponent;
  const loser = winnerId === fresh.challengerId ? fresh.opponent : fresh.challenger;
  const finish = pick(texts.victoires).replaceAll('{bot}', botName()).replaceAll('{w}', `**${winner.displayName}**`).replaceAll('{l}', `**${loser.displayName}**`);
  log.info(`Duel ${fresh.id} : ${winnerDiscordId} gagne ${pot} (${c} contre ${o})`);
  return { duel: (await getDuel(fresh.id))!, rounds, winnerId, loserId, pot, finish };
}

/** Au démarrage : expire les défis dépassés (remboursés) et renvoie ceux encore en attente. */
export async function reconcileDuels(): Promise<DuelWithMembers[]> {
  const pending = await prisma.duel.findMany({ where: { state: 'PENDING' }, include: withMembers });
  const stillOpen: DuelWithMembers[] = [];
  for (const d of pending) {
    if (d.expiresAt.getTime() <= Date.now()) await expireDuel(d);
    else stillOpen.push(d);
  }
  if (pending.length) log.info(`${pending.length - stillOpen.length} duel(s) expiré(s), ${stillOpen.length} repris.`);
  return stillOpen;
}

export { InsufficientFundsError };
