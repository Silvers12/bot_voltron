import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { drawBanter } from '../../modules/banter/banter.service.js';
import { buildBanterMessage } from '../../modules/banter/banter.view.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('insulte')
    .setDescription('Lance une insulte drôle et bienveillante à un membre (second degré garanti)')
    .addUserOption((o) => o.setName('membre').setDescription('Qui reçoit la pique').setRequired(true)),
  async execute({ interaction }) {
    const target = interaction.options.getMember('membre');
    if (!target) return void (await interaction.reply({ content: 'Ce membre ne fait pas (ou plus) partie du serveur.', flags: MessageFlags.Ephemeral }));
    if (target.user.bot) return void (await interaction.reply({ content: 'Insulter une loutre paladin ? Courageux. Mais non.', flags: MessageFlags.Ephemeral }));
    const draw = drawBanter('insulte', target.displayName, interaction.member.displayName);
    await interaction.reply(buildBanterMessage('insulte', draw, interaction.user.id, target.id));
  },
});
