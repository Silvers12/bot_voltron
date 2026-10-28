import { PermissionFlagsBits, type Guild } from 'discord.js';

import { botName } from './identity.js';
/** Vérifie que le bot peut attribuer ce rôle : permission, hiérarchie, rôle non géré par une intégration. */
export function roleAssignabilityProblem(guild: Guild, roleId: string): string | null {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role) return 'Ce rôle n’existe plus sur le serveur.';
  if (!me) return 'Le bot n’est pas chargé sur ce serveur.';
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'Le bot n’a pas la permission « Gérer les rôles ».';
  if (role.managed) return 'Ce rôle est géré par une intégration et ne peut pas être attribué.';
  if (role.position >= me.roles.highest.position) return `Ce rôle est placé au-dessus du rôle du bot : déplacez le rôle de ${botName()} plus haut dans la liste des rôles.`;
  return null;
}
