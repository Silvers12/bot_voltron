import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { rollDie } from '../../modules/dice/dice.service.js';
import { renderDiceCard } from '../../modules/dice/dice.image.js';
import { card, screen } from '../v2.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('de')
    .setDescription('Lance un ou plusieurs dés à six faces')
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de dés (1 à 5, un par défaut)').setMinValue(1).setMaxValue(5)),
  async execute({ interaction, guildMember }) {
    const count = interaction.options.getInteger('nombre') ?? 1;
    const rolls = Array.from({ length: count }, rollDie);

    await interaction.deferReply();
    const avatarPng = Buffer.from(await (await fetch(guildMember.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
    const image = await renderDiceCard(guildMember.displayName, avatarPng, rolls);

    const c = card(0xe74c3c);
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://de.png').setDescription(`${guildMember.displayName} : ${rolls.join(' + ')}`)));
    await interaction.editReply({ ...screen(c), files: [new AttachmentBuilder(image, { name: 'de.png' })] });
  },
});
