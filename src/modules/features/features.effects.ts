import type { Guild } from 'discord.js';
import type { FeatureKey } from './features.js';
import { reconcileVoiceSessions } from '../progression/xp.service.js';
import { scheduleNext } from '../events/grouphug.service.js';

/**
 * Effets de bord d'un changement d'état, communs au panneau et à `/admin fonction` :
 * reprise des sessions vocales à la réactivation de l'XP, replanification des câlins collectifs.
 */
export async function applyFeatureEffects(guild: Guild, changed: FeatureKey[], enabledNow: (k: FeatureKey) => boolean) {
  if (changed.includes('xp') && enabledNow('xp')) await reconcileVoiceSessions(guild);
  if (changed.includes('calin_collectif') && enabledNow('calin_collectif')) await scheduleNext(guild.id);
}
