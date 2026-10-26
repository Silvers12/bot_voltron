import { EmbedBuilder, roleMention, userMention, type Guild } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import type { GuildSettings, LevelRole } from '../../generated/prisma/client.js';
import { getSettings } from '../settings/settings.service.js';

const log = createLogger('levels');

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpForNext(level: number, s: Pick<GuildSettings, 'levelBaseXp' | 'levelStepXp'>): number {
  return s.levelBaseXp + s.levelStepXp * level;
}

/** XP cumulée requise pour atteindre `level`. */
export function xpToReach(level: number, s: Pick<GuildSettings, 'levelBaseXp' | 'levelStepXp'>): number {
  // Somme de base + pas×k pour k de 0 à level-1
  return s.levelBaseXp * level + (s.levelStepXp * level * (level - 1)) / 2;
}

/** Niveau atteint pour une XP donnée (courbe croissante, déterministe). */
export function levelForXp(xp: number, s: Pick<GuildSettings, 'levelBaseXp' | 'levelStepXp'>): number {
  let level = 0;
  while (xp >= xpToReach(level + 1, s)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulée dans le niveau courant et XP totale du niveau */
  current: number;
  needed: number;
}

export function progressFor(xp: number, s: Pick<GuildSettings, 'levelBaseXp' | 'levelStepXp'>): LevelProgress {
  const level = levelForXp(xp, s);
  return { level, current: xp - xpToReach(level, s), needed: xpForNext(level, s) };
}

export function listLevelRoles(guildId: string): Promise<LevelRole[]> {
  return prisma.levelRole.findMany({ where: { guildId }, orderBy: { level: 'asc' } });
}

/** Applique le palier : ajoute le rôle du plus haut palier atteint, retire les autres paliers. */
async function applyTierRoles(guild: Guild, discordUserId: string, level: number, tiers: LevelRole[]): Promise<LevelRole | null> {
  if (!tiers.length) return null;
  const member = await guild.members.fetch(discordUserId).catch(() => null);
  if (!member) return null;
  const reached = tiers.filter((t) => t.level <= level);
  const target = reached.at(-1) ?? null;

  for (const tier of tiers) {
    const should = target !== null && tier.id === target.id;
    const has = member.roles.cache.has(tier.roleId);
    if (should === has) continue;
    if (roleAssignabilityProblem(guild, tier.roleId)) {
      log.warn(`Rôle de palier ${tier.roleId} non attribuable sur ${guild.name}`);
      continue;
    }
    try {
      if (should) await member.roles.add(tier.roleId, `Niveau ${level}`);
      else await member.roles.remove(tier.roleId, `Niveau ${level}`);
    } catch (err) {
      log.warn(`Modification du rôle ${tier.roleId} échouée pour ${discordUserId}`, err);
    }
  }
  return target;
}

async function announce(guild: Guild, s: GuildSettings, discordUserId: string, level: number, tier: LevelRole | null, gainedTier: boolean) {
  if (!s.levelUpChannelId) return;
  const channel = guild.channels.cache.get(s.levelUpChannelId);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setDescription(
      `🎉 ${userMention(discordUserId)} atteint le **niveau ${level}** !` +
        (gainedTier && tier ? `\nVoltron lui remet le rôle ${roleMention(tier.roleId)}. Par mon bouclier, quelle ascension !` : ''),
    );
  await channel.send({ embeds: [embed], allowedMentions: { users: [discordUserId] } }).catch((err) => log.warn('Annonce de niveau impossible', err));
}

/**
 * Recalcule le niveau d'un membre à partir de son XP. En cas de montée : met à jour le niveau,
 * applique les rôles de palier et annonce. Sans montée, ne fait rien (appel bon marché).
 */
export async function syncLevel(guild: Guild, memberId: string, { announceLevelUp = true } = {}) {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { xp: true, level: true, discordUserId: true } });
  if (!member) return;
  const s = await getSettings(guild.id);
  const level = levelForXp(member.xp, s);
  if (level === member.level) return;

  // Mise à jour conditionnelle : deux gains simultanés n'annoncent qu'une fois.
  const { count } = await prisma.member.updateMany({ where: { id: memberId, level: member.level }, data: { level } });
  if (count === 0) return;

  const tiers = await listLevelRoles(guild.id);
  const previousTier = tiers.filter((t) => t.level <= member.level).at(-1) ?? null;
  const tier = await applyTierRoles(guild, member.discordUserId, level, tiers);
  if (level > member.level) {
    log.info(`${member.discordUserId} passe niveau ${level} sur ${guild.name}`);
    if (announceLevelUp) await announce(guild, s, member.discordUserId, level, tier, tier !== null && tier.id !== previousTier?.id);
  }
}

/** Recalcule niveaux et rôles de tous les membres présents (après ajout d'un palier ou changement de courbe). */
export async function resyncAllLevels(guild: Guild): Promise<number> {
  const members = await prisma.member.findMany({ where: { guildId: guild.id, leftAt: null }, select: { id: true, xp: true, discordUserId: true } });
  const s = await getSettings(guild.id);
  const tiers = await listLevelRoles(guild.id);
  for (const m of members) {
    const level = levelForXp(m.xp, s);
    await prisma.member.update({ where: { id: m.id }, data: { level } });
    await applyTierRoles(guild, m.discordUserId, level, tiers);
  }
  return members.length;
}
