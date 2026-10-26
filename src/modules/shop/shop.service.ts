import type { GuildMember } from 'discord.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import type { InventoryItem, ItemKind, ShopItem } from '../../generated/prisma/client.js';
import { credit, getOrCreateAccount, InsufficientFundsError } from '../economy/economy.service.js';

const log = createLogger('shop');

export class PurchaseError extends Error {
  constructor(public readonly code: 'unavailable' | 'out_of_stock' | 'limit_reached' | 'role_not_manageable', message: string) {
    super(message);
  }
}

export interface ItemInput {
  name: string;
  description?: string | null;
  emoji?: string | null;
  price: number;
  kind?: ItemKind;
  roleId?: string | null;
  stock?: number | null;
  maxPerMember?: number | null;
  sortOrder?: number;
}

export function listItems(guildId: string, { includeInactive = false } = {}): Promise<ShopItem[]> {
  return prisma.shopItem.findMany({
    where: { guildId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }, { name: 'asc' }],
  });
}

export function getItem(id: string): Promise<ShopItem | null> {
  return prisma.shopItem.findUnique({ where: { id } });
}

export function findItemByName(guildId: string, name: string): Promise<ShopItem | null> {
  return prisma.shopItem.findUnique({ where: { guildId_name: { guildId, name } } });
}

export function createItem(guildId: string, input: ItemInput): Promise<ShopItem> {
  return prisma.shopItem.create({ data: { guildId, ...input } });
}

export function updateItem(id: string, input: Partial<ItemInput> & { active?: boolean }): Promise<ShopItem> {
  return prisma.shopItem.update({ where: { id }, data: input });
}

export type InventoryEntry = InventoryItem & { item: ShopItem };

export function getInventory(memberId: string): Promise<InventoryEntry[]> {
  return prisma.inventoryItem.findMany({ where: { memberId, quantity: { gt: 0 } }, include: { item: true }, orderBy: { createdAt: 'asc' } });
}

export async function getOwnedQuantity(memberId: string, itemId: string): Promise<number> {
  const entry = await prisma.inventoryItem.findUnique({ where: { memberId_itemId: { memberId, itemId } } });
  return entry?.quantity ?? 0;
}

export { roleAssignabilityProblem };

/** Titre porté par un membre (null si aucun). */
export async function getEquippedTitle(memberId: string): Promise<ShopItem | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { title: true } });
  return m?.title ?? null;
}

/** Titres possédés par un membre. */
export async function listOwnedTitles(memberId: string): Promise<ShopItem[]> {
  const entries = await prisma.inventoryItem.findMany({ where: { memberId, item: { kind: 'TITLE' } }, include: { item: true }, orderBy: { createdAt: 'asc' } });
  return entries.map((e) => e.item);
}

/** Porte un titre possédé, ou aucun (null). Refuse un titre non possédé. */
export async function equipTitle(memberId: string, itemId: string | null): Promise<ShopItem | null> {
  if (itemId === null) {
    await prisma.member.update({ where: { id: memberId }, data: { titleItemId: null } });
    return null;
  }
  const owned = await prisma.inventoryItem.findUnique({ where: { memberId_itemId: { memberId, itemId } }, include: { item: true } });
  if (!owned || owned.item.kind !== 'TITLE') throw new PurchaseError('unavailable', 'Tu ne possèdes pas ce titre.');
  await prisma.member.update({ where: { id: memberId }, data: { titleItemId: itemId } });
  return owned.item;
}

export interface PurchaseResult {
  item: ShopItem;
  balanceAfter: number;
  quantityOwned: number;
}

/**
 * Achète un exemplaire : débit, décrément de stock, ajout à l'inventaire et écriture d'historique
 * dans une même transaction. Les vérifications de solde, stock et limite sont atomiques.
 * Pour un article ROLE, le rôle est attribué après coup ; en cas d'échec l'achat est remboursé.
 */
export async function purchase(item: ShopItem, member: { id: string; discordUserId: string }, guildMember: GuildMember): Promise<PurchaseResult> {
  if (!item.active) throw new PurchaseError('unavailable', 'Cet article n’est plus en vente.');

  if (item.kind === 'ROLE') {
    if (!item.roleId) throw new PurchaseError('unavailable', 'Cet article n’a pas de rôle associé.');
    const problem = roleAssignabilityProblem(guildMember.guild, item.roleId);
    if (problem) throw new PurchaseError('role_not_manageable', problem);
  }

  const account = await getOrCreateAccount(member.id);

  const result = await prisma.$transaction(async (db) => {
    // 1. Stock (si limité) : décrément conditionnel
    if (item.stock !== null) {
      const { count } = await db.shopItem.updateMany({ where: { id: item.id, active: true, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
      if (count === 0) throw new PurchaseError('out_of_stock', 'Il n’en reste plus en rayon.');
    }

    // 2. Limite par membre : on incrémente puis on vérifie ; un dépassement annule tout
    const entry = await db.inventoryItem.upsert({
      where: { memberId_itemId: { memberId: member.id, itemId: item.id } },
      create: { memberId: member.id, itemId: item.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    if (item.maxPerMember !== null && entry.quantity > item.maxPerMember) {
      throw new PurchaseError('limit_reached', item.maxPerMember === 1 ? 'Tu possèdes déjà cet article.' : `Tu as atteint la limite de ${item.maxPerMember} exemplaires.`);
    }

    // 3. Paiement : débit conditionnel
    const { count } = await db.account.updateMany({ where: { id: account.id, balance: { gte: item.price } }, data: { balance: { decrement: item.price } } });
    const current = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    if (count === 0) throw new InsufficientFundsError(current.balance, item.price);

    await db.transaction.create({
      data: {
        accountId: account.id,
        type: 'PURCHASE',
        delta: -item.price,
        balanceAfter: current.balance,
        reason: item.name,
        actorDiscordId: member.discordUserId,
      },
    });

    return { item, balanceAfter: current.balance, quantityOwned: entry.quantity };
  });

  log.info(`Achat « ${item.name} » (${item.price}) par ${member.discordUserId}`);

  // Premier titre acheté : porté aussitôt, pour qu'il soit visible sans manipulation.
  if (item.kind === 'TITLE') await prisma.member.updateMany({ where: { id: member.id, titleItemId: null }, data: { titleItemId: item.id } });

  if (item.kind === 'ROLE' && item.roleId) {
    try {
      await guildMember.roles.add(item.roleId, `Achat en boutique : ${item.name}`);
    } catch (err) {
      log.error(`Attribution du rôle ${item.roleId} échouée, remboursement`, err);
      await refundPurchase(item, member);
      throw new PurchaseError('role_not_manageable', 'Discord a refusé l’attribution du rôle. Tu as été remboursé ; préviens un administrateur.');
    }
  }

  return result;
}

/** Annule un achat : remet le stock, retire l'exemplaire et recrédite le prix. */
async function refundPurchase(item: ShopItem, member: { id: string; discordUserId: string }) {
  await prisma.$transaction(async (db) => {
    if (item.stock !== null) await db.shopItem.update({ where: { id: item.id }, data: { stock: { increment: 1 } } });
    await db.inventoryItem.update({ where: { memberId_itemId: { memberId: member.id, itemId: item.id } }, data: { quantity: { decrement: 1 } } });
  });
  await credit({ memberId: member.id, amount: item.price, type: 'REFUND', actorDiscordId: 'voltron', reason: `Remboursement : ${item.name}` });
}
