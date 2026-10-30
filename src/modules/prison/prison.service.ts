import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { botName } from '../../core/identity.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { createStyledRole, restyleRole, styledName } from '../../core/role-style.js';
import type { FeatureKey } from '../features/features.js';
import type { GuildSettings, Member } from '../../generated/prisma/client.js';

const log = createLogger('prison');

export const PRISON_ROLE_NAME = 'Prison';
const PRISON_STYLE = { name: PRISON_ROLE_NAME, emoji: '🔒', color: 0x546e7a };

/** Fonctionnalités interdites pendant une peine : tous les jeux. */
const GAME_FEATURES = new Set<FeatureKey>(['blackjack', 'machine', 'duel', 'vol', 'des', 'taux', 'tombola', 'comptage']);

export function isGameFeature(feature: FeatureKey | undefined): boolean {
  return feature !== undefined && GAME_FEATURES.has(feature);
}

/** Temps de peine restant en millisecondes (0 = libre). */
export function prisonRemainingMs(member: Pick<Member, 'prisonUntil'>, now = Date.now()): number {
  return member.prisonUntil ? Math.max(0, member.prisonUntil.getTime() - now) : 0;
}

export function isImprisoned(member: Pick<Member, 'prisonUntil'>): boolean {
  return prisonRemainingMs(member) > 0;
}

export function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m.toString().padStart(2, '0')}` : `${h} h`;
}

export function prisonMessage(member: Pick<Member, 'prisonUntil'>): string {
  return `🔒 Tu es en prison : plus de jeux pendant encore **${formatRemaining(prisonRemainingMs(member))}**. ${botName()} t’apportera une orange.`;
}

/** Rôle Prison du serveur, créé s'il manque (le bot doit pouvoir gérer les rôles). Retourne null si impossible. */
export async function ensurePrisonRole(guild: Guild, s: GuildSettings): Promise<string | null> {
  const known = s.prisonRoleId ? guild.roles.cache.get(s.prisonRoleId) : undefined;
  if (known) { await restyleRole(known, PRISON_STYLE); return known.id; }
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    log.warn(`${guild.name} : impossible de créer le rôle Prison, permission « Gérer les rôles » manquante`);
    return null;
  }
  const existing = guild.roles.cache.find((r) => (r.name === PRISON_ROLE_NAME || r.name === styledName(PRISON_STYLE)) && !r.managed && r.position < me.roles.highest.position);
  if (existing) await restyleRole(existing, PRISON_STYLE);
  const role = existing ?? await createStyledRole(guild, PRISON_STYLE, { reason: `Rôle de prison ${botName()}` });
  await updateSettings(guild.id, { prisonRoleId: role.id });
  log.info(`${guild.name} : rôle Prison ${existing ? 'retrouvé' : 'créé'} (${role.id})`);
  return role.id;
}

/** Envoie un membre en prison pour la durée réglée ; une peine déjà en cours repart de zéro. */
export async function imprison(guildMember: GuildMember, member: Member, reason: string, minutes?: number): Promise<{ until: Date; roleGiven: boolean }> {
  const s = await getSettings(guildMember.guild.id);
  const until = new Date(Date.now() + Math.max(1, minutes ?? s.prisonMinutes) * 60_000);
  await prisma.member.update({ where: { id: member.id }, data: { prisonUntil: until } });
  const roleId = await ensurePrisonRole(guildMember.guild, s);
  let roleGiven = false;
  if (roleId) {
    try { await guildMember.roles.add(roleId, reason); roleGiven = true; }
    catch (err) { log.warn(`Rôle Prison impossible à donner à ${guildMember.id}`, err); }
  }
  log.info(`${guildMember.id} en prison jusqu'à ${until.toISOString()} : ${reason}`);
  return { until, roleGiven };
}

/** Libère un membre : date effacée et rôle retiré. */
export async function release(guildMember: GuildMember, member: Pick<Member, 'id'> | null): Promise<void> {
  if (member) await prisma.member.update({ where: { id: member.id }, data: { prisonUntil: null } });
  const s = await getSettings(guildMember.guild.id);
  if (s.prisonRoleId && guildMember.roles.cache.has(s.prisonRoleId)) await guildMember.roles.remove(s.prisonRoleId, 'Libéré').catch((err) => log.warn(`Rôle Prison impossible à retirer à ${guildMember.id}`, err));
  log.info(`${guildMember.id} libéré`);
}

/** Rôle Prison retiré à la main par un admin : la peine s'arrête aussi. */
export async function onRolesChanged(before: GuildMember, after: GuildMember): Promise<void> {
  if (!config.discord.guildIds.includes(after.guild.id)) return;
  const s = await getSettings(after.guild.id);
  if (!s.prisonRoleId || !before.roles.cache.has(s.prisonRoleId) || after.roles.cache.has(s.prisonRoleId)) return;
  const { count } = await prisma.member.updateMany({ where: { guildId: after.guild.id, discordUserId: after.id, prisonUntil: { gt: new Date() } }, data: { prisonUntil: null } });
  if (count > 0) log.info(`${after.id} libéré (rôle retiré à la main)`);
}

/** Libère les membres dont la peine est finie : retire le rôle et efface la date. */
export async function releaseDue(client: Client): Promise<void> {
  const due = await prisma.member.findMany({ where: { prisonUntil: { lte: new Date() } } });
  for (const m of due) {
    await prisma.member.update({ where: { id: m.id }, data: { prisonUntil: null } });
    if (!config.discord.guildIds.includes(m.guildId)) continue;
    const guild = client.guilds.cache.get(m.guildId);
    const s = guild ? await getSettings(m.guildId) : null;
    if (!guild || !s?.prisonRoleId) continue;
    const gm = await guild.members.fetch(m.discordUserId).catch(() => null);
    if (gm?.roles.cache.has(s.prisonRoleId)) await gm.roles.remove(s.prisonRoleId, 'Peine purgée').catch((err) => log.warn(`Rôle Prison impossible à retirer à ${m.discordUserId}`, err));
    log.info(`${m.discordUserId} libéré`);
  }
}
