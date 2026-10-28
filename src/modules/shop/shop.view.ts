import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings, ShopItem } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { InventoryEntry } from './shop.service.js';
import { backRow, INVENTORY_OPEN_ID, PROFILE_REFRESH_ID, SHOP_OPEN_ID } from '../community/profile.view.js';
import { imageScreen } from '../../discord/v2.js';
import { renderListCard, type ListLine } from '../../core/listimage.js';

export { SHOP_OPEN_ID, INVENTORY_OPEN_ID };
export const SHOP_BUY_PREFIX = 'shop:buy:';
export const SHOP_PAGE_PREFIX = 'shop:page:';
export const SHOP_PAGE_SIZE = 10;
export const SHOP_TITLE_SELECT_ID = 'shop:title';
export const NO_TITLE_VALUE = 'none';

const SHOP_COLOR = 0x27ae60;

/** Emoji utilisable dans un composant Discord : un seul pictogramme unicode. */
function componentEmoji(emoji: string | null): string | undefined {
  if (!emoji) return undefined;
  const trimmed = emoji.trim();
  return /^\p{Extended_Pictographic}(️|\p{Emoji_Modifier})?$/u.test(trimmed) ? trimmed : undefined;
}

function itemLabel(item: ShopItem): string {
  return `${item.emoji ? item.emoji + ' ' : ''}${item.name}`;
}

/**
 * Écran de la boutique : une page de SHOP_PAGE_SIZE articles numérotés dans l'image, un bouton d'achat par numéro (deux rangées), puis la navigation.
 */
export async function buildShopView(allItems: ShopItem[], balance: number, settings: GuildSettings, notice?: string, page = 0, owned: Map<string, number> = new Map()) {
  const pages = Math.max(1, Math.ceil(allItems.length / SHOP_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const items = allItems.slice(current * SHOP_PAGE_SIZE, (current + 1) * SHOP_PAGE_SIZE);

  const lines: ListLine[] = [];
  const buys: ButtonBuilder[] = [];
  items.forEach((item, i) => {
    const qty = owned.get(item.id) ?? 0;
    const soldOut = item.stock !== null && item.stock <= 0;
    const limited = item.maxPerMember !== null && qty >= item.maxPerMember;
    const tooPoor = balance < item.price;
    const flags = [item.kind === 'ROLE' ? 'rôle' : item.kind === 'TITLE' ? 'titre' : '', item.stock !== null ? (soldOut ? 'épuisé' : `${item.stock} en stock`) : '', item.maxPerMember !== null ? `max ${item.maxPerMember} par membre` : '', qty ? `tu en as ${qty}` : ''].filter(Boolean).join(' · ');
    lines.push({
      index: i + 1, label: itemLabel(item), muted: soldOut || limited,
      value: soldOut ? 'Épuisé' : limited ? 'Déjà à toi' : formatAmount(item.price, settings), valueColor: soldOut || limited ? '#9aa7b2' : tooPoor ? '#e74c3c' : '#f1c40f',
      sub: [item.description, flags].filter(Boolean).join(' — '),
    });
    buys.push(new ButtonBuilder().setCustomId(SHOP_BUY_PREFIX + item.id).setLabel(`${i + 1}`).setEmoji('🛒').setStyle(soldOut || limited || tooPoor ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(soldOut || limited || tooPoor));
  });
  const image = await renderListCard({
    title: pages > 1 ? `Boutique · page ${current + 1}/${pages}` : 'Boutique', subtitle: `Ta bourse : ${formatAmount(balance, settings)} · clique le numéro d’un article pour l’acheter`, color: '#27ae60', lines,
    empty: 'Les rayons sont vides pour le moment. Les intendants y travaillent !',
  });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < buys.length; i += 5) rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buys.slice(i, i + 5)));
  const nav = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  if (pages > 1) {
    nav.addComponents(
      new ButtonBuilder().setCustomId(`${SHOP_PAGE_PREFIX}${current - 1}`).setLabel('Précédent').setStyle(ButtonStyle.Secondary).setEmoji('◀️').setDisabled(current === 0),
      new ButtonBuilder().setCustomId(`${SHOP_PAGE_PREFIX}${current + 1}`).setLabel('Suivant').setStyle(ButtonStyle.Secondary).setEmoji('▶️').setDisabled(current >= pages - 1),
    );
  }
  nav.addComponents(
    new ButtonBuilder().setCustomId(INVENTORY_OPEN_ID).setLabel('Inventaire').setStyle(ButtonStyle.Primary).setEmoji('🎒'),
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );
  rows.push(nav);
  return imageScreen(image, 'boutique.png', SHOP_COLOR, rows, { notice, caption: 'Boutique' });
}

/** Inventaire du membre en image, avec le choix du titre porté s'il en possède. */
export async function buildInventoryView(entries: InventoryEntry[], settings: GuildSettings, equippedTitleId: string | null, notice?: string) {
  const lines: ListLine[] = entries.map((e) => ({
    label: itemLabel(e.item),
    value: e.item.kind === 'TITLE' ? (e.item.id === equippedTitleId ? 'Porté' : 'Titre') : e.item.kind === 'ROLE' ? 'Rôle' : e.quantity > 1 ? `× ${e.quantity}` : undefined,
    valueColor: e.item.id === equippedTitleId ? '#f1c40f' : '#c9d3dc',
    sub: e.item.description ?? undefined,
  }));
  const count = entries.reduce((n, e) => n + e.quantity, 0);
  const image = await renderListCard({
    title: 'Inventaire', subtitle: `${count} objet${count > 1 ? 's' : ''} · valeur d’achat ${formatAmount(entries.reduce((n, e) => n + e.quantity * e.item.price, 0), settings)}`, color: '#d35400', lines,
    empty: 'Ton sac est vide. Fais un tour à la boutique !',
  });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const titles = entries.filter((e) => e.item.kind === 'TITLE').map((e) => e.item);
  if (titles.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(SHOP_TITLE_SELECT_ID).setPlaceholder('Choisir le titre porté');
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel('Aucun titre').setValue(NO_TITLE_VALUE).setDefault(equippedTitleId === null));
    for (const t of titles.slice(0, 24)) {
      const option = new StringSelectMenuOptionBuilder().setLabel(t.name.slice(0, 100)).setValue(t.id).setDefault(t.id === equippedTitleId);
      const emoji = componentEmoji(t.emoji);
      if (emoji) option.setEmoji(emoji);
      menu.addOptions(option);
    }
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SHOP_OPEN_ID).setLabel('Boutique').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  ));
  return imageScreen(image, 'inventaire.png', SHOP_COLOR, rows, { notice, caption: 'Inventaire' });
}

export { backRow };
