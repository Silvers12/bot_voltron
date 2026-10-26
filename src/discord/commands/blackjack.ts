import { MessageFlags, SlashCommandBuilder, type RepliableInteraction } from 'discord.js';
import { defineCommand } from '../types.js';
import { trackAchievements } from '../../modules/achievements/achievements.service.js';
import { registerButton, registerButtonPrefix, type ButtonContext } from '../components.js';
import { openSession, touchSession } from '../sessions.js';
import { prisma } from '../../infrastructure/prisma.js';
import type { Member } from '../../generated/prisma/client.js';
import { getBalance } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import {
  BlackjackError, double, getActiveGame, hit, InsufficientFundsError, settle, stand, startGame, toView, type GameView,
} from '../../modules/casino/blackjack.service.js';
import { BJ_AGAIN_PREFIX, BJ_DOUBLE_ID, BJ_HIT_ID, BJ_STAND_ID, buildBlackjackView } from '../../modules/casino/blackjack.view.js';

/** Sans action pendant ce délai, la partie est réglée comme si le joueur restait. */
const TURN_TTL_MS = 2 * 60 * 1000;
const sessionKey = (guildId: string, userId: string) => `blackjack:${guildId}:${userId}`;

async function render(view: GameView, member: Member) {
  const [balance, settings] = await Promise.all([getBalance(member.id), getSettings(member.guildId)]);
  return buildBlackjackView(view, balance, settings);
}

/** À l'expiration : la banque joue, et le message est mis à jour avec le résultat. */
function expireHandler(member: Member) {
  return async (interaction: RepliableInteraction) => {
    const game = await getActiveGame(member.id);
    if (!game) return;
    const view = await settle(game, 'voltron');
    if (interaction.inCachedGuild()) trackAchievements(interaction.guild, member.id);
    const payload = await render(view, member);
    await interaction.editReply({ ...payload, content: '⏱️ Temps écoulé : Voltron a joué pour toi en restant.' });
  };
}

async function play(ctx: { interaction: RepliableInteraction; member: Member }, bet: number, { reply }: { reply: 'reply' | 'update' }) {
  const { interaction, member } = ctx;
  const settings = await getSettings(member.guildId);
  const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  try {
    const view = await startGame(member, bet);
    const payload = await render(view, member);
    if (reply === 'update' && interaction.isButton()) await interaction.update({ ...payload, content: '' });
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    if (view.finished) { if (interaction.inCachedGuild()) trackAchievements(interaction.guild, member.id); return; }
    await openSession(sessionKey(member.guildId, interaction.user.id), interaction, TURN_TTL_MS, expireHandler(member));
  } catch (err) {
    if (err instanceof InsufficientFundsError) return void (await fail(`Il te faut ${formatAmount(bet, settings)} pour miser, et tu n’as que ${formatAmount(err.balance, settings)}.`));
    if (err instanceof BlackjackError) return void (await fail(err.message));
    throw err;
  }
}

async function act(ctx: ButtonContext, action: (m: Member) => Promise<GameView>) {
  const { interaction, member } = ctx;
  try {
    const view = await action(member);
    await interaction.update({ ...(await render(view, member)), content: '' });
    if (view.finished) trackAchievements(interaction.guild, member.id);
    if (!view.finished) touchSession(sessionKey(member.guildId, interaction.user.id), interaction, TURN_TTL_MS);
  } catch (err) {
    if (err instanceof InsufficientFundsError || err instanceof BlackjackError) {
      await interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral });
      return;
    }
    throw err;
  }
}

registerButton(BJ_HIT_ID, (ctx) => act(ctx, hit));
registerButton(BJ_STAND_ID, (ctx) => act(ctx, stand));
registerButton(BJ_DOUBLE_ID, (ctx) => act(ctx, double));
registerButtonPrefix(BJ_AGAIN_PREFIX, async (ctx) => {
  const fresh = await prisma.member.findUniqueOrThrow({ where: { id: ctx.member.id } });
  await play({ interaction: ctx.interaction, member: fresh }, Number(ctx.arg) || 0, { reply: 'update' });
});

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Joue au blackjack contre Voltron en misant des cœurs')
    .addIntegerOption((o) => o.setName('mise').setDescription('Mise en cœurs').setRequired(true).setMinValue(1)),
  async execute({ interaction, member }) {
    // Partie en cours (ex. message fermé) : on la ré-affiche plutôt que d'en ouvrir une autre.
    const active = await getActiveGame(member.id);
    if (active) {
      const canDouble = (active.playerCards as unknown[]).length === 2 && !active.doubled;
      await interaction.reply({ ...(await render(toView(active, { canDouble }), member)), content: 'Tu avais une partie en cours, la voici.', flags: MessageFlags.Ephemeral });
      await openSession(sessionKey(member.guildId, interaction.user.id), interaction, TURN_TTL_MS, expireHandler(member));
      return;
    }
    await play({ interaction, member }, interaction.options.getInteger('mise', true), { reply: 'reply' });
  },
});
