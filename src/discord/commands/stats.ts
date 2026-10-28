import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { computeGameStats } from '../../modules/stats/stats.service.js';
import { buildStatsView } from '../../modules/stats/stats.view.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques de jeu d’un membre (les tiennes par défaut)')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à afficher')),
  async execute({ interaction, member }) {
    const target = interaction.options.getMember('membre');
    if (target?.user.bot) return void (await interaction.reply({ content: 'Les bots ne jouent pas. Enfin, pas encore.', flags: MessageFlags.Ephemeral }));
    const shown = target ? await ensureMember(target) : member;
    const [s, st] = await Promise.all([getSettings(interaction.guildId), computeGameStats(shown.id)]);
    await interaction.reply(buildStatsView(shown.displayName, st, s));
  },
});
