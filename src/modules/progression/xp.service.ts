import type { Guild, Message, VoiceState } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { isAllowedGuild } from '../../core/config.js';
import { getSettings } from '../settings/settings.service.js';
import { ensureMember } from '../community/member.service.js';
import { syncLevel } from './levels.service.js';

const log = createLogger('xp');

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Crédite l'XP d'un message si le délai anti-spam est écoulé. Le message n'est jamais lu. */
export async function handleMessage(message: Message) {
  if (!message.inGuild() || !isAllowedGuild(message.guildId)) return;
  if (message.author.bot || message.system || !message.member) return;

  const settings = await getSettings(message.guildId);
  if (settings.xpPerMessage <= 0) return;

  const member = await prisma.member.findUnique({
    where: { guildId_discordUserId: { guildId: message.guildId, discordUserId: message.author.id } },
    select: { id: true, lastMessageXpAt: true },
  }) ?? await ensureMember(message.member);

  const now = new Date();
  const cooldownMs = settings.xpMessageCooldownSeconds * 1000;
  const eligible = !member.lastMessageXpAt || now.getTime() - member.lastMessageXpAt.getTime() >= cooldownMs;

  // Mise à jour conditionnelle : deux messages simultanés ne créditent qu'une fois.
  const { count } = await prisma.member.updateMany({
    where: {
      id: member.id,
      ...(cooldownMs > 0 ? { OR: [{ lastMessageXpAt: null }, { lastMessageXpAt: { lte: new Date(now.getTime() - cooldownMs) } }] } : {}),
    },
    data: eligible
      ? { messageCount: { increment: 1 }, xp: { increment: settings.xpPerMessage }, lastMessageXpAt: now }
      : { messageCount: { increment: 1 } },
  });
  if (count === 0) await prisma.member.update({ where: { id: member.id }, data: { messageCount: { increment: 1 } } });
  else if (eligible) await syncLevel(message.guild, member.id);
}

// ---------------------------------------------------------------------------
// Vocal
// ---------------------------------------------------------------------------

/** Salon vocal éligible : pas le salon AFK du serveur. */
function isCountedChannel(guild: Guild, channelId: string | null): channelId is string {
  return channelId !== null && channelId !== guild.afkChannelId;
}

async function startVoiceSession(memberId: string, channelId: string, at = new Date()) {
  await prisma.voiceSession.upsert({
    where: { memberId },
    create: { memberId, channelId, startedAt: at, lastTickAt: at },
    update: { channelId },
  });
}

/**
 * Crédite le temps écoulé depuis le dernier pointage et l'XP correspondante
 * (une tranche = voiceIntervalMinutes). Les tranches entamées sont conservées dans voiceSeconds.
 */
export async function creditVoiceTime(memberId: string, guildId: string, until: Date, { close }: { close: boolean }, guild?: Guild) {
  const settings = await getSettings(guildId);
  const intervalSeconds = Math.max(60, settings.voiceIntervalMinutes * 60);

  const gained = await prisma.$transaction(async (db) => {
    const session = await db.voiceSession.findUnique({ where: { memberId } });
    if (!session) return;
    const elapsed = Math.max(0, Math.floor((until.getTime() - session.lastTickAt.getTime()) / 1000));
    const member = await db.member.findUniqueOrThrow({ where: { id: memberId }, select: { voiceSeconds: true } });
    const before = Math.floor(member.voiceSeconds / intervalSeconds);
    const after = Math.floor((member.voiceSeconds + elapsed) / intervalSeconds);
    const xpGain = (after - before) * settings.xpPerVoiceInterval;

    await db.member.update({ where: { id: memberId }, data: { voiceSeconds: { increment: elapsed }, xp: { increment: xpGain } } });
    if (close) await db.voiceSession.delete({ where: { memberId } });
    else await db.voiceSession.update({ where: { memberId }, data: { lastTickAt: until } });
    if (xpGain > 0) log.debug(`+${xpGain} XP vocal pour ${memberId}`);
    return xpGain;
  });
  if (gained && gained > 0 && guild) await syncLevel(guild, memberId);
}

