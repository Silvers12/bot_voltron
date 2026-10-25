import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { GameView, Hand } from './blackjack.service.js';

export const BJ_HIT_ID = 'bj:hit';
export const BJ_STAND_ID = 'bj:stand';
export const BJ_DOUBLE_ID = 'bj:double';
export const BJ_AGAIN_PREFIX = 'bj:again:';

function renderHand(hand: Hand, hidden = false): string {
  const cards = hand.cards.map((c) => `\`${c}\``).join(' ');
  if (hidden) return `${cards} \`🂠\` — **${hand.total}** + ?`;
  return `${cards} — **${hand.total}**${hand.soft && hand.total <= 21 ? ' (souple)' : ''}${hand.total > 21 ? ' 💥' : ''}`;
}

const RESULT = {
  BLACKJACK: { title: '🃏 BLACKJACK !', color: 0xf1c40f, line: 'Par mes moustaches, un naturel ! La banque paie 3 pour 2.' },
  WON: { title: '🎉 Gagné', color: 0x2ecc71, line: 'La banque s’incline. Bien joué, camarade.' },
  PUSH: { title: '🤝 Égalité', color: 0x95a5a6, line: 'Personne ne gagne, ta mise te revient.' },
  LOST: { title: '💸 Perdu', color: 0xe74c3c, line: 'La rivière reprend ce qu’elle a donné. Une autre fois !' },
  PLAYING: { title: '🃏 Blackjack', color: 0x2e86c1, line: '' },
} as const;

export function buildBlackjackView(view: GameView, balance: number, settings: GuildSettings) {
  const { game, player, dealer, dealerHidden, finished } = view;
  const stake = game.doubled ? game.bet * 2 : game.bet;
  const result = RESULT[game.state];

  const embed = new EmbedBuilder()
    .setColor(result.color)
    .setTitle(result.title)
    .addFields(
      { name: 'Banque (Voltron)', value: renderHand(dealer, dealerHidden) },
      { name: 'Ta main', value: renderHand(player) },
      { name: 'Mise', value: `${formatAmount(stake, settings)}${game.doubled ? ' (doublée)' : ''}`, inline: true },
    );

  if (finished) {
    const net = game.payout - stake;
    embed.addFields({ name: 'Résultat', value: `${result.line}\n**${net >= 0 ? '+' : ''}${formatAmount(net, settings)}** · bourse : ${formatAmount(balance, settings)}` });
  } else {
    embed.setFooter({ text: 'Tirer : une carte de plus · Rester : la banque joue · Doubler : mise ×2, une seule carte' });
  }

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (finished) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`${BJ_AGAIN_PREFIX}${game.bet}`).setLabel(`Rejouer (${formatAmount(game.bet, settings)})`).setStyle(ButtonStyle.Primary).setEmoji('🔁').setDisabled(balance < game.bet),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(BJ_HIT_ID).setLabel('Tirer').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
      new ButtonBuilder().setCustomId(BJ_STAND_ID).setLabel('Rester').setStyle(ButtonStyle.Success).setEmoji('✋'),
      new ButtonBuilder().setCustomId(BJ_DOUBLE_ID).setLabel('Doubler').setStyle(ButtonStyle.Danger).setEmoji('⚡').setDisabled(!view.canDouble || balance < game.bet),
    );
  }
  return { embeds: [embed], components: [row] };
}
