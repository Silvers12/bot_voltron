import { allowedUsers } from '../../modules/notify/mentions.js';
import { MessageFlags, SlashCommandBuilder, type Client } from 'discord.js';
import { defineCommand } from '../types.js';
import { registerButtonPrefix, type ButtonContext } from '../components.js';
import { createLogger } from '../../core/logger.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import {
  acceptDuel, cancelDuel, createDuel, declineDuel, DuelError, expireDuel, getDuel, InsufficientFundsError, setMessage, type DuelWithMembers,
} from '../../modules/duel/duel.service.js';
import { buildChallengeMessage, buildClosedMessage, buildResolvedMessage, DUEL_ACCEPT_PREFIX, DUEL_CANCEL_PREFIX, DUEL_DECLINE_PREFIX } from '../../modules/duel/duel.view.js';

const log = createLogger('duel');
import { trackAchievements } from '../../modules/achievements/achievements.service.js';
import { botName } from '../../core/identity.js';
const expiryTimers = new Map<string, NodeJS.Timeout>();

async function editDuelMessage(client: Client, duel: DuelWithMembers, payload: Parameters<import('discord.js').Message['edit']>[0]) {
  if (!duel.messageId) return;
  const channel = client.guilds.cache.get(duel.guildId)?.channels.cache.get(duel.channelId);
  if (!channel?.isTextBased()) return;
  await channel.messages.edit(duel.messageId, payload).catch((err) => log.warn(`Édition du duel ${duel.id} impossible`, err));
}

/** Programme l'expiration d'un défi : remboursement et mise à jour du message. */
export function armDuelExpiry(client: Client, duel: DuelWithMembers) {
  const delay = Math.max(0, duel.expiresAt.getTime() - Date.now());
  expiryTimers.set(duel.id, setTimeout(async () => {
    expiryTimers.delete(duel.id);
    try {
      const fresh = await getDuel(duel.id);
      if (fresh && (await expireDuel(fresh))) await editDuelMessage(client, fresh, buildClosedMessage(fresh, await getSettings(fresh.guildId), 'expired'));
    } catch (err) {
      log.error(`Expiration du duel ${duel.id} échouée`, err);
    }
  }, delay));
}

function disarm(id: string) {
  const t = expiryTimers.get(id);
  if (t) clearTimeout(t);
  expiryTimers.delete(id);
}

async function withDuel(ctx: ButtonContext, handler: (duel: DuelWithMembers) => Promise<void>) {
  const duel = await getDuel(ctx.arg);
  if (!duel || duel.guildId !== ctx.interaction.guildId) return void (await ctx.interaction.reply({ content: 'Ce duel n’existe plus.', flags: MessageFlags.Ephemeral }));
  if (duel.state !== 'PENDING') return void (await ctx.interaction.reply({ content: 'Ce duel est déjà terminé.', flags: MessageFlags.Ephemeral }));
  await handler(duel);
}

registerButtonPrefix(DUEL_ACCEPT_PREFIX, (ctx) => withDuel(ctx, async (duel) => {
  const { interaction, member } = ctx;
  if (member.id !== duel.opponentId) return void (await interaction.reply({ content: 'Ce défi ne t’est pas adressé. Lance le tien avec `/duel` !', flags: MessageFlags.Ephemeral }));
  const s = await getSettings(duel.guildId);
  try {
    const result = await acceptDuel(duel, { id: member.id, discordUserId: interaction.user.id });
    if (!result) return void (await interaction.reply({ content: 'Trop tard, ce défi n’est plus valable.', flags: MessageFlags.Ephemeral }));
    disarm(duel.id);
    trackAchievements(interaction.guild, duel.challengerId);
    trackAchievements(interaction.guild, duel.opponentId);
    await interaction.update(buildResolvedMessage(result, s));
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: `Il te faut ${formatAmount(duel.stake, s)} pour relever ce défi, et tu n’as que ${formatAmount(err.balance, s)}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    throw err;
  }
}));

registerButtonPrefix(DUEL_DECLINE_PREFIX, (ctx) => withDuel(ctx, async (duel) => {
  const { interaction, member } = ctx;
  if (member.id !== duel.opponentId) return void (await interaction.reply({ content: 'Seule la personne défiée peut refuser.', flags: MessageFlags.Ephemeral }));
  if (!(await declineDuel(duel))) return void (await interaction.reply({ content: 'Trop tard, ce défi n’est plus valable.', flags: MessageFlags.Ephemeral }));
  disarm(duel.id);
  await interaction.update(buildClosedMessage(duel, await getSettings(duel.guildId), 'declined'));
}));

registerButtonPrefix(DUEL_CANCEL_PREFIX, (ctx) => withDuel(ctx, async (duel) => {
  const { interaction, member } = ctx;
  if (member.id !== duel.challengerId) return void (await interaction.reply({ content: 'Seul le défieur peut annuler son défi.', flags: MessageFlags.Ephemeral }));
  if (!(await cancelDuel(duel))) return void (await interaction.reply({ content: 'Trop tard, ce défi n’est plus valable.', flags: MessageFlags.Ephemeral }));
  disarm(duel.id);
  await interaction.update(buildClosedMessage(duel, await getSettings(duel.guildId), 'cancelled'));
}));

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Défie un membre en duel pour des cœurs')
    .addUserOption((o) => o.setName('membre').setDescription('Adversaire').setRequired(true))
    .addIntegerOption((o) => o.setName('mise').setDescription('Mise en cœurs (chacun)').setRequired(true).setMinValue(1)),
  async execute({ interaction, member }) {
    const s = await getSettings(interaction.guildId);
    const target = interaction.options.getMember('membre');
    const stake = interaction.options.getInteger('mise', true);
    const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!target) return void (await fail('Ce membre ne fait pas (ou plus) partie du serveur.'));
    if (target.user.bot) return void (await fail('Défier une petite loutre ? Elle préfère les câlins.'));
    if (target.id === interaction.user.id) return void (await fail(`Se défier soi-même ? ${botName()} admire l’audace, mais non.`));

    const opponent = await ensureMember(target);
    let duel: DuelWithMembers;
    try {
      duel = await createDuel({ guildId: interaction.guildId, channelId: interaction.channelId, challenger: { id: member.id, discordUserId: interaction.user.id }, opponentId: opponent.id, stake });
    } catch (err) {
      if (err instanceof InsufficientFundsError) return void (await fail(`Il te faut ${formatAmount(stake, s)} pour lancer ce défi, et tu n’as que ${formatAmount(err.balance, s)}.`));
      if (err instanceof DuelError) return void (await fail(err.message));
      throw err;
    }
    const message = await interaction.reply({ ...buildChallengeMessage(duel, s, await allowedUsers(interaction.guildId, 'defi', duel.opponent.discordUserId)), withResponse: true });
    const sent = message.resource?.message;
    if (sent) await setMessage(duel.id, sent.id);
    armDuelExpiry(interaction.client, { ...duel, messageId: sent?.id ?? null });
  },
});
