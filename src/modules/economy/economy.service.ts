import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import type { Account, Transaction, TransactionType } from '../../generated/prisma/client.js';
import { getSettings } from '../settings/settings.service.js';

const log = createLogger('economy');

export class InsufficientFundsError extends Error {
  constructor(public readonly balance: number, public readonly requested: number) {
    super(`Solde insuffisant : ${balance} disponible, ${requested} demandé`);
  }
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError('Le montant doit être un entier strictement positif');
}

/**
 * Bourse du membre. À la première ouverture, elle est créée avec le solde de bienvenue
 * du serveur et un mouvement WELCOME dans l'historique.
 */
export async function getOrCreateAccount(memberId: string): Promise<Account> {
  const existing = await prisma.account.findUnique({ where: { memberId } });
  if (existing) return existing;

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  const { startingBalance } = await getSettings(member.guildId);

  try {
    return await prisma.$transaction(async (db) => {
      const account = await db.account.create({ data: { memberId, balance: startingBalance } });
      if (startingBalance > 0) {
        await db.transaction.create({
          data: {
            accountId: account.id,
            type: 'WELCOME',
            delta: startingBalance,
            balanceAfter: startingBalance,
            reason: 'Bourse de bienvenue',
            actorDiscordId: 'voltron',
          },
        });
      }
      log.info(`Bourse ouverte pour le membre ${memberId} avec ${startingBalance}`);
      return account;
    });
  } catch (err) {
    // Création concurrente (deux interactions simultanées) : l'unicité en base tranche, on relit.
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
      return prisma.account.findUniqueOrThrow({ where: { memberId } });
    }
    throw err;
  }
}

export async function getBalance(memberId: string): Promise<number> {
  return (await getOrCreateAccount(memberId)).balance;
}

interface MovementInput {
  memberId: string;
  amount: number;
  type: TransactionType;
  actorDiscordId: string;
  reason?: string | null;
  counterpartyDiscordId?: string | null;
}

type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function creditWithin(db: Db, accountId: string, input: MovementInput): Promise<Transaction> {
  const updated = await db.account.update({ where: { id: accountId }, data: { balance: { increment: input.amount } } });
  return db.transaction.create({
    data: {
      accountId,
      type: input.type,
      delta: input.amount,
      balanceAfter: updated.balance,
      reason: input.reason ?? null,
      actorDiscordId: input.actorDiscordId,
      counterpartyDiscordId: input.counterpartyDiscordId ?? null,
    },
  });
}

/** Débit conditionnel : appliqué uniquement si le solde suffit, vérifié atomiquement en base. */
async function debitWithin(db: Db, accountId: string, input: MovementInput): Promise<Transaction> {
  const { count } = await db.account.updateMany({
    where: { id: accountId, balance: { gte: input.amount } },
    data: { balance: { decrement: input.amount } },
  });
  const current = await db.account.findUniqueOrThrow({ where: { id: accountId } });
  if (count === 0) throw new InsufficientFundsError(current.balance, input.amount);
  return db.transaction.create({
    data: {
      accountId,
      type: input.type,
      delta: -input.amount,
      balanceAfter: current.balance,
      reason: input.reason ?? null,
      actorDiscordId: input.actorDiscordId,
      counterpartyDiscordId: input.counterpartyDiscordId ?? null,
    },
  });
}

/** Ajoute `amount` à la bourse (crédit + écriture d'historique dans une même transaction). */
export async function credit(input: MovementInput): Promise<Transaction> {
  assertAmount(input.amount);
  const account = await getOrCreateAccount(input.memberId);
  const tx = await prisma.$transaction((db) => creditWithin(db, account.id, input));
  log.info(`Crédit ${input.amount} → membre ${input.memberId} (${input.type}, par ${input.actorDiscordId})`);
  return tx;
}

/** Retire `amount` de la bourse ; échoue sans rien modifier si le solde est insuffisant. */
export async function debit(input: MovementInput): Promise<Transaction> {
  assertAmount(input.amount);
  const account = await getOrCreateAccount(input.memberId);
  const tx = await prisma.$transaction((db) => debitWithin(db, account.id, input));
  log.info(`Débit ${input.amount} ← membre ${input.memberId} (${input.type}, par ${input.actorDiscordId})`);
  return tx;
}

export interface HugInput {
  fromMemberId: string;
  fromDiscordId: string;
  toMemberId: string;
  toDiscordId: string;
  amount: number;
  reason?: string | null;
}

/** Un câlin : transfert de cœurs entre deux membres, débit et crédit dans une même transaction. */
export async function hug(input: HugInput): Promise<{ sent: Transaction; received: Transaction }> {
  assertAmount(input.amount);
  if (input.fromMemberId === input.toMemberId) throw new RangeError('On ne peut pas se faire un câlin à soi-même');
  const [from, to] = await Promise.all([getOrCreateAccount(input.fromMemberId), getOrCreateAccount(input.toMemberId)]);

  const result = await prisma.$transaction(async (db) => {
    const sent = await debitWithin(db, from.id, {
      memberId: input.fromMemberId,
      amount: input.amount,
      type: 'HUG_SENT',
      actorDiscordId: input.fromDiscordId,
      counterpartyDiscordId: input.toDiscordId,
      reason: input.reason,
    });
    const received = await creditWithin(db, to.id, {
      memberId: input.toMemberId,
      amount: input.amount,
      type: 'HUG_RECEIVED',
      actorDiscordId: input.fromDiscordId,
      counterpartyDiscordId: input.fromDiscordId,
      reason: input.reason,
    });
    return { sent, received };
  });
  log.info(`Câlin ${input.amount} : ${input.fromDiscordId} → ${input.toDiscordId}`);
  return result;
}

/** Derniers mouvements de la bourse, du plus récent au plus ancien. */
export async function getHistory(memberId: string, limit = 10): Promise<Transaction[]> {
  const account = await getOrCreateAccount(memberId);
  return prisma.transaction.findMany({ where: { accountId: account.id }, orderBy: { createdAt: 'desc' }, take: limit });
}
