import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { renderProfile } from '../../modules/community/profile.controller.js';

export default defineCommand({
  data: new SlashCommandBuilder().setName('profil').setDescription('Ouvre ton espace personnel'),
  async execute({ interaction, member, guildMember }) {
    await interaction.reply({ ...(await renderProfile(member, guildMember)), flags: MessageFlags.Ephemeral });
  },
});
