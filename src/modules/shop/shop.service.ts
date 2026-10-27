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
    orderBy: [{ price: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
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

interface CatalogItem {
  name: string; emoji?: string | null; price: number; kind?: 'COLLECTIBLE' | 'TITLE'; description?: string | null;
  stock?: number | null; maxPerMember?: number | null; sortOrder?: number;
}

/** Charge content/boutique.json : crée les articles absents (par nom), laisse les autres intacts. */
export async function importCatalog(guildId: string): Promise<{ created: string[]; skipped: number }> {
  const { readFile } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  const { contentDir } = await import('../../core/paths.js');
  const raw = JSON.parse(await readFile(path.join(contentDir, 'boutique.json'), 'utf8')) as { items: CatalogItem[] };
  if (!Array.isArray(raw.items)) throw new Error('boutique.json : « items » doit être un tableau');
  const created: string[] = [];
  let skipped = 0;
  for (const it of raw.items) {
    if (!it.name || !Number.isInteger(it.price) || it.price < 0) throw new Error(`boutique.json : article invalide « ${it.name ?? '?'} »`);
    if (await findItemByName(guildId, it.name)) { skipped++; continue; }
    await createItem(guildId, {
      name: it.name, price: it.price, description: it.description ?? null, emoji: it.emoji ?? null,
      kind: it.kind ?? 'COLLECTIBLE', roleId: null, stock: it.stock ?? null,
      maxPerMember: it.maxPerMember ?? (it.kind === 'TITLE' ? 1 : null), sortOrder: it.sortOrder ?? 0,
    });
    created.push(it.name);
  }
  log.info(`Catalogue importé sur ${guildId} : ${created.length} créé(s), ${skipped} déjà présent(s)`);
  return { created, skipped };
}

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

export interface GiftResult {
  item: ShopItem;
  /** Exemplaires restants chez le donateur. */
  leftForGiver: number;
  /** Exemplaires possédés par le receveur après le don. */
  quantityForReceiver: number;
}

/**
 * Donne des exemplaires d'un objet de collection à un autre membre, dans une seule transaction :
 * retrait conditionnel chez le donateur, ajout chez le receveur, limite par membre respectée.
 * Les titres et les articles-rôles ne se donnent pas (ils sont personnels).
 */
export async function giftItem(fromMemberId: string, toMemberId: string, itemId: string, quantity: number): Promise<GiftResult> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new PurchaseError('unavailable', 'La quantité doit être d’au moins 1.');
  if (fromMemberId === toMemberId) throw new PurchaseError('unavailable', 'Se faire un don à soi-même ne change rien.');
  const item = await getItem(itemId);
  if (!item) throw new PurchaseError('unavailable', 'Cet article n’existe pas.');
  if (item.kind !== 'COLLECTIBLE') throw new PurchaseError('unavailable', 'Les titres et les rôles sont personnels : ils ne se donnent pas.');

  return prisma.$transaction(async (db) => {
    const { count } = await db.inventoryItem.updateMany({
      where: { memberId: fromMemberId, itemId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (count === 0) {
      const owned = await db.inventoryItem.findUnique({ where: { memberId_itemId: { memberId: fromMemberId, itemId } } });
      const have = owned?.quantity ?? 0;
      throw new PurchaseError('unavailable', have === 0 ? `Tu ne possèdes pas « ${item.name} ».` : `Tu n’en as que ${have} exemplaire(s).`);
    }
    const giver = await db.inventoryItem.findUniqueOrThrow({ where: { memberId_itemId: { memberId: fromMemberId, itemId } } });
    const receiver = await db.inventoryItem.upsert({
      where: { memberId_itemId: { memberId: toMemberId, itemId } },
      create: { memberId: toMemberId, itemId, quantity },
      update: { quantity: { increment: quantity } },
    });
    if (item.maxPerMember !== null && receiver.quantity > item.maxPerMember) {
      throw new PurchaseError('limit_reached', item.maxPerMember === 1
        ? 'Ce membre possède déjà cet article (limite d’un exemplaire).'
        : `Ce membre dépasserait la limite de ${item.maxPerMember} exemplaires.`);
    }
    return { item, leftForGiver: giver.quantity, quantityForReceiver: receiver.quantity };
  });
}
