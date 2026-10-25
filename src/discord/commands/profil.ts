import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { openProfile } from '../../modules/community/profile.controller.js';

export default defineCommand({
  data: new SlashCommandBuilder().setName('profil').setDescription('Ouvre ton espace personnel'),
  async execute({ interaction, member, guildMember }) {
    await openProfile({ interaction, member, guildMember });
  },
});
