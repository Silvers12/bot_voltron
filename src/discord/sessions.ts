import type { RepliableInteraction } from 'discord.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('sessions');

interface Session {
  /** Dernière interaction liée au panneau : sert à supprimer ou modifier le message. */
  interaction: RepliableInteraction;
  timer: NodeJS.Timeout;
  /**
   * Appelé à l'expiration à la place de la suppression. Reçoit la dernière interaction
   * (jeton valable 15 min) pour modifier le message en conséquence.
   */
  onExpire?: (interaction: RepliableInteraction) => Promise<void>;
}

/** Sessions de panneau ouvertes, par clé (ex. `profil:<userId>`). */
const sessions = new Map<string, Session>();

async function deletePanel(session: Session) {
  await session.interaction.deleteReply().catch(() => {
    /* déjà supprimé ou jeton expiré : rien à faire */
  });
}

/** Ferme la session existante (supprime son message) s'il y en a une. */
export async function closeSession(key: string) {
  const existing = sessions.get(key);
  if (!existing) return;
  sessions.delete(key);
  clearTimeout(existing.timer);
  await deletePanel(existing);
  log.debug(`Session fermée : ${key}`);
}

/** Ouvre une session : ferme l'ancienne, puis programme la fermeture automatique après `ttlMs` d'inactivité. */
export async function openSession(
  key: string,
  interaction: RepliableInteraction,
  ttlMs: number,
  onExpire?: (interaction: RepliableInteraction) => Promise<void>,
) {
  await closeSession(key);
  const timer = setTimeout(() => void expire(key), ttlMs);
  sessions.set(key, { interaction, timer, onExpire });
}

/** Signale une activité : met à jour l'interaction de référence et repousse l'expiration. */
export function touchSession(key: string, interaction: RepliableInteraction, ttlMs: number, onExpire?: Session['onExpire']) {
  const existing = sessions.get(key);
  if (!existing) {
    // Panneau ouvert avant un redémarrage : on le reprend en main, avec son rappel d'expiration.
    sessions.set(key, { interaction, timer: setTimeout(() => void expire(key), ttlMs), onExpire });
    return;
  }
  clearTimeout(existing.timer);
  existing.interaction = interaction;
  existing.timer = setTimeout(() => void expire(key), ttlMs);
}

/** Oublie une session sans toucher à son message (le panneau reste affiché tel quel). */
export function forgetSession(key: string) {
  const existing = sessions.get(key);
  if (!existing) return;
  sessions.delete(key);
  clearTimeout(existing.timer);
}

async function expire(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  if (session.onExpire) {
    await session.onExpire(session.interaction).catch((err) => log.error(`Rappel d'expiration échoué : ${key}`, err));
  } else {
    await deletePanel(session);
  }
  log.debug(`Session expirée : ${key}`);
}
