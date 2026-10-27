import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../../core/logger.js';
import { contentDir } from '../../core/paths.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { prisma } from '../../infrastructure/prisma.js';
import { getOrCreateAccount } from '../economy/economy.service.js';

const log = createLogger('theft');

export class TheftError extends Error {}

interface TheftTexts { reussites: string[]; echecs: string[]; echecs_fauches: string[] }
let texts: TheftTexts = { reussites: ['{v} dérobe {m} à {c}.'], echecs: ['{v} échoue et verse {m} à {c}.'], echecs_fauches: ['{v} échoue, sans un cœur pour dédommager {c}.'] };

export async function loadTheftTexts() {
  const data = JSON.parse(await readFile(path.join(contentDir, 'vols.json'), 'utf8')) as TheftTexts;
  for (const k of ['reussites', 'echecs', 'echecs_fauches'] as const) {
    if (!Array.isArray(data[k]) || !data[k].length) throw new Error(`vols.json : « ${k} » doit contenir au moins un texte`);
  }
  texts = data;
  log.info(`Textes de vol chargés : ${data.reussites.length} réussites, ${data.echecs.length} échecs`);
}

const pick = <T>(arr: T[]): T => arr[randomInt(arr.length)]!;

export interface TheftParty { id: string; discordUserId: string }

export interface TheftOutcome {
  success: boolean;
  /** Cœurs volés (réussite) ou amende versée à la cible (échec, 0 si le voleur est fauché). */
  amount: number;
  thiefBalanceAfter: number;
  text: string;
}

/** Butin ou amende : entre 10 et 100 % (tirés au sort) du plafond, plafond = part maximale du solde. */
function rollShare(balance: number, maxPercent: number): number {
  const cap = Math.floor((balance * maxPercent) / 100);
  if (cap < 1) return 0;
  return Math.max(1, Math.floor((cap * randomInt(10, 101)) / 100));
}

/**
 * Tentative de vol : une seule par délai (verrou atomique sur `lastTheftAt`), réussite tirée au sort.
 * Réussite : la cible perd une part de sa bourse, le voleur l'empoche. Échec : le voleur verse une
 * amende du même ordre (calculée sur sa propre bourse) à la cible. Tout se fait dans une transaction.
 */
export async function attemptTheft(thief: TheftParty, target: TheftParty, s: GuildSettings, names: { thief: string; target: string }, format: (n: number) => string): Promise<TheftOutcome> {
  if (thief.id === target.id) throw new TheftError('Se voler soi-même ? Même Voltron n’y comprend rien.');
  const [thiefAccount, targetAccount] = await Promise.all([getOrCreateAccount(thief.id), getOrCreateAccount(target.id)]);
  if (Math.floor((targetAccount.balance * s.theftMaxPercent) / 100) < 1) throw new TheftError('Cette bourse est trop maigre pour mériter un larcin.');

  const now = new Date();
  const since = new Date(now.getTime() - s.theftCooldownHours * 3_600_000);
  const { count } = await prisma.member.updateMany({
    where: { id: thief.id, OR: [{ lastTheftAt: null }, { lastTheftAt: { lt: since } }] },
    data: { lastTheftAt: now },
  });
  if (count === 0) {
    const m = await prisma.member.findUniqueOrThrow({ where: { id: thief.id }, select: { lastTheftAt: true } });
    const next = Math.floor((m.lastTheftAt!.getTime() + s.theftCooldownHours * 3_600_000) / 1000);
    throw new TheftError(`Tes pattes sont encore surveillées. Prochaine tentative possible <t:${next}:R>.`);
  }

  const success = randomInt(100) < s.theftSuccessPercent;
  const fill = (t: string, m: number) => t.replaceAll('{v}', names.thief).replaceAll('{c}', names.target).replaceAll('{m}', `**${format(m)}**`);

  const outcome = await prisma.$transaction(async (db) => {
    const common = { actorDiscordId: thief.discordUserId };
    if (success) {
      const fresh = await db.account.findUniqueOrThrow({ where: { id: targetAccount.id } });
      const amount = rollShare(fresh.balance, s.theftMaxPercent);
      if (amount < 1) return { success: true, amount: 0, thiefBalanceAfter: thiefAccount.balance, text: fill(pick(texts.echecs_fauches), 0) };
      const { count: ok } = await db.account.updateMany({ where: { id: targetAccount.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
      if (ok === 0) throw new TheftError('La cible a vidé sa bourse juste avant ton passage.');
      const victim = await db.account.findUniqueOrThrow({ where: { id: targetAccount.id } });
      await db.transaction.create({ data: { ...common, accountId: targetAccount.id, type: 'THEFT_LOSS', delta: -amount, balanceAfter: victim.balance, counterpartyDiscordId: thief.discordUserId } });
      const me = await db.account.update({ where: { id: thiefAccount.id }, data: { balance: { increment: amount } } });
      await db.transaction.create({ data: { ...common, accountId: thiefAccount.id, type: 'THEFT_GAIN', delta: amount, balanceAfter: me.balance, counterpartyDiscordId: target.discordUserId } });
      return { success: true, amount, thiefBalanceAfter: me.balance, text: fill(pick(texts.reussites), amount) };
    }

    const fresh = await db.account.findUniqueOrThrow({ where: { id: thiefAccount.id } });
    const fine = Math.min(fresh.balance, rollShare(fresh.balance, s.theftMaxPercent));
    const me = fine > 0
      ? await db.account.update({ where: { id: thiefAccount.id }, data: { balance: { decrement: fine } } })
      : fresh;
    await db.transaction.create({ data: { ...common, accountId: thiefAccount.id, type: 'THEFT_FINE', delta: -fine, balanceAfter: me.balance, counterpartyDiscordId: target.discordUserId } });
    if (fine > 0) {
      const victim = await db.account.update({ where: { id: targetAccount.id }, data: { balance: { increment: fine } } });
      await db.transaction.create({ data: { ...common, accountId: targetAccount.id, type: 'THEFT_COMPENSATION', delta: fine, balanceAfter: victim.balance, counterpartyDiscordId: thief.discordUserId } });
    }
    return { success: false, amount: fine, thiefBalanceAfter: me.balance, text: fill(pick(fine > 0 ? texts.echecs : texts.echecs_fauches), fine) };
  });

  log.info(`Vol ${outcome.success ? 'réussi' : 'raté'} : ${thief.discordUserId} → ${target.discordUserId}, ${outcome.amount}`);
  return outcome;
}
