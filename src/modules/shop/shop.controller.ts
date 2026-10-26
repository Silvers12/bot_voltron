import { trackAchievements } from '../achievements/achievements.service.js';
import { registerProfileButton, registerProfileButtonPrefix, registerProfileSelect } from '../community/profile.controller.js';
import { getBalance, InsufficientFundsError } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { equipTitle, getEquippedTitle, getInventory, getItem, getOwnedQuantity, listItems, purchase, PurchaseError } from './shop.service.js';
import { buildInventoryView, buildItemView, buildShopView, INVENTORY_OPEN_ID, NO_TITLE_VALUE, SHOP_BUY_PREFIX, SHOP_OPEN_ID, SHOP_PAGE_PREFIX, SHOP_PAGE_SIZE, SHOP_SELECT_ID, SHOP_TITLE_SELECT_ID } from './shop.view.js';
import type { Member } from '../../generated/prisma/client.js';

export async function renderShop(member: Member, notice?: string, page = 0) {
  const [items, balance, settings] = await Promise.all([listItems(member.guildId), getBalance(member.id), getSettings(member.guildId)]);
  return buildShopView(items, balance, settings, notice, page);
}

/** Page contenant un article donné (pour revenir au bon endroit après un achat). */
async function pageOf(member: Member, itemId: string): Promise<number> {
  const items = await listItems(member.guildId);
  const idx = items.findIndex((i) => i.id === itemId);
  return idx < 0 ? 0 : Math.floor(idx / SHOP_PAGE_SIZE);
}

async function renderItem(member: Member, itemId: string) {
  const item = await getItem(itemId);
  if (!item || item.guildId !== member.guildId || !item.active) return renderShop(member, 'Cet article n’est plus en vente.');
  const [balance, owned, settings] = await Promise.all([getBalance(member.id), getOwnedQuantity(member.id, item.id), getSettings(member.guildId)]);
  return buildItemView(item, balance, owned, settings);
}

registerProfileButton(SHOP_OPEN_ID, async ({ interaction, member }) => {
  await interaction.update(await renderShop(member));
});

registerProfileButtonPrefix(SHOP_PAGE_PREFIX, async ({ interaction, member, arg }) => {
  await interaction.update(await renderShop(member, undefined, Number(arg) || 0));
});

registerProfileSelect(SHOP_SELECT_ID, async ({ interaction, member, values }) => {
  await interaction.update(await renderItem(member, values[0] ?? ''));
});

export async function renderInventory(member: Member, notice?: string) {
  const [entries, settings, title] = await Promise.all([getInventory(member.id), getSettings(member.guildId), getEquippedTitle(member.id)]);
  return buildInventoryView(entries, settings, title?.id ?? null, notice);
}

registerProfileButton(INVENTORY_OPEN_ID, async ({ interaction, member }) => {
  await interaction.update(await renderInventory(member));
});

registerProfileSelect(SHOP_TITLE_SELECT_ID, async ({ interaction, member, values }) => {
  const choice = values[0] ?? NO_TITLE_VALUE;
  try {
    const title = await equipTitle(member.id, choice === NO_TITLE_VALUE ? null : choice);
    await interaction.update(await renderInventory(member, title ? `🏷️ Tu portes désormais le titre **${title.name}**.` : 'Tu ne portes plus de titre.'));
  } catch (err) {
    if (err instanceof PurchaseError) return void (await interaction.update(await renderInventory(member, `❌ ${err.message}`)));
    throw err;
  }
});

registerProfileButtonPrefix(SHOP_BUY_PREFIX, async ({ interaction, member, guildMember, arg: itemId }) => {
  const settings = await getSettings(member.guildId);
  const item = await getItem(itemId);
  if (!item || item.guildId !== member.guildId) {
    await interaction.update(await renderShop(member, 'Cet article n’existe plus.'));
    return;
  }
  try {
    const result = await purchase(item, member, guildMember);
    trackAchievements(interaction.guild, member.id);
    const extra = result.quantityOwned > 1 ? ` Tu en as maintenant ${result.quantityOwned}.` : '';
    await interaction.update(await renderShop(member, `✅ **${item.name}** est à toi pour ${formatAmount(item.price, settings)} !${extra} Il te reste ${formatAmount(result.balanceAfter, settings)}.`, await pageOf(member, item.id)));
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.update(await renderShop(member, `Il te manque ${formatAmount(err.requested - err.balance, settings)} pour **${item.name}**. La boutique garde ton équipement au chaud.`, await pageOf(member, item.id)));
      return;
    }
    if (err instanceof PurchaseError) {
      await interaction.update(await renderShop(member, `❌ ${err.message}`, await pageOf(member, item.id)));
      return;
    }
    throw err;
  }
});