/** Entrée, sortie ou changement de salon vocal. */
export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  const guild = newState.guild;
  if (!isAllowedGuild(guild.id) || !newState.member || newState.member.user.bot) return;

  const wasCounted = isCountedChannel(guild, oldState.channelId);
  const isCounted = isCountedChannel(guild, newState.channelId);
  if (wasCounted === isCounted && (!isCounted || oldState.channelId === newState.channelId)) return;

  const member = await ensureMember(newState.member);
  const channelId = newState.channelId;
  if (wasCounted && !isCounted) await creditVoiceTime(member.id, guild.id, new Date(), { close: true }, guild);
  else if (channelId !== null && !wasCounted) await startVoiceSession(member.id, channelId);
  else if (channelId !== null) await prisma.voiceSession.update({ where: { memberId: member.id }, data: { channelId } }).catch(() => startVoiceSession(member.id, channelId));
}

/** Pointage périodique : crédite les sessions en cours sans attendre la sortie. */
export async function tickVoiceSessions(guild: Guild) {
  const sessions = await prisma.voiceSession.findMany({ where: { member: { guildId: guild.id } }, include: { member: { select: { discordUserId: true } } } });
  const now = new Date();
  for (const session of sessions) {
    const state = guild.voiceStates.cache.get(session.member.discordUserId);
    const stillThere = state && isCountedChannel(guild, state.channelId);
    await creditVoiceTime(session.memberId, guild.id, now, { close: !stillThere }, guild);
  }
}

/**
 * Au démarrage : clôt les sessions dont le membre n'est plus en vocal (créditées jusqu'au dernier
 * pointage, pas jusqu'à maintenant) et ouvre une session pour chaque membre déjà présent.
 */
export async function reconcileVoiceSessions(guild: Guild) {
  const sessions = await prisma.voiceSession.findMany({ where: { member: { guildId: guild.id } }, include: { member: { select: { discordUserId: true } } } });
  let closed = 0;
  for (const session of sessions) {
    const state = guild.voiceStates.cache.get(session.member.discordUserId);
    if (!state || !isCountedChannel(guild, state.channelId)) {
      await creditVoiceTime(session.memberId, guild.id, session.lastTickAt, { close: true });
      closed++;
    }
  }
  let opened = 0;
  for (const state of guild.voiceStates.cache.values()) {
    if (!state.member || state.member.user.bot || !isCountedChannel(guild, state.channelId)) continue;
    const member = await ensureMember(state.member);
    const existing = await prisma.voiceSession.findUnique({ where: { memberId: member.id } });
    if (!existing) {
      await startVoiceSession(member.id, state.channelId);
      opened++;
    }
  }
  log.info(`Vocal : ${closed} session(s) clôturée(s), ${opened} reprise(s), ${sessions.length - closed} en cours.`);
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

export interface RankedMember {
  rank: number;
  discordUserId: string;
  displayName: string;
  xp: number;
  messageCount: number;
  voiceSeconds: number;
}

export const LEADERBOARD_PAGE_SIZE = 10;

export interface LeaderboardPage {
  entries: RankedMember[];
  page: number;
  pageCount: number;
  total: number;
}

/** Page du classement (page 1 = premiers). Une page hors bornes est ramenée dans les bornes. */
export async function getLeaderboardPage(guildId: string, page: number): Promise<LeaderboardPage> {
  const where = { guildId, leftAt: null };
  const total = await prisma.member.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.member.findMany({
    where,
    orderBy: [{ xp: 'desc' }, { messageCount: 'desc' }, { joinedAt: 'asc' }],
    skip: (current - 1) * LEADERBOARD_PAGE_SIZE,
    take: LEADERBOARD_PAGE_SIZE,
    select: { discordUserId: true, displayName: true, xp: true, messageCount: true, voiceSeconds: true },
  });
  return { entries: rows.map((r, i) => ({ rank: (current - 1) * LEADERBOARD_PAGE_SIZE + i + 1, ...r })), page: current, pageCount, total };
}

/** Rang d'un membre : 1 + nombre de membres présents ayant strictement plus d'XP. */
export async function getRank(guildId: string, xp: number): Promise<number> {
  return 1 + (await prisma.member.count({ where: { guildId, leftAt: null, xp: { gt: xp } } }));
}

export function formatVoiceDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
