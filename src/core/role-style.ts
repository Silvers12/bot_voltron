import type { Guild, Role } from 'discord.js';
import { createLogger } from './logger.js';

const log = createLogger('rôles');

export interface RoleStyle {
  /** Nom sans emoji (sert aussi à retrouver un rôle créé avant la mise en forme). */
  name: string;
  emoji: string;
  color: number;
}

export const styledName = (s: RoleStyle) => `${s.emoji} ${s.name}`;

/**
 * Crée un rôle mis en forme : emoji dans le nom, couleur, et icône emoji si le serveur le permet
 * (icônes de rôle réservées aux serveurs boostés niveau 2 : l'échec est silencieux).
 */
export async function createStyledRole(guild: Guild, style: RoleStyle, { mentionable = false, reason = '' } = {}): Promise<Role> {
  const role = await guild.roles.create({ name: styledName(style), color: style.color, mentionable, permissions: [], reason });
  await applyIcon(role, style);
  return role;
}

/** Rôle existant créé sous l'ancien nom sans emoji ou sans couleur : on le met en forme sans toucher à un rôle renommé par l'intendance. */
export async function restyleRole(role: Role, style: RoleStyle): Promise<void> {
  const data: { name?: string; color?: number } = {};
  if (role.name === style.name) data.name = styledName(style);
  if (role.color === 0) data.color = style.color;
  if (Object.keys(data).length) await role.edit(data).catch((err) => log.warn(`Mise en forme du rôle ${role.name} impossible`, err));
  if (!role.unicodeEmoji && !role.icon) await applyIcon(role, style);
}

async function applyIcon(role: Role, style: RoleStyle): Promise<void> {
  await role.setUnicodeEmoji(style.emoji).catch(() => undefined);
}
