import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { flipCoin, type CoinSide } from '../../modules/dice/dice.service.js';
import { renderCoinCard } from '../../modules/dice/dice.image.js';
import { card, screen, text } from '../v2.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('pileouface')
    .setDescription('Lance une pièce : pile ou face ?')
    .addStringOption((o) => o.setName('choix').setDescription('Ton pari (facultatif)').addChoices({ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' })),
  async execute({ interaction, guildMember }) {
    const bet = interaction.options.getString('choix') as CoinSide | null;
    const side = flipCoin();

    await interaction.deferReply();
    const avatarPng = Buffer.from(await (await fetch(guildMember.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
    const image = await renderCoinCard(guildMember.displayName, avatarPng, side, bet);

    const c = card(0xf1c40f);
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://piece.png')));
    const verdict = bet ? (bet === side ? ' Bien vu !' : ` Raté, tu avais dit ${bet}.`) : '';
    c.addTextDisplayComponents(text(`🪙 ${userMention(guildMember.id)} lance la pièce… **${side === 'pile' ? 'Pile' : 'Face'}** !${verdict}`));
    await interaction.editReply({ ...screen(c), files: [new AttachmentBuilder(image, { name: 'piece.png' })], allowedMentions: { parse: [] } });
  },
});
