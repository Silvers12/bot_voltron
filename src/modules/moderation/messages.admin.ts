import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, channelMention, ChannelType, MessageFlags, PermissionFlagsBits,
  type ChatInputCommandInteraction, type GuildTextBasedChannel, type Message, type SlashCommandSubcommandGroupBuilder,
} from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { isBotAdmin } from '../../core/permissions.js';
import { registerButtonPrefix } from '../../discord/components.js';

const log = createLogger('messages');

export const PURGE_CONFIRM_PREFIX = 'admin:purge:';
const CONFIRM_TTL_MS = 60_000;

type Pending = { userId: string; channelId: string; fromMessageId: string | null; olderThanDays: number | null; keepPinned: boolean; timer: NodeJS.Timeout };
const pending = new Map<string, Pending>();

const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread] as const;

export function buildMessagesAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('messages')
    .setDescription('Suppression de messages')
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime un seul message')
        .addStringOption((o) => o.setName('id').setDescription('Identifiant du message').setRequired(true))
        .addChannelOption((o) => o.setName('salon').setDescription('Salon du message (par défaut : celui-ci)').addChannelTypes(...CHANNEL_TYPES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('depuis')
        .setDescription('Supprime un message et tous ceux postés après lui')
        .addStringOption((o) => o.setName('id').setDescription('Identifiant du premier message à supprimer').setRequired(true))
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(...CHANNEL_TYPES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vider')
        .setDescription('Supprime tous les messages du salon')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(...CHANNEL_TYPES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('anciens')
        .setDescription('Supprime les messages de plus de X jours')
        .addIntegerOption((o) => o.setName('jours').setDescription('Âge minimal des messages à supprimer, en jours').setRequired(true).setMinValue(1).setMaxValue(3650))
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(...CHANNEL_TYPES))
        .addBooleanOption((o) => o.setName('garder_epingles').setDescription('Conserver les messages épinglés (oui par défaut)')),
    );
}

function resolveChannel(interaction: ChatInputCommandInteraction<'cached'>): GuildTextBasedChannel | string {
  const target = interaction.options.getChannel('salon') ?? interaction.channel;
  const channel = target && interaction.guild.channels.cache.get(target.id);
  if (!channel || !channel.isTextBased()) return 'Salon introuvable.';
  const perms = channel.permissionsFor(interaction.guild.members.me!);
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.ReadMessageHistory) || !perms.has(PermissionFlagsBits.ManageMessages)) {
    return `Il me faut « Voir le salon », « Lire l’historique » et « Gérer les messages » dans ${channelMention(channel.id)}.`;
  }
  return channel;
}

export async function handleMessagesAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const channel = resolveChannel(interaction);
  if (typeof channel === 'string') return void (await reply(channel));

  if (sub === 'supprimer') {
    const id = interaction.options.getString('id', true).trim();
    if (!/^\d{15,22}$/.test(id)) return void (await reply('Identifiant invalide (clic droit sur le message → Copier l’identifiant du message).'));
    const message = await channel.messages.fetch(id).catch(() => null);
    if (!message) return void (await reply(`Message introuvable dans ${channelMention(channel.id)}.`));
    await message.delete();
    log.info(`${interaction.user.id} supprime le message ${id} dans #${channel.name}`);
    await reply(`Message de ${message.author.tag} supprimé dans ${channelMention(channel.id)}.`);
    return;
  }

  // depuis / vider / anciens : confirmation par bouton, valable une minute
  let fromMessageId: string | null = null;
  const olderThanDays = sub === 'anciens' ? interaction.options.getInteger('jours', true) : null;
  const keepPinned = sub === 'anciens' ? interaction.options.getBoolean('garder_epingles') ?? true : false;
  if (sub === 'depuis') {
    fromMessageId = interaction.options.getString('id', true).trim();
    if (!/^\d{15,22}$/.test(fromMessageId)) return void (await reply('Identifiant invalide (clic droit sur le message → Copier l’identifiant du message).'));
    const exists = await channel.messages.fetch(fromMessageId).catch(() => null);
    if (!exists) return void (await reply(`Message introuvable dans ${channelMention(channel.id)}.`));
  }
  const token = randomUUID();
  pending.set(token, { userId: interaction.user.id, channelId: channel.id, fromMessageId, olderThanDays, keepPinned, timer: setTimeout(() => pending.delete(token), CONFIRM_TTL_MS) });
  const what = olderThanDays
    ? `les messages de plus de **${olderThanDays} jour${olderThanDays > 1 ? 's' : ''}** dans ${channelMention(channel.id)}${keepPinned ? ' (épinglés conservés)' : ', épinglés compris'}`
    : fromMessageId ? `ce message et **tous** ceux postés après lui dans ${channelMention(channel.id)}` : `**tous** les messages de ${channelMention(channel.id)}, épinglés compris`;
  await interaction.reply({
    content: `⚠️ Supprimer ${what} ? C’est irréversible. Les messages de plus de 14 jours sont supprimés un par un, ce qui peut prendre du temps.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${PURGE_CONFIRM_PREFIX}${token}`).setLabel('Oui, supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    )],
    flags: MessageFlags.Ephemeral,
  });
}

