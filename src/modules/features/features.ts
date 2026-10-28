import type { GuildSettings } from '../../generated/prisma/client.js';
import { getSettings, updateDisabledFeatures } from '../settings/settings.service.js';

/** Clés des fonctionnalités que l'intendance peut couper. */
export type FeatureKey =
  | 'quotidien' | 'hebdo' | 'calin' | 'boutique' | 'xp'
  | 'compliments' | 'insultes' | 'blackjack' | 'machine' | 'duel'
  | 'calin_collectif' | 'tombola' | 'succes' | 'comptage' | 'taux' | 'vol' | 'des';

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  emoji: string;
  description: string;
}

export const FEATURES: FeatureInfo[] = [
  { key: 'quotidien', label: 'Récompense du jour', emoji: '🌅', description: 'Bouton quotidien du profil' },
  { key: 'hebdo', label: 'Récompense de la semaine', emoji: '🗓️', description: '/hebdo et bouton du profil' },
  { key: 'calin', label: 'Câlins (dons)', emoji: '🤗', description: '/calin entre membres' },
  { key: 'boutique', label: 'Boutique', emoji: '🛒', description: 'Boutique et inventaire du profil' },
  { key: 'xp', label: 'XP et classement', emoji: '⭐', description: 'Gain d’XP et /classement' },
  { key: 'compliments', label: 'Compliments', emoji: '💐', description: '/compliment' },
  { key: 'insultes', label: 'Insultes', emoji: '🧦', description: '/insulte' },
  { key: 'blackjack', label: 'Blackjack', emoji: '🃏', description: '/blackjack' },
  { key: 'machine', label: 'Machine à sous', emoji: '🎰', description: '/machine et bouton Lancer' },
  { key: 'duel', label: 'Duels', emoji: '⚔️', description: '/duel' },
  { key: 'vol', label: 'Vol de cœurs', emoji: '🥷', description: '/vol : tentative de larcin sur un membre' },
  { key: 'calin_collectif', label: 'Câlin collectif', emoji: '🫂', description: 'Apparitions automatiques de Voltron' },
  { key: 'tombola', label: 'Tombola', emoji: '🎟️', description: '/tombola, rappels et tirages' },
  { key: 'succes', label: 'Succès et badges', emoji: '🏅', description: 'Déblocages, annonces et /succes' },
  { key: 'comptage', label: 'Salon de comptage', emoji: '🔢', description: 'Compter à la suite, amende en cas d’erreur' },
  { key: 'taux', label: 'Taux du jour', emoji: '🧸', description: '/taux et /duo : chance, choupitude, amour…' },
  { key: 'des', label: 'Dé et pile ou face', emoji: '🎲', description: '/de et /pileouface' },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export function featureInfo(key: FeatureKey): FeatureInfo {
  return FEATURES.find((f) => f.key === key)!;
}

export function isFeatureEnabled(settings: Pick<GuildSettings, 'disabledFeatures'>, key: FeatureKey): boolean {
  return !settings.disabledFeatures.includes(key);
}

export async function isFeatureEnabledFor(guildId: string, key: FeatureKey): Promise<boolean> {
  return isFeatureEnabled(await getSettings(guildId), key);
}

/** Remplace l'ensemble des fonctionnalités actives. Les clés inconnues sont ignorées. */
export async function setEnabledFeatures(guildId: string, enabled: string[]): Promise<GuildSettings> {
  const disabled = FEATURE_KEYS.filter((k) => !enabled.includes(k));
  return updateDisabledFeatures(guildId, disabled);
}

export async function setFeatureEnabled(guildId: string, key: FeatureKey, enabled: boolean): Promise<GuildSettings> {
  const s = await getSettings(guildId);
  const disabled = new Set(s.disabledFeatures);
  if (enabled) disabled.delete(key); else disabled.add(key);
  return updateDisabledFeatures(guildId, [...disabled]);
}

const COMMAND_FEATURES: Record<string, FeatureKey> = {
  calin: 'calin', don: 'boutique', hebdo: 'hebdo', classement: 'xp', compliment: 'compliments', insulte: 'insultes',
  blackjack: 'blackjack', machine: 'machine', duel: 'duel', vol: 'vol', tombola: 'tombola', succes: 'succes', taux: 'taux', duo: 'taux', de: 'des', pileouface: 'des',
};

/** Préfixes de customId des composants gardés. Les câlins collectifs déjà lancés restent cliquables. */
const COMPONENT_FEATURES: Array<[prefix: string, key: FeatureKey]> = [
  ['profil:daily', 'quotidien'], ['profil:weekly', 'hebdo'], ['shop:', 'boutique'], ['lb:', 'xp'],
  ['bj:', 'blackjack'], ['slots:', 'machine'], ['duel:', 'duel'], ['lottery:', 'tombola'], ['profil:achievements', 'succes'],
];

export function featureForCommand(name: string): FeatureKey | undefined {
  return COMMAND_FEATURES[name];
}

export function featureForComponent(customId: string): FeatureKey | undefined {
  return COMPONENT_FEATURES.find(([prefix]) => customId.startsWith(prefix))?.[1];
}

export const DISABLED_MESSAGE = 'Cette fonctionnalité est en pause pour le moment. Voltron fait la sieste dessus.';
