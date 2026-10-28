import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { rollDie } from '../../modules/dice/dice.service.js';
import { renderDiceCard } from '../../modules/dice/dice.image.js';
import { card, screen, text } from '../v2.js';

/** Petit mot selon le lancer : triomphe, déroute, ou neutre. */
function comment(rolls: number[]): string {
  const max = rolls.length * 6, total = rolls.reduce((a, b) => a + b, 0);
  if (total === max) return 'Lancer parfait, le dé a compris qui commandait.';
  if (total === rolls.length) return 'Le minimum possible. Le dé a des choses à se faire pardonner.';
  if (total >= max * 0.8) return 'Belle main, la chance est de ton côté.';
  if (total <= max * 0.3) return 'Le dé n’était pas d’humeur. Il reviendra.';
  return 'Un lancer honnête, ni gloire ni honte.';
}

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
    c.addTextDisplayComponents(text(`-# 🎲 ${userMention(guildMember.id)} a lancé ${count === 1 ? 'le dé' : `${count} dés`}. ${comment(rolls)}`));
    await interaction.editReply({ ...screen(c), files: [new AttachmentBuilder(image, { name: 'de.png' })], allowedMentions: { parse: [] } });
  },
});
