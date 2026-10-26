import { MessageFlags, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { ACHIEVEMENTS } from './achievements.catalog.js';
import { evaluateAll, unlockCounts } from './achievements.service.js';
import { describeAchievementForAdmin } from './achievements.view.js';

export function buildAchievementsAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('succes')
    .setDescription('Succès et badges')
    .addSubcommand((sub) => sub.setName('recalculer').setDescription('Réévalue les succès de tous les membres (sans annonce)'))
    .addSubcommand((sub) => sub.setName('liste').setDescription('Catalogue des succès et nombre de membres les ayant débloqués'));
}

export async function handleAchievementsAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'recalculer') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const n = await evaluateAll(interaction.guild);
    await interaction.editReply(`Réévaluation terminée : ${n} succès débloqué(s), récompenses créditées, sans annonce.`);
    return;
  }
  if (sub === 'liste') {
    const counts = await unlockCounts(interaction.guildId);
    await interaction.reply({ content: ACHIEVEMENTS.map((a) => describeAchievementForAdmin(a, counts.get(a.key) ?? 0)).join('\n'), flags: MessageFlags.Ephemeral });
  }
}
