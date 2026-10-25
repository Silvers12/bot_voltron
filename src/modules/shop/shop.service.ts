import type { Guild, GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
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

/** Vérifie que le bot peut attribuer ce rôle : permission, hiérarchie, rôle non géré par une intégration. */
export function roleAssignabilityProblem(guild: Guild, roleId: string): string | null {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role) return 'Ce rôle n’existe plus sur le serveur.';
  if (!me) return 'Le bot n’est pas chargé sur ce serveur.';
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'Le bot n’a pas la permission « Gérer les rôles ».';
  if (role.managed) return 'Ce rôle est géré par une intégration et ne peut pas être attribué.';
  if (role.position >= me.roles.highest.position) return 'Ce rôle est placé au-dessus du rôle du bot : déplacez le rôle de Voltron plus haut dans la liste des rôles.';
  return null;
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
