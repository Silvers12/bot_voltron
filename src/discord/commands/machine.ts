import { card, divider, screen, text } from '../v2.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type MessageActionRowComponentBuilder, MessageFlags, SlashCommandBuilder, userMention, type ButtonInteraction } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { defineCommand } from '../types.js';
import { registerButton } from '../components.js';
import { prisma } from '../../infrastructure/prisma.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import { getJackpot, playSlots, type SpinResult } from '../../modules/casino/slots.service.js';
import { trackAchievements } from '../../modules/achievements/achievements.service.js';

import { botName } from '../../core/identity.js';
const SPIN_ID = 'slots:spin';

/** Machines en train de tourner, par identifiant de message : un seul tour à la fois par machine. */
const spinning = new Set<string>();

interface FrameOptions {
  reels: string[];
  s: GuildSettings;
  pool: number;
  /** Joueur du tour affiché (en cours ou terminé) */
  playerId?: string;
  result?: SpinResult;
  busy?: boolean;
}

function frame({ reels, s, pool, playerId, result, busy }: FrameOptions) {
  const c = card(!result ? 0x2e86c1 : result.kind === 'jackpot' ? 0xf1c40f : result.kind === 'triple' ? 0x2ecc71 : 0xe74c3c);
  c.addTextDisplayComponents(text(`# 🎰 La machine de ${botName()}\n# ${reels.join(' │ ')}`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(`🦦🦦🦦 **Cagnotte** · **${formatAmount(pool, s)}** · 🎟️ **Prix du tour** · ${formatAmount(s.slotBet, s)}`));
  if (result && playerId) {
    const net = result.payout - result.bet;
    const line = result.kind === 'jackpot'
      ? `${result.label} ${userMention(playerId)} rafle toute la cagnotte : **${formatAmount(result.payout, s)}** !`
      : result.kind === 'triple'
        ? `${result.label} ${userMention(playerId)} emporte ${s.slotTriplePercent} % de la cagnotte : **${formatAmount(result.payout, s)}** !`
        : `${userMention(playerId)} : ${result.label}`;
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(`**Dernier tour**\n${line}\nBilan du tour : **${net >= 0 ? '+' : ''}${formatAmount(net, s)}**`));
  } else if (playerId) {
    c.addSeparatorComponents(divider());
    c.addTextDisplayComponents(text(`**En cours** · ${userMention(playerId)} lance les rouleaux…`));
  }
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text('-# Trois symboles identiques gagnent. Trois loutres raflent toute la cagnotte ! Chacun joue avec sa bourse.'));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SPIN_ID).setLabel(`Lancer (${formatAmount(s.slotBet, s)})`).setStyle(ButtonStyle.Primary).setEmoji('🎰').setDisabled(busy === true),
  );
  return { ...screen(c, [row]), allowedMentions: { parse: [] as [] } };
}

async function spin(interaction: ButtonInteraction<'cached'>, memberId: string) {
  const messageId = interaction.message.id;
  const s = await getSettings(interaction.guildId);
  if (spinning.has(messageId)) {
    await interaction.reply({ content: 'La machine tourne déjà, attends la fin du tour.', flags: MessageFlags.Ephemeral });
    return;
  }
  spinning.add(messageId);
  try {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    let result: SpinResult;
    try {
      result = await playSlots(member);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await interaction.reply({ content: `Un tour coûte ${formatAmount(s.slotBet, s)}, et tu n’as que ${formatAmount(err.balance, s)}.`, flags: MessageFlags.Ephemeral });
        return;
      }
      throw err;
    }

    // Animation publique : cagnotte d'avant le tour pendant que les rouleaux tournent, puis résultat.
    const poolBefore = result.kind === 'jackpot' ? result.payout - result.bet : result.pool - result.bet + result.payout;
    const reels = ['❔', '❔', '❔'];
    await interaction.update(frame({ reels, s, pool: poolBefore, playerId: interaction.user.id, busy: true }));
    for (let i = 0; i < 3; i++) {
      await sleep(600);
      reels[i] = result.reels[i]!;
      const last = i === 2;
      await interaction.editReply(frame({ reels, s, pool: last ? result.pool : poolBefore, playerId: interaction.user.id, result: last ? result : undefined, busy: !last }));
    }

    await interaction.followUp({ content: `Il te reste ${formatAmount(result.balanceAfter, s)}.`, flags: MessageFlags.Ephemeral });
    trackAchievements(interaction.guild, member.id);

    if (result.kind === 'jackpot' && interaction.channel?.isSendable()) {
      await interaction.channel.send({
        content: `🎰🦦 **JACKPOT !** ${userMention(interaction.user.id)} aligne trois loutres et rafle la cagnotte : **${formatAmount(result.payout, s)}** ! Par mon bouclier et mes moustaches ! La cagnotte repart à ${formatAmount(result.pool, s)}.`,
        allowedMentions: { users: [interaction.user.id] },
      }).catch(() => {});
    }
  } finally {
    spinning.delete(messageId);
  }
}

registerButton(SPIN_ID, async ({ interaction, member }) => {
  await spin(interaction, member.id);
});

export default defineCommand({
  data: new SlashCommandBuilder().setName('machine').setDescription(`Installe la machine à sous de ${botName()} dans le salon (prix fixe par tour)`),
  async execute({ interaction, member }) {
    // Machine publique : tout le monde voit les tours et la cagnotte, chacun joue avec sa bourse.
    const [s, jackpot] = await Promise.all([getSettings(member.guildId), getJackpot(member.guildId)]);
    await interaction.reply(frame({ reels: ['🎰', '🎰', '🎰'], s, pool: jackpot.pool }));
  },
});
