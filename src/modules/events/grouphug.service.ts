import { randomInt } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildTextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import type { GroupHug } from '../../generated/prisma/client.js';
import { credit } from '../economy/economy.service.js';
import { getSettings, updateGroupHugSettings } from '../settings/settings.service.js';
import { buildHugClosedMessage, buildHugOpenMessage } from './grouphug.view.js';

const log = createLogger('grouphug');

/** Minuteries de clôture en mémoire, par identifiant de câlin. */
const closeTimers = new Map<string, NodeJS.Timeout>();

export class GroupHugError extends Error {}

/** Le bot peut-il poster dans ce salon ? Renvoie le salon ou un message d'erreur. */
export function resolveHugChannel(guild: Guild, channelId: string): GuildTextBasedChannel | string {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return 'Ce salon n’existe plus.';
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return 'Il faut un salon textuel.';
  const me = guild.members.me;
  if (!me) return 'Le bot n’est pas chargé sur ce serveur.';
  const perms = channel.permissionsFor(me);
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.EmbedLinks)) {
    return 'Le bot doit pouvoir voir le salon, y envoyer des messages et intégrer des liens.';
  }
  return channel;
}

export async function getOpenHug(guildId: string): Promise<GroupHug | null> {
  return prisma.groupHug.findFirst({ where: { guildId, state: 'OPEN' } });
}

/** Tire la prochaine date d'apparition dans l'intervalle configuré et la persiste. */
export async function scheduleNext(guildId: string, from = new Date()) {
  const s = await getSettings(guildId);
  const min = Math.max(1, s.groupHugMinIntervalMinutes);
  const max = Math.max(min, s.groupHugMaxIntervalMinutes);
  const minutes = min === max ? min : randomInt(min, max + 1);
  const next = new Date(from.getTime() + minutes * 60_000);
  await updateGroupHugSettings(guildId, { nextGroupHugAt: next });
  log.info(`Prochain câlin collectif sur ${guildId} : ${next.toISOString()}`);
  return next;
}

/** Lance un câlin collectif dans un salon (tiré au hasard si non précisé). */
export async function launchHug(guild: Guild, channelId?: string): Promise<GroupHug> {
  const s = await getSettings(guild.id);
  if (await getOpenHug(guild.id)) throw new GroupHugError('Un câlin collectif est déjà en cours.');

  const candidates = channelId ? [channelId] : s.groupHugChannelIds;
  if (!candidates.length) throw new GroupHugError('Aucun salon configuré. Utilise `/admin calin ajouter-salon`.');
  const picked = candidates[randomInt(candidates.length)]!;
  const channel = resolveHugChannel(guild, picked);
  if (typeof channel === 'string') throw new GroupHugError(`Salon <#${picked}> inutilisable : ${channel}`);

  const endsAt = new Date(Date.now() + Math.max(10, s.groupHugDurationSeconds) * 1000);
  const hug = await prisma.groupHug.create({
    data: { guildId: guild.id, channelId: channel.id, rewardPerHugger: s.groupHugReward, endsAt },
  });
  const message = await channel.send(buildHugOpenMessage(hug, 0, s));
  const saved = await prisma.groupHug.update({ where: { id: hug.id }, data: { messageId: message.id } });
  armCloseTimer(guild.client, saved);
  log.info(`Câlin collectif ${hug.id} lancé dans #${channel.name}`);
  return saved;
}

function armCloseTimer(client: Client, hug: GroupHug) {
  const delay = Math.max(0, hug.endsAt.getTime() - Date.now());
  const existing = closeTimers.get(hug.id);
  if (existing) clearTimeout(existing);
  closeTimers.set(hug.id, setTimeout(() => void closeHug(client, hug.id).catch((err) => log.error(`Clôture ${hug.id} échouée`, err)), delay));
}

export type JoinResult = { ok: true; count: number } | { ok: false; reason: 'closed' | 'already' };

/** Enregistre un câlineur et met le message à jour. */
export async function joinHug(client: Client, hugId: string, memberId: string): Promise<JoinResult> {
  const hug = await prisma.groupHug.findUnique({ where: { id: hugId } });
  if (!hug || hug.state !== 'OPEN' || hug.endsAt.getTime() <= Date.now()) return { ok: false, reason: 'closed' };
  try {
    await prisma.groupHugParticipant.create({ data: { hugId, memberId } });
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') return { ok: false, reason: 'already' };
    throw err;
  }
  const count = await prisma.groupHugParticipant.count({ where: { hugId } });
  await editHugMessage(client, hug, async (s) => buildHugOpenMessage(hug, count, s));
  return { ok: true, count };
}

async function editHugMessage(client: Client, hug: GroupHug, build: (s: Awaited<ReturnType<typeof getSettings>>) => Promise<ReturnType<typeof buildHugOpenMessage>>) {
  if (!hug.messageId) return;
  const guild = client.guilds.cache.get(hug.guildId);
  const channel = guild?.channels.cache.get(hug.channelId);
  if (!channel?.isTextBased()) return;
  const s = await getSettings(hug.guildId);
  await channel.messages.edit(hug.messageId, await build(s)).catch((err) => log.warn(`Édition du message ${hug.messageId} impossible`, err));
}

/** Clôture atomique : calcule la récompense, crédite chaque câlineur, met le message à jour. */
export async function closeHug(client: Client, hugId: string) {
  closeTimers.delete(hugId);
  const { count: claimed } = await prisma.groupHug.updateMany({ where: { id: hugId, state: 'OPEN' }, data: { state: 'CLOSED' } });
  if (claimed === 0) return; // déjà clôturé

  const hug = await prisma.groupHug.findUniqueOrThrow({ where: { id: hugId }, include: { participants: { include: { member: true } } } });
  const count = hug.participants.length;
  const rewardEach = hug.rewardPerHugger * count;
  await prisma.groupHug.update({ where: { id: hugId }, data: { rewardEach } });

  for (const p of hug.participants) {
    await credit({ memberId: p.memberId, amount: rewardEach, type: 'GROUP_HUG', actorDiscordId: 'voltron', reason: `Câlin collectif à ${count}` });
  }
  log.info(`Câlin collectif ${hugId} clôturé : ${count} câlineur(s), ${rewardEach} chacun`);

  await editHugMessage(client, hug, async (s) => buildHugClosedMessage(hug, hug.participants.map((p) => p.member.discordUserId), rewardEach, s));
  await scheduleNext(hug.guildId);
}

/** Au démarrage : clôt les câlins expirés, réarme les minuteries des câlins encore ouverts. */
export async function reconcileHugs(client: Client) {
  const open = await prisma.groupHug.findMany({ where: { state: 'OPEN' } });
  for (const hug of open) {
    if (hug.endsAt.getTime() <= Date.now()) await closeHug(client, hug.id);
    else armCloseTimer(client, hug);
  }
  if (open.length) log.info(`${open.length} câlin(s) collectif(s) repris au redémarrage.`);
}

/** Pointage périodique : lance un câlin si l'heure programmée est passée. */
export async function tickScheduler(client: Client) {
  for (const guildId of config.discord.guildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const s = await getSettings(guildId);
    if (!s.groupHugChannelIds.length) continue;
    if (!s.nextGroupHugAt) { await scheduleNext(guildId); continue; }
    if (s.nextGroupHugAt.getTime() > Date.now()) continue;
    if (await getOpenHug(guildId)) continue;
    try {
      await launchHug(guild);
    } catch (err) {
      log.warn(`Lancement automatique impossible sur ${guild.name}`, err);
      await scheduleNext(guildId);
    }
  }
}
