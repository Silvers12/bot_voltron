import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { buildProfileView } from '../../modules/community/profile.view.js';

export default defineCommand({
  data: new SlashCommandBuilder().setName('profil').setDescription('Ouvre ton espace personnel'),
  async execute({ interaction, member, guildMember }) {
    await interaction.reply({ ...buildProfileView(member, guildMember), flags: MessageFlags.Ephemeral });
  },
});
