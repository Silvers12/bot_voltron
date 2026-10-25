import { MessageFlags, SlashCommandBuilder, time, TimestampStyles } from 'discord.js';
import { defineCommand } from '../types.js';
import { claimWeekly } from '../../modules/economy/weekly.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';

export default defineCommand({
  data: new SlashCommandBuilder().setName('hebdo').setDescription('Récupère ta récompense de la semaine'),
  async execute({ interaction, member }) {
    const settings = await getSettings(interaction.guildId);
    const result = await claimWeekly(member.id, member.guildId, interaction.user.id);
    const content = result.ok
      ? `🗓️ **${formatAmount(result.amount, settings)}** rejoignent ta bourse pour cette semaine ! Tu as maintenant ${formatAmount(result.balanceAfter, settings)}.`
      : `Tu as déjà reçu ta récompense de la semaine. La prochaine arrive ${time(result.nextAt, TimestampStyles.RelativeTime)}.`;
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
});
