import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, roleMention,
} from 'discord.js';
import type { GuildSettings, ShopItem } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { InventoryEntry } from './shop.service.js';
import { INVENTORY_OPEN_ID, PROFILE_REFRESH_ID, SHOP_OPEN_ID } from '../community/profile.view.js';

export { SHOP_OPEN_ID, INVENTORY_OPEN_ID };
export const SHOP_SELECT_ID = 'shop:select';
export const SHOP_BUY_PREFIX = 'shop:buy:';
export const SHOP_TITLE_SELECT_ID = 'shop:title';
export const NO_TITLE_VALUE = 'none';

const VOLTRON_COLOR = 0x2e86c1;
const FOOTER = 'Voltron, loutre paladin · La boutique garde ton équipement au chaud.';

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

const backRow = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );

/** Écran de la boutique : liste des articles et menu de sélection. */
export function buildShopView(items: ShopItem[], balance: number, settings: GuildSettings, notice?: string) {
  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setTitle('🛒 Boutique')
    .setDescription(
      items.length
        ? items.map((i) => `${itemLabel(i)} — **${formatAmount(i.price, settings)}**${stockLabel(i)}`).join('\n')
        : 'Les rayons sont vides pour le moment. Les intendants y travaillent !',
    )
    .addFields({ name: 'Ta bourse', value: formatAmount(balance, settings) })
    .setFooter({ text: FOOTER });
  if (notice) embed.addFields({ name: '​', value: notice });

  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
  if (items.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(SHOP_SELECT_ID).setPlaceholder('Choisis un article pour en savoir plus');
    for (const item of items.slice(0, 25)) {
      const option = new StringSelectMenuOptionBuilder().setLabel(item.name.slice(0, 100)).setValue(item.id).setDescription(formatAmount(item.price, settings).slice(0, 100));
      const emoji = componentEmoji(item.emoji);
      if (emoji) option.setEmoji(emoji);
      menu.addOptions(option);
    }
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  components.push(backRow());
  return { embeds: [embed], components };
}

/** Fiche d'un article avec le bouton d'achat. */
export function buildItemView(item: ShopItem, balance: number, owned: number, settings: GuildSettings) {
  const details = [`**Prix :** ${formatAmount(item.price, settings)}`];
  if (item.kind === 'ROLE' && item.roleId) details.push(`**Effet :** donne le rôle ${roleMention(item.roleId)}`);
  if (item.kind === 'TITLE') details.push('**Effet :** titre affiché sur ton profil (à choisir depuis l’inventaire)');
  if (item.stock !== null) details.push(`**Stock :** ${item.stock === 0 ? 'épuisé' : item.stock}`);
  if (item.maxPerMember !== null) details.push(`**Limite :** ${item.maxPerMember} par membre`);
  if (owned > 0) details.push(`**Tu en possèdes :** ${owned}`);

  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setTitle(itemLabel(item))
    .setDescription([item.description, '', ...details].filter((l) => l !== null && l !== undefined).join('\n'))
    .addFields({ name: 'Ta bourse', value: formatAmount(balance, settings) })
    .setFooter({ text: FOOTER });

  const canBuy = item.active && (item.stock === null || item.stock > 0) && (item.maxPerMember === null || owned < item.maxPerMember) && balance >= item.price;
  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SHOP_BUY_PREFIX + item.id).setLabel(`Acheter pour ${formatAmount(item.price, settings)}`).setStyle(ButtonStyle.Primary).setEmoji('🛒').setDisabled(!canBuy),
      new ButtonBuilder().setCustomId(SHOP_OPEN_ID).setLabel('Retour à la boutique').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [embed], components: rows };
}

/** Inventaire du membre, avec le choix du titre porté s'il en possède. */
export function buildInventoryView(entries: InventoryEntry[], settings: GuildSettings, equippedTitleId: string | null, notice?: string) {
  const describe = (e: InventoryEntry) => {
    const qty = e.quantity > 1 ? ` ×${e.quantity}` : '';
    if (e.item.kind === 'ROLE' && e.item.roleId) return `${itemLabel(e.item)}${qty} (${roleMention(e.item.roleId)})`;
    if (e.item.kind === 'TITLE') return `${itemLabel(e.item)}${e.item.id === equippedTitleId ? ' · **porté**' : ''}`;
    return `${itemLabel(e.item)}${qty}`;
  };
  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setTitle('🎒 Inventaire')
    .setDescription(entries.length ? entries.map(describe).join('\n') : 'Ton sac est vide. Fais un tour à la boutique !')
    .setFooter({ text: `${entries.reduce((n, e) => n + e.quantity, 0)} objet(s) · valeur d’achat ${formatAmount(entries.reduce((n, e) => n + e.quantity * e.item.price, 0), settings)}` });
  if (notice) embed.addFields({ name: '​', value: notice });

  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
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
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SHOP_OPEN_ID).setLabel('Boutique').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
      new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
    ),
  );
  return { embeds: [embed], components };
}
