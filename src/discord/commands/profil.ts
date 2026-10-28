import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { openProfile, renderPublicProfile } from '../../modules/community/profile.controller.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { renderBotProfile } from '../../modules/community/bot-profile.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Ouvre ton espace personnel, ou la fiche publique d’un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Membre dont tu veux voir la fiche (toi par défaut)')),
  async execute({ interaction, member, guildMember }) {
    const target = interaction.options.getMember('membre');
    if (!target || target.id === interaction.user.id) return void (await openProfile({ interaction, member, guildMember }));
    if (target.id === interaction.client.user.id) {
      await interaction.deferReply();
      return void (await interaction.editReply(await renderBotProfile(interaction.guild)));
    }
    if (target.user.bot) return void (await interaction.reply({ content: 'Les autres bots n’ont pas de fiche. Ils ont déjà bien assez de travail.', flags: MessageFlags.Ephemeral }));
    await interaction.deferReply();
    await interaction.editReply(await renderPublicProfile(await ensureMember(target), target));
  },
});
