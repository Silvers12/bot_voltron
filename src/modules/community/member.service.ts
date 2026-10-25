import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('members');

/** Crée le membre s'il n'existe pas, sinon met à jour ses infos Discord et sa dernière activité. */
export async function ensureMember(member: GuildMember) {
  return prisma.member.upsert({
    where: { guildId_discordUserId: { guildId: member.guild.id, discordUserId: member.id } },
    create: {
      guildId: member.guild.id,
      discordUserId: member.id,
      username: member.user.username,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
    },
    update: {
      username: member.user.username,
      displayName: member.displayName,
      joinedAt: member.joinedAt ?? undefined,
      leftAt: null,
      lastSeenAt: new Date(),
    },
  });
}

/** Marque un membre comme parti ; son profil est conservé pour un éventuel retour. */
export async function markMemberLeft(member: GuildMember | PartialGuildMember) {
  await prisma.member.updateMany({
    where: { guildId: member.guild.id, discordUserId: member.id },
    data: { leftAt: new Date() },
  });
}

/**
 * Synchronise tous les membres humains du serveur au démarrage.
 * Nécessite l'intent privilégié « Server Members » activé dans le Developer Portal.
 */
export async function syncGuildMembers(guild: Guild) {
  let fetched;
  try {
    fetched = await guild.members.fetch();
  } catch (err) {
    log.warn("Impossible de lister les membres : activez « Server Members Intent » dans le Developer Portal.", err);
    return { created: 0, updated: 0 };
  }

  const humans = [...fetched.values()].filter((m) => !m.user.bot);
  const existing = new Set(
    (await prisma.member.findMany({ where: { guildId: guild.id }, select: { discordUserId: true } }))
      .map((m) => m.discordUserId),
  );

  let created = 0;
  let updated = 0;
  for (const member of humans) {
    await prisma.member.upsert({
      where: { guildId_discordUserId: { guildId: guild.id, discordUserId: member.id } },
      create: {
        guildId: guild.id,
        discordUserId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        joinedAt: member.joinedAt,
      },
      // Pas de mise à jour de lastSeenAt : la synchro n'est pas une activité du membre.
      update: {
        username: member.user.username,
        displayName: member.displayName,
        joinedAt: member.joinedAt ?? undefined,
        leftAt: null,
      },
    });
    existing.has(member.id) ? updated++ : created++;
  }

  // Membres en base mais plus sur le serveur
  const presentIds = new Set(humans.map((m) => m.id));
  const { count: left } = await prisma.member.updateMany({
    where: { guildId: guild.id, leftAt: null, discordUserId: { notIn: [...presentIds] } },
    data: { leftAt: new Date() },
  });

  log.info(`Synchronisation : ${created} créé(s), ${updated} mis à jour, ${left} marqué(s) parti(s).`);
  return { created, updated };
}
