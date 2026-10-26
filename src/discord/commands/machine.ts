import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder, userMention, type RepliableInteraction } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { defineCommand } from '../types.js';
import { registerButton } from '../components.js';
import { prisma } from '../../infrastructure/prisma.js';
import type { GuildSettings, Member } from '../../generated/prisma/client.js';
import { InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import { getJackpot, playSlots, SlotsError, type SpinResult } from '../../modules/casino/slots.service.js';

const AGAIN_ID = 'slots:again';

function frame(reels: string[], bet: number, s: GuildSettings, pool: number, result?: SpinResult) {
  const net = result ? result.payout - result.bet : 0;
  const embed = new EmbedBuilder()
    .setColor(!result ? 0x2e86c1 : result.jackpotWon > 0 || result.multiplier >= 30 ? 0xf1c40f : result.payout > result.bet ? 0x2ecc71 : result.payout === result.bet ? 0x95a5a6 : 0xe74c3c)
    .setTitle('🎰 La machine de Voltron')
    .setDescription(`# ${reels.join(' │ ')}`)
    .addFields({ name: 'Mise', value: formatAmount(bet, s), inline: true }, { name: '🦦🦦🦦 Cagnotte', value: `**${formatAmount(pool, s)}**`, inline: true });
  if (result) {
    embed.addFields(
      { name: 'Résultat', value: result.jackpotWon > 0 ? `${result.label} Tu rafles la cagnotte : **${formatAmount(result.jackpotWon, s)}** !` : `${result.label}${result.multiplier > 0 ? ` **×${result.multiplier}**` : ''}` },
      { name: 'Bilan', value: `**${net >= 0 ? '+' : ''}${formatAmount(net, s)}** · bourse : ${formatAmount(result.balanceAfter, s)}` },
    );
  } else {
    embed.setFooter({ text: 'Les rouleaux tournent…' });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(AGAIN_ID).setLabel(`Rejouer (${formatAmount(bet, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎰').setDisabled(!result || result.balanceAfter < bet),
  );
  return { embeds: [embed], components: [row] };
}

async function play(interaction: RepliableInteraction, member: Member, mode: 'reply' | 'update') {
  const s = await getSettings(member.guildId);
  const bet = s.slotBet;
  const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  let result: SpinResult;
  try {
    result = await playSlots(member);
  } catch (err) {
    if (err instanceof InsufficientFundsError) return void (await fail(`Un tour coûte ${formatAmount(bet, s)}, et tu n’as que ${formatAmount(err.balance, s)}.`));
    if (err instanceof SlotsError) return void (await fail(err.message));
    throw err;
  }

  // Petite animation : rouleaux masqués, puis révélés un par un.
  const spinning = ['❔', '❔', '❔'];
  // Pendant l'animation, on affiche la cagnotte d'avant le tour pour ne pas trahir le résultat.
  const poolBefore = result.jackpotWon > 0 ? result.jackpotWon - result.bet : result.pool - result.bet + result.payout;
  if (mode === 'update' && interaction.isButton()) await interaction.update(frame(spinning, bet, s, poolBefore));
  else await interaction.reply({ ...frame(spinning, bet, s, poolBefore), flags: MessageFlags.Ephemeral });
  for (let i = 0; i < 3; i++) {
    await sleep(600);
    spinning[i] = result.reels[i]!;
    await interaction.editReply(frame(spinning, bet, s, i === 2 ? result.pool : poolBefore, i === 2 ? result : undefined));
  }

  if (result.jackpotWon > 0 && interaction.channel?.isSendable()) {
    await interaction.channel.send({
      content: `🎰🦦 **JACKPOT !** ${userMention(interaction.user.id)} aligne trois loutres et rafle la cagnotte : **${formatAmount(result.jackpotWon, s)}** ! Par mon bouclier et mes moustaches ! La cagnotte repart à ${formatAmount(result.pool, s)}.`,
      allowedMentions: { users: [interaction.user.id] },
    }).catch(() => {});
  }
}

registerButton(AGAIN_ID, async ({ interaction, member }) => {
  const fresh = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  await play(interaction, fresh, 'update');
});

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('machine')
    .setDescription('Tente ta chance à la machine à sous de Voltron (prix fixe par tour)'),
  async execute({ interaction, member }) {
    await play(interaction, member, 'reply');
  },
});
