import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { drawBanter } from '../../modules/banter/banter.service.js';
import { buildBanterMessage } from '../../modules/banter/banter.view.js';

import { botName } from '../../core/identity.js';
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Offre un compliment puissant et affectueux à un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Qui reçoit le compliment').setRequired(true)),
  async execute({ interaction }) {
    const target = interaction.options.getMember('membre');
    if (!target) return void (await interaction.reply({ content: 'Ce membre ne fait pas (ou plus) partie du serveur.', flags: MessageFlags.Ephemeral }));
    if (target.user.bot) return void (await interaction.reply({ content: `${botName()} rougit, mais garde tes compliments pour les humains.`, flags: MessageFlags.Ephemeral }));
    const draw = drawBanter('compliment', target.displayName, interaction.member.displayName);
    await interaction.deferReply();
    await interaction.editReply(await buildBanterMessage('compliment', draw, interaction.member, target));
  },
});
