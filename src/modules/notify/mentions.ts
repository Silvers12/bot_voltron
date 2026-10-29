import { prisma } from '../../infrastructure/prisma.js';

/** Mentions personnelles : chaque membre peut refuser d'être mentionné pour chacune d'elles (page des notifications). */
export type MentionKey = 'calins' | 'piques' | 'vol' | 'defi' | 'niveau' | 'succes' | 'gains' | 'comptage';

export const MENTIONS: Array<{ key: MentionKey; label: string; emoji: string; description: string }> = [
  { key: 'calins', label: 'Câlins et cadeaux', emoji: '🤗', description: 'quand on t’offre des cœurs ou un objet' },
  { key: 'piques', label: 'Compliments et insultes', emoji: '💐', description: 'quand on t’en adresse un' },
  { key: 'vol', label: 'Tentatives de vol', emoji: '🥷', description: 'quand on essaie de te voler' },
  { key: 'defi', label: 'Défis en duel', emoji: '⚔️', description: 'quand on te défie' },
  { key: 'niveau', label: 'Montées de niveau', emoji: '🎉', description: 'annonce de ton nouveau niveau' },
  { key: 'succes', label: 'Succès débloqués', emoji: '🏅', description: 'annonce de tes succès' },
  { key: 'gains', label: 'Gros gains', emoji: '🏆', description: 'tirage de tombola gagné, jackpot' },
  { key: 'comptage', label: 'Salon de comptage', emoji: '🔢', description: 'surprises, erreurs, prison' },
];

export const MENTION_KEYS = MENTIONS.map((m) => m.key);

/**
 * Identifiants Discord à mentionner réellement pour une notification : ceux des membres
 * qui n'ont pas refusé cette mention. Le texte garde la mention, seule la notification est coupée.
 */
export async function allowedUsers(guildId: string, key: MentionKey, ...discordIds: string[]): Promise<string[]> {
  if (discordIds.length === 0) return [];
  const muted = await prisma.member.findMany({ where: { guildId, discordUserId: { in: discordIds }, mutedMentions: { has: key } }, select: { discordUserId: true } });
  const mutedIds = new Set(muted.map((m) => m.discordUserId));
  return discordIds.filter((id) => !mutedIds.has(id));
}

/** Enregistre l'ensemble des mentions gardées : tout le reste est refusé. */
export async function setKeptMentions(memberId: string, kept: MentionKey[]): Promise<{ kept: MentionKey[]; muted: MentionKey[] }> {
  const muted = MENTION_KEYS.filter((k) => !kept.includes(k));
  await prisma.member.update({ where: { id: memberId }, data: { mutedMentions: muted } });
  return { kept: MENTION_KEYS.filter((k) => kept.includes(k)), muted };
}
