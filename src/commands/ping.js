import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifie que le bot répond'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pong !', withResponse: true });
    const latency = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong ! Latence : ${latency} ms (API : ${Math.round(interaction.client.ws.ping)} ms)`);
  },
};
