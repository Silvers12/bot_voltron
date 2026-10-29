import {
  ChannelType, channelMention, MessageFlags, OverwriteType, PermissionFlagsBits, type CategoryChannel, type ChatInputCommandInteraction, type Guild, type TextChannel,
} from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { ensureNotifyRoles, publishPages } from '../notify/notify.service.js';
import { ensurePrisonRole } from '../prison/prison.service.js';
import { scheduleNext } from '../events/grouphug.service.js';
import { getOrCreateOpenLottery, publishLottery } from '../lottery/lottery.service.js';
import type { GuildSettings } from '../../generated/prisma/client.js';

import { botName } from '../../core/identity.js';
const log = createLogger('installation');

/** Salons créés par l'installation, avec le réglage qu'ils alimentent. */
const CHANNELS = [
  { key: 'accueil', name: '🦦・accueil', topic: `Bienvenue ! ${botName()} se présente ici.`, readOnly: true },
  { key: 'notifications', name: '🔔・notifications', topic: `Choisis ici les notifications que ${botName()} t’envoie.`, readOnly: true },
  { key: 'commandes', name: '🎮・commandes', topic: `Les commandes de ${botName()} se tapent ici : /profil, /calin, /blackjack…`, readOnly: false },
  { key: 'jeux', name: '🎲・jeux', topic: 'Câlins collectifs, tombola, machine à sous et duels.', readOnly: false },
  { key: 'comptage', name: '🔢・comptage', topic: 'On compte à la suite : 1, 2, 3… ou 2+2. Une erreur coûte cher !', readOnly: false },
  { key: 'annonces', name: '📣・annonces-voltron', topic: 'Montées de niveau et succès débloqués.', readOnly: true },
] as const;
type ChannelKey = (typeof CHANNELS)[number]['key'];


const BOT_ALLOW = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone,
];

/** Salon existant déjà rattaché à un réglage, sinon null. */
function existingChannel(guild: Guild, s: GuildSettings, key: ChannelKey): TextChannel | null {
  const id = {
    accueil: s.welcomeChannelId,
    notifications: s.notifyChannelId,
    commandes: s.commandChannelIds[0] ?? null,
    jeux: s.lotteryChannelId ?? s.groupHugChannelIds[0] ?? null,
    comptage: s.countingChannelId,
    annonces: s.achievementChannelId ?? s.levelUpChannelId,
  }[key];
  const ch = id ? guild.channels.cache.get(id) : null;
  return ch && ch.type === ChannelType.GuildText ? ch : null;
}

async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const found = guild.channels.cache.find((c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === name);
  return found ?? guild.channels.create({ name, type: ChannelType.GuildCategory, reason: `Installation de ${botName()}` });
}

async function ensureChannel(guild: Guild, category: CategoryChannel, def: (typeof CHANNELS)[number], existing: TextChannel | null): Promise<{ channel: TextChannel; created: boolean }> {
  const me = guild.members.me!;
  const overwrites = [
    { id: me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
    ...(def.readOnly ? [{ id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.SendMessages] }] : []),
  ];
  if (existing) {
    await existing.permissionOverwrites.edit(me.id, Object.fromEntries(BOT_ALLOW.map((p) => [permName(p), true]))).catch(() => undefined);
    return { channel: existing, created: false };
  }
  const byName = guild.channels.cache.find((c): c is TextChannel => c.type === ChannelType.GuildText && c.name === def.name && c.parentId === category.id);
  if (byName) return { channel: byName, created: false };
  const channel = await guild.channels.create({ name: def.name, type: ChannelType.GuildText, parent: category.id, topic: def.topic, permissionOverwrites: overwrites, reason: `Installation de ${botName()}` });
  return { channel, created: true };
}

function permName(bit: bigint): string {
  return Object.entries(PermissionFlagsBits).find(([, v]) => v === bit)![0];
}

export async function handleInstall(interaction: ChatInputCommandInteraction<'cached'>) {
  const guild = interaction.guild;
  const me = guild.members.me!;
  const missing = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles].filter((p) => !me.permissions.has(p)).map(permName);
  if (missing.length) {
    return void (await interaction.reply({ content: `Il me manque des permissions pour installer : ${missing.join(', ')}. Donne-les à mon rôle puis relance.`, flags: MessageFlags.Ephemeral }));
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const categoryName = interaction.options.getString('categorie')?.trim() || `🦦 ${botName()}`;
  const report: string[] = [];

  // 1. Catégorie et salons
  let s = await getSettings(guild.id);
  const category = await ensureCategory(guild, categoryName);
  const made: Record<ChannelKey, TextChannel> = {} as Record<ChannelKey, TextChannel>;
  for (const def of CHANNELS) {
    const { channel, created } = await ensureChannel(guild, category, def, existingChannel(guild, s, def.key));
    made[def.key] = channel;
    report.push(`${created ? '🆕' : '✔️'} ${channelMention(channel.id)}${created ? ' créé' : ' conservé'}`);
  }

  // 2. Réglages : chaque salon alimente sa fonctionnalité (sans écraser un réglage déjà fait ailleurs)
  s = await updateSettings(guild.id, {
    welcomeChannelId: s.welcomeChannelId ?? made.accueil.id,
    notifyChannelId: s.notifyChannelId ?? made.notifications.id,
    commandChannelIds: s.commandChannelIds.length ? s.commandChannelIds : [made.commandes.id, made.jeux.id],
    groupHugChannelIds: s.groupHugChannelIds.length ? s.groupHugChannelIds : [made.jeux.id],
    lotteryChannelId: s.lotteryChannelId ?? made.jeux.id,
    countingChannelId: s.countingChannelId ?? made.comptage.id,
    achievementChannelId: s.achievementChannelId ?? made.annonces.id,
    levelUpChannelId: s.levelUpChannelId ?? made.annonces.id,
  });
  report.push('✔️ Réglages : commandes limitées à commandes + jeux, câlins collectifs et tombola dans jeux, comptage, annonces de niveaux et de succès.');

  // 3. Rôles de notification et page d'accueil
  try {
    await ensureNotifyRoles(guild);
    const outcome = await publishPages(guild);
    report.push(`✔️ Rôles de notification prêts, ${outcome}.`);
  } catch (err) {
    report.push(`⚠️ Accueil : ${(err as Error).message}`);
  }
  const prisonRole = await ensurePrisonRole(guild, await getSettings(guild.id)).catch(() => null);
  report.push(prisonRole ? '✔️ Rôle Prison prêt (tricheurs du comptage).' : '⚠️ Rôle Prison non créé : vérifiez « Gérer les rôles ».');

  // 4. Automatismes : première tombola publiée, premier câlin collectif programmé
  try {
    const lottery = await getOrCreateOpenLottery(guild.id);
    if (!lottery.messageId) await publishLottery(interaction.client, lottery, '🎟️ **La tombola est ouverte !** Un ticket, une chance. Le gagnant rafle toute la cagnotte.');
    report.push('✔️ Tombola ouverte et publiée.');
  } catch (err) {
    report.push(`⚠️ Tombola : ${(err as Error).message}`);
  }
  if (!s.nextGroupHugAt) await scheduleNext(guild.id);
  report.push('✔️ Premier câlin collectif programmé.');

  log.info(`Installation sur ${guild.name} : ${CHANNELS.length} salons dans « ${categoryName} »`);
  report.push('', '**Et ensuite ?** `/admin succes recalculer` une fois, `/admin panneau` pour ajuster montants et horaires, `/admin boutique ajouter` pour remplir la boutique, `/admin niveaux` ou le panneau pour les rôles de palier.');
  await interaction.editReply(report.join('\n'));
}
