import { PermissionFlagsBits, type Guild, type GuildMember, type GuildTextBasedChannel, type VoiceState } from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { isAllowedGuild } from '../../core/config.js';
import { getSettings } from '../settings/settings.service.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { GuildPlayer } from './player.js';
import { updateYtdlp, ytdlpVersion } from './ytdlp.js';

const log = createLogger('musique');
const players = new Map<string, GuildPlayer>();

export function getPlayer(guildId: string): GuildPlayer | undefined {
  const p = players.get(guildId);
  return p && p.connected ? p : undefined;
}

/** Lecteur du serveur, créé au besoin ; le salon texte suit la dernière commande. */
export function ensurePlayer(guild: Guild, textChannel: GuildTextBasedChannel): GuildPlayer {
  let p = players.get(guild.id);
  if (!p || !p.connected) {
    p = new GuildPlayer(guild, textChannel, () => { if (players.get(guild.id) === p) players.delete(guild.id); });
    players.set(guild.id, p);
  } else p.textChannel = textChannel;
  return p;
}

export function anyPlaying(): boolean {
  return [...players.values()].some((p) => p.playing);
}

/** Rôle DJ : tout le monde si aucun rôle n'est réglé ; les administrateurs passent toujours. */
export function canDj(member: GuildMember, s: Pick<GuildSettings, 'djRoleId'>): boolean {
  if (!s.djRoleId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(s.djRoleId);
}

export function isMusicChannelAllowed(s: Pick<GuildSettings, 'musicChannelIds' | 'commandChannelIds'>, channelId: string | null): boolean {
  if (s.musicChannelIds.length) return channelId !== null && s.musicChannelIds.includes(channelId);
  return s.commandChannelIds.length === 0 || (channelId !== null && s.commandChannelIds.includes(channelId));
}

/** Le bot est expulsé du vocal, ou plus aucun humain ne l'écoute : on arrête. */
export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild;
  if (!isAllowedGuild(guild.id)) return;
  const p = players.get(guild.id);
  if (!p) return;
  const me = guild.client.user.id;
  if (newState.id === me) {
    if (newState.channelId === null) await p.stop();
    return;
  }
  const channelId = p.voiceChannelId;
  if (!channelId || (oldState.channelId !== channelId && newState.channelId !== channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isVoiceBased()) return;
  if (channel.members.some((m) => !m.user.bot)) return;
  await p.textChannel.send({ content: '👋 Plus personne dans le vocal, je me déconnecte.' }).catch(() => undefined);
  await p.stop();
}

/** Mise à jour nocturne de yt-dlp (vers 5 h), reportée tant que quelque chose est en lecture. */
export function scheduleYtdlpUpdates(): void {
  let lastDay = -1;
  setInterval(() => {
    const now = new Date();
    if (now.getHours() !== 5 || lastDay === now.getDate() || anyPlaying()) return;
    lastDay = now.getDate();
    void updateYtdlp().then((out) => log.info(`yt-dlp : ${out || 'à jour'}`));
  }, 10 * 60_000);
  void ytdlpVersion().then((v) => log.info(v ? `yt-dlp ${v}` : 'yt-dlp introuvable : la musique ne fonctionnera pas'));
}

export { getSettings };
