import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { config } from './config.js';

/** Peut utiliser /admin : liste DISCORD_ADMIN_IDS si renseignée, sinon permission Administrateur. */
export function isBotAdmin(member: GuildMember): boolean {
  if (config.discord.adminIds.length > 0) return config.discord.adminIds.includes(member.id);
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
