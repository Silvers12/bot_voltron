import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { listUnlocked } from '../../modules/achievements/achievements.service.js';
import { buildAchievementsEmbed } from '../../modules/achievements/achievements.view.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('succes')
    .setDescription('Affiche les badges d’un membre (les tiens par défaut)')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à afficher')),
  async execute({ interaction, member }) {
    const target = interaction.options.getMember('membre');
    const shown = target ? await ensureMember(target) : member;
    const s = await getSettings(interaction.guildId);
    const unlocked = await listUnlocked(shown.id);
    await interaction.reply({ embeds: [buildAchievementsEmbed(shown.displayName, unlocked, s, { showHints: shown.id === member.id })] });
  },
});
