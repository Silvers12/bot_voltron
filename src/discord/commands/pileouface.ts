import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { flipCoin, loadVisual, type CoinSide } from '../../modules/dice/dice.service.js';
import { card, screen, text } from '../v2.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('pileouface')
    .setDescription('Lance une pièce : pile ou face ?')
    .addStringOption((o) => o.setName('choix').setDescription('Ton pari (facultatif)').addChoices({ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' })),
  async execute({ interaction, guildMember }) {
    const bet = interaction.options.getString('choix') as CoinSide | null;
    const side = flipCoin();
    const png = await loadVisual(side);

    const c = card(0xf1c40f);
    const files: AttachmentBuilder[] = [];
    if (png) {
      files.push(new AttachmentBuilder(png, { name: `${side}.png` }));
      c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${side}.png`).setDescription(side === 'pile' ? 'Pile' : 'Face')));
    }
    const verdict = bet ? (bet === side ? ' Bien vu !' : ` Raté, tu avais dit ${bet}.`) : '';
    c.addTextDisplayComponents(text(`🪙 ${userMention(guildMember.id)} lance la pièce… **${side === 'pile' ? 'Pile' : 'Face'}** !${verdict}`));
    await interaction.reply({ ...screen(c), files, allowedMentions: { parse: [] } });
  },
});