registerButtonPrefix(PURGE_CONFIRM_PREFIX, async ({ interaction, guildMember, arg: token }) => {
  const job = pending.get(token);
  if (!job || job.userId !== interaction.user.id || !isBotAdmin(guildMember)) {
    await interaction.update({ content: 'Confirmation expirée ou invalide. Relance la commande.', components: [] });
    return;
  }
  pending.delete(token);
  clearTimeout(job.timer);
  const channel = interaction.guild.channels.cache.get(job.channelId);
  if (!channel || !channel.isTextBased()) return void (await interaction.update({ content: 'Salon introuvable.', components: [] }));

  await interaction.update({ content: '🗑️ Suppression en cours…', components: [] });
  const progress = async (n: number) => { await interaction.editReply(`🗑️ Suppression en cours… ${n} message(s) supprimé(s).`).catch(() => undefined); };
  const deleted = job.olderThanDays ? await purgeOlderThan(channel, job.olderThanDays, job.keepPinned, progress) : await purge(channel, job.fromMessageId, progress);
  log.info(`${interaction.user.id} supprime ${deleted} message(s) dans #${channel.name}${job.olderThanDays ? ` (plus de ${job.olderThanDays} j)` : job.fromMessageId ? ` depuis ${job.fromMessageId}` : ' (vidage)'}`);
  await interaction.editReply(`✅ ${deleted} message(s) supprimé(s) dans ${channelMention(channel.id)}.`).catch(() => undefined);
});

/**
 * Supprime les messages du salon, tous ou à partir d'un message (inclus). Les messages récents
 * partent par lots de 100 ; les plus anciens (plus de 14 jours, refusés par Discord en lot) un par un.
 */
async function purge(channel: GuildTextBasedChannel, fromMessageId: string | null, progress: (n: number) => Promise<void>): Promise<number> {
  let deleted = 0;
  let lastReport = Date.now();
  for (;;) {
    const batch = fromMessageId
      ? await channel.messages.fetch({ after: fromMessageId, limit: 100 })
      : await channel.messages.fetch({ limit: 100 });
    if (fromMessageId && deleted === 0) {
      const first = await channel.messages.fetch(fromMessageId).catch(() => null);
      if (first) batch.set(first.id, first);
    }
    if (batch.size === 0) return deleted;
    deleted += await deleteMessages(channel, [...batch.values()]);
    if (Date.now() - lastReport > 5_000) { lastReport = Date.now(); await progress(deleted); }
    if (fromMessageId) fromMessageId = batch.reduce((max, m) => (BigInt(m.id) > BigInt(max) ? m.id : max), fromMessageId);
  }
}

/** Supprime les messages plus vieux que `days` jours, en remontant l'historique du plus récent au plus ancien. */
async function purgeOlderThan(channel: GuildTextBasedChannel, days: number, keepPinned: boolean, progress: (n: number) => Promise<void>): Promise<number> {
  const cutoff = Date.now() - days * 24 * 3600_000;
  let deleted = 0;
  let lastReport = Date.now();
  let before: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) return deleted;
    before = batch.reduce((min, m) => (BigInt(m.id) < BigInt(min) ? m.id : min), batch.first()!.id);
    const targets = [...batch.values()].filter((m) => m.createdTimestamp < cutoff && !(keepPinned && m.pinned));
    if (targets.length) deleted += await deleteMessages(channel, targets);
    if (Date.now() - lastReport > 5_000) { lastReport = Date.now(); await progress(deleted); }
  }
}

async function deleteMessages(channel: GuildTextBasedChannel, messages: Message[]): Promise<number> {
  const limit = Date.now() - 13 * 24 * 3600_000; // marge d'un jour sous la limite de 14 jours
  const recent = messages.filter((m) => m.createdTimestamp > limit);
  const old = messages.filter((m) => m.createdTimestamp <= limit);
  let n = 0;
  if (recent.length > 1) {
    const result = await channel.bulkDelete(recent, true);
    n += result.size;
  } else if (recent.length === 1) {
    await recent[0]!.delete().catch(() => undefined);
    n += 1;
  }
  for (const m of old) {
    await m.delete().catch(() => undefined);
    n += 1;
  }
  return n;
}
