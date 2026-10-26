import { ChannelType, PermissionFlagsBits, roleMention, type Guild, type GuildMember } from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { buildWelcomeMessage, NOTIFY_ROLES, roleIdFor, type NotifyKey } from './notify.view.js';
import type { GuildSettings } from '../../generated/prisma/client.js';

const log = createLogger('accueil');

export class NotifyError extends Error {}

/** Mention du rôle de notification (suivie d'une espace), ou chaîne vide s'il n'est pas configuré. */
export function notifyMention(s: GuildSettings, key: NotifyKey): string {
  const id = roleIdFor(s, key);
  return id ? `${roleMention(id)} ` : '';
}

/** Crée les rôles manquants (mentionnables, sans permission) et les enregistre. */
export async function ensureNotifyRoles(guild: Guild): Promise<GuildSettings> {
  let s = await getSettings(guild.id);
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new NotifyError('Le bot n’a pas la permission « Gérer les rôles ».');
  for (const r of NOTIFY_ROLES) {
    if (s[r.field] && guild.roles.cache.has(s[r.field]!)) continue;
    const role = await guild.roles.create({ name: r.roleName, mentionable: true, permissions: [], reason: 'Rôle de notification Voltron' });
    s = await updateSettings(guild.id, { [r.field]: role.id });
    log.info(`Rôle « ${role.name} » créé sur ${guild.name}`);
  }
  return s;
}

const MAX_BANNER_BYTES = 8 * 1024 * 1024;

/** Télécharge et enregistre la bannière (image, 8 Mo max) ; `null` la retire. */
export async function setWelcomeBanner(guildId: string, attachment: { url: string; contentType: string | null; size: number } | null): Promise<void> {
  if (!attachment) { await updateSettings(guildId, { welcomeBanner: null, welcomeBannerType: null }); return; }
  if (!attachment.contentType?.startsWith('image/')) throw new NotifyError('Le fichier doit être une image (PNG, JPG, GIF ou WebP).');
  if (attachment.size > MAX_BANNER_BYTES) throw new NotifyError('Image trop lourde : 8 Mo maximum.');
  const res = await fetch(attachment.url);
  if (!res.ok) throw new NotifyError('Téléchargement de l’image impossible.');
  const bytes = Buffer.from(await res.arrayBuffer());
  await updateSettings(guildId, { welcomeBanner: bytes, welcomeBannerType: attachment.contentType });
}

/** Prend ou retire le rôle ; retourne true s'il est désormais porté. */
export async function toggleNotifyRole(member: GuildMember, key: NotifyKey): Promise<boolean> {
  const s = await getSettings(member.guild.id);
  const roleId = roleIdFor(s, key);
  if (!roleId) throw new NotifyError('Ce rôle n’est pas configuré.');
  const problem = roleAssignabilityProblem(member.guild, roleId);
  if (problem) throw new NotifyError(problem);
  if (member.roles.cache.has(roleId)) { await member.roles.remove(roleId, 'Notification retirée'); return false; }
  await member.roles.add(roleId, 'Notification choisie');
  return true;
}

/** Publie ou met à jour la page d'accueil dans le salon configuré, et l'épingle si possible. */
export async function publishWelcome(guild: Guild): Promise<string> {
  const s = await getSettings(guild.id);
  if (!s.welcomeChannelId) throw new NotifyError('Aucun salon d’accueil configuré.');
  const channel = guild.channels.cache.get(s.welcomeChannelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) throw new NotifyError('Le salon d’accueil n’existe plus ou n’est pas textuel.');
  const perms = channel.permissionsFor(guild.members.me!);
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) throw new NotifyError('Le bot ne peut pas écrire dans le salon d’accueil.');

  const payload = buildWelcomeMessage(s, guild.name);
  const existing = s.welcomeMessageId ? await channel.messages.fetch(s.welcomeMessageId).catch(() => null) : null;
  if (existing) { await existing.edit({ ...payload, attachments: [] }); return 'mise à jour'; } // attachments: [] remplace l'ancienne bannière
  const message = await channel.send(payload);
  if (perms.has(PermissionFlagsBits.ManageMessages)) await message.pin().catch(() => undefined);
  await updateSettings(guild.id, { welcomeMessageId: message.id });
  return 'publiée';
}
