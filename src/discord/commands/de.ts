import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { loadVisual, rollDie } from '../../modules/dice/dice.service.js';
import { card, screen, text } from '../v2.js';

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('de')
    .setDescription('Lance un ou plusieurs dés à six faces')
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de dés (1 à 5, un par défaut)').setMinValue(1).setMaxValue(5)),
  async execute({ interaction, guildMember }) {
    const count = interaction.options.getInteger('nombre') ?? 1;
    const rolls = Array.from({ length: count }, rollDie);
    const total = rolls.reduce((a, b) => a + b, 0);

    const files: AttachmentBuilder[] = [];
    const gallery = new MediaGalleryBuilder();
    for (const [i, value] of rolls.entries()) {
      const png = await loadVisual(`de_${value}`);
      if (!png) continue;
      files.push(new AttachmentBuilder(png, { name: `de_${i}.png` }));
      gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://de_${i}.png`).setDescription(`Dé ${i + 1} : ${value}`));
    }

    const c = card(0xe74c3c);
    if (files.length) c.addMediaGalleryComponents(gallery);
    const detail = count === 1 ? `**${rolls[0]}**` : `${rolls.map((v) => FACES[v]).join(' ')} → **${total}** (${rolls.join(' + ')})`;
    c.addTextDisplayComponents(text(`🎲 ${userMention(guildMember.id)} lance ${count === 1 ? 'le dé' : `${count} dés`} : ${detail}`));
    await interaction.reply({ ...screen(c), files, allowedMentions: { parse: [] } });
  },
});
