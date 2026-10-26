import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { registerButtonPrefix } from '../components.js';
import { InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import { buyTickets, getEntry, getOrCreateOpenLottery, LotteryError, refreshPublishedMessage } from '../../modules/lottery/lottery.service.js';
import { buildLotteryMessage, LOTTERY_BUY_PREFIX } from '../../modules/lottery/lottery.view.js';

// Message public : chacun achète ses tickets avec sa bourse ; la confirmation est privée.
registerButtonPrefix(LOTTERY_BUY_PREFIX, async ({ interaction, member, arg }) => {
  const s = await getSettings(member.guildId);
  const count = Math.max(1, Math.min(50, Number(arg) || 1));
  try {
    const r = await buyTickets(member, count);
    await interaction.update(buildLotteryMessage(r.lottery, s));
    await refreshPublishedMessage(interaction.client, r.lottery, interaction.message.id);
    await interaction.followUp({
      content: `🎟️ ${r.bought} ticket${r.bought > 1 ? 's' : ''} en poche ! Tu en as ${r.owned} pour ce tirage. Il te reste ${formatAmount(r.balanceAfter, s)}.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) return void (await interaction.reply({ content: `Il te faut ${formatAmount(err.requested, s)}, et tu n’as que ${formatAmount(err.balance, s)}.`, flags: MessageFlags.Ephemeral }));
    if (err instanceof LotteryError) return void (await interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral }));
    throw err;
  }
});

export default defineCommand({
  data: new SlashCommandBuilder().setName('tombola').setDescription('Affiche la tombola de la semaine et permet d’acheter des tickets'),
  async execute({ interaction, member }) {
    const s = await getSettings(member.guildId);
    if (!s.lotteryChannelId) return void (await interaction.reply({ content: 'La tombola n’est pas activée sur ce serveur.', flags: MessageFlags.Ephemeral }));
    const lottery = await getOrCreateOpenLottery(member.guildId);
    const owned = await getEntry(lottery.id, member.id);
    await interaction.reply(buildLotteryMessage(lottery, s));
    if (owned > 0) await interaction.followUp({ content: `Tu as ${owned} ticket${owned > 1 ? 's' : ''} pour ce tirage.`, flags: MessageFlags.Ephemeral });
  },
});
