import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, roleMention, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings, ShopItem } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { InventoryEntry } from './shop.service.js';
import { backRow, INVENTORY_OPEN_ID, PROFILE_REFRESH_ID, SHOP_OPEN_ID } from '../community/profile.view.js';
import { card, clampLines, divider, screen, text } from '../../discord/v2.js';

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

function stockLabel(item: ShopItem): string {
  if (item.stock === null) return '';
  return item.stock === 0 ? ' · *épuisé*' : ` · ${item.stock} en stock`;
}

function kindLabel(item: ShopItem): string {
  if (item.kind === 'ROLE' && item.roleId) return ` · rôle ${roleMention(item.roleId)}`;
  if (item.kind === 'TITLE') return ' · titre';
  return '';
}

/**
 * Écran de la boutique : une page de SHOP_PAGE_SIZE articles, chacun sur une ligne avec son bouton d'achat (prix dedans).
 * Budget de composants Discord (40 max) : conteneur + en-tête + séparateur + 10 × (section, texte, bouton) + navigation.
 */
export function buildShopView(allItems: ShopItem[], balance: number, settings: GuildSettings, notice?: string, page = 0, owned: Map<string, number> = new Map()) {
  const pages = Math.max(1, Math.ceil(allItems.length / SHOP_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const items = allItems.slice(current * SHOP_PAGE_SIZE, (current + 1) * SHOP_PAGE_SIZE);
  const c = card(SHOP_COLOR);
  c.addTextDisplayComponents(text(`# 🛒 Boutique${pages > 1 ? ` · page ${current + 1}/${pages}` : ''}\n💰 Ta bourse : **${formatAmount(balance, settings)}**${notice ? `\n> ${notice}` : ''}`));
  c.addSeparatorComponents(divider(true));
  if (!items.length) c.addTextDisplayComponents(text('Les rayons sont vides pour le moment. Les intendants y travaillent !'));
  for (const item of items) {
    const qty = owned.get(item.id) ?? 0;
    const soldOut = item.stock !== null && item.stock <= 0;
    const limited = item.maxPerMember !== null && qty >= item.maxPerMember;
    const tooPoor = balance < item.price;
    const flags = [kindLabel(item).replace(/^ · /, ''), item.stock !== null ? (soldOut ? 'épuisé' : `${item.stock} en stock`) : '', item.maxPerMember !== null ? `max ${item.maxPerMember}/membre` : '', qty ? `tu en as ${qty}` : ''].filter(Boolean).join(' · ');
    const body = `**${itemLabel(item)}**${flags ? `  -# ${flags}` : ''}\n${item.description ? `-# ${item.description}` : ''}`.trimEnd();
    const label = soldOut ? 'Épuisé' : limited ? 'Déjà à toi' : formatAmount(item.price, settings);
    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(body))
        .setButtonAccessory(
          new ButtonBuilder().setCustomId(SHOP_BUY_PREFIX + item.id).setLabel(label.slice(0, 80)).setStyle(soldOut || limited ? ButtonStyle.Secondary : tooPoor ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji('🛒').setDisabled(soldOut || limited || tooPoor),
        ),
    );
  }

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
  return screen(c, [nav]);
}

/** Inventaire du membre, avec le choix du titre porté s'il en possède. */
export function buildInventoryView(entries: InventoryEntry[], settings: GuildSettings, equippedTitleId: string | null, notice?: string) {
  const describe = (e: InventoryEntry) => {
    const qty = e.quantity > 1 ? ` ×${e.quantity}` : '';
    if (e.item.kind === 'ROLE' && e.item.roleId) return `${itemLabel(e.item)}${qty} (${roleMention(e.item.roleId)})`;
    if (e.item.kind === 'TITLE') return `${itemLabel(e.item)}${e.item.id === equippedTitleId ? ' · **porté**' : ''}`;
    return `${itemLabel(e.item)}${qty}`;
  };
  const c = card(SHOP_COLOR);
  c.addTextDisplayComponents(text('# 🎒 Inventaire'));
  if (notice) c.addTextDisplayComponents(text(`> ${notice}`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(entries.length ? clampLines(entries.map(describe)) : 'Ton sac est vide. Fais un tour à la boutique !'));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ${entries.reduce((n, e) => n + e.quantity, 0)} objet(s) · valeur d’achat ${formatAmount(entries.reduce((n, e) => n + e.quantity * e.item.price, 0), settings)}`));

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
  return screen(c, rows);
}

export { backRow };
