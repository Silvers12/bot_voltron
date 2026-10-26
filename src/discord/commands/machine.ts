import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder, userMention, type RepliableInteraction } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { defineCommand } from '../types.js';
import { registerButton } from '../components.js';
import { prisma } from '../../infrastructure/prisma.js';
import type { GuildSettings, Member } from '../../generated/prisma/client.js';
import { getBalance, InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import { getJackpot, playSlots, type SpinResult } from '../../modules/casino/slots.service.js';

const SPIN_ID = 'slots:spin';

function frame(reels: string[], bet: number, s: GuildSettings, pool: number, result?: SpinResult, idle?: { balance: number }) {
  const net = result ? result.payout - result.bet : 0;
  const embed = new EmbedBuilder()
    .setColor(!result ? 0x2e86c1 : result.kind === 'jackpot' ? 0xf1c40f : result.kind === 'triple' ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🎰 La machine de Voltron')
    .setDescription(`# ${reels.join(' │ ')}`)
    .addFields({ name: 'Mise', value: formatAmount(bet, s), inline: true }, { name: '🦦🦦🦦 Cagnotte', value: `**${formatAmount(pool, s)}**`, inline: true });
  if (result) {
    embed.addFields(
      { name: 'Résultat', value: result.kind === 'jackpot' ? `${result.label} Tu rafles toute la cagnotte : **${formatAmount(result.payout, s)}** !` : result.kind === 'triple' ? `${result.label} Tu emportes ${s.slotTriplePercent} % de la cagnotte : **${formatAmount(result.payout, s)}** !` : result.label },
      { name: 'Bilan', value: `**${net >= 0 ? '+' : ''}${formatAmount(net, s)}** · bourse : ${formatAmount(result.balanceAfter, s)}` },
    );
  } else if (idle) {
    embed.addFields({ name: 'Ta bourse', value: formatAmount(idle.balance, s) }).setFooter({ text: 'Trois symboles identiques gagnent. Trois loutres raflent toute la cagnotte !' });
  } else {
    embed.setFooter({ text: 'Les rouleaux tournent…' });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SPIN_ID)
      .setLabel(`${result ? 'Rejouer' : 'Lancer'} (${formatAmount(bet, s)})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎰')
      .setDisabled(idle ? idle.balance < bet : !result || result.balanceAfter < bet),
  );
  return { embeds: [embed], components: [row] };
}

async function play(interaction: RepliableInteraction, member: Member) {
  const s = await getSettings(member.guildId);
  const bet = s.slotBet;
  const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  let result: SpinResult;
  try {
    result = await playSlots(member);
  } catch (err) {
    if (err instanceof InsufficientFundsError) return void (await fail(`Un tour coûte ${formatAmount(bet, s)}, et tu n’as que ${formatAmount(err.balance, s)}.`));
    throw err;
  }

  // Petite animation : rouleaux masqués, puis révélés un par un.
  const spinning = ['❔', '❔', '❔'];
  // Pendant l'animation, on affiche la cagnotte d'avant le tour pour ne pas trahir le résultat.
  const poolBefore = result.kind === 'jackpot' ? result.payout - result.bet : result.pool - result.bet + result.payout;
  if (interaction.isButton()) await interaction.update(frame(spinning, bet, s, poolBefore));
  else await interaction.reply({ ...frame(spinning, bet, s, poolBefore), flags: MessageFlags.Ephemeral });
  for (let i = 0; i < 3; i++) {
    await sleep(600);
    spinning[i] = result.reels[i]!;
    await interaction.editReply(frame(spinning, bet, s, i === 2 ? result.pool : poolBefore, i === 2 ? result : undefined));
  }

  if (result.kind === 'jackpot' && interaction.channel?.isSendable()) {
    await interaction.channel.send({
      content: `🎰🦦 **JACKPOT !** ${userMention(interaction.user.id)} aligne trois loutres et rafle la cagnotte : **${formatAmount(result.payout, s)}** ! Par mon bouclier et mes moustaches ! La cagnotte repart à ${formatAmount(result.pool, s)}.`,
      allowedMentions: { users: [interaction.user.id] },
    }).catch(() => {});
  }
}

registerButton(SPIN_ID, async ({ interaction, member }) => {
  const fresh = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
  await play(interaction, fresh);
});

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('machine')
    .setDescription('Tente ta chance à la machine à sous de Voltron (prix fixe par tour)'),
  async execute({ interaction, member }) {
    // La machine s'affiche à l'arrêt ; rien n'est débité avant d'appuyer sur Lancer.
    const [s, pool, balance] = await Promise.all([getSettings(member.guildId), getJackpot(member.guildId), getBalance(member.id)]);
    await interaction.reply({ ...frame(['🎰', '🎰', '🎰'], s.slotBet, s, pool.pool, undefined, { balance }), flags: MessageFlags.Ephemeral });
  },
});
