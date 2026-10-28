import { channelMention, ChannelType, MessageFlags, roleMention, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import { ensureNotifyRoles, NotifyError, publishPages, publishWelcome, setWelcomeBanner } from './notify.service.js';
import { NOTIFY_ROLES } from './notify.view.js';

import { botName } from '../../core/identity.js';
export function buildWelcomeAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('accueil')
    .setDescription('Page d’accueil et rôles de notification')
    .addSubcommand((sub) =>
      sub
        .setName('installer')
        .setDescription('Crée les rôles manquants et publie la page d’accueil, et celle des notifications')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon de la page d’accueil').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addChannelOption((o) => o.setName('salon_notifications').setDescription('Salon du menu des notifications (sinon : dans la page d’accueil)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription(`Utilise des rôles existants au lieu de ceux créés par ${botName()}`)
        .addRoleOption((o) => o.setName('calin').setDescription('Rôle « câlins collectifs »'))
        .addRoleOption((o) => o.setName('tombola').setDescription('Rôle « tombola »'))
        .addRoleOption((o) => o.setName('duel').setDescription('Rôle « duels »')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('banniere')
        .setDescription('Image en haut de la page d’accueil (sans image : retour à la bannière du bot)')
        .addAttachmentOption((o) => o.setName('image').setDescription('PNG, JPG, GIF ou WebP, 8 Mo max')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('texte')
        .setDescription('Texte d’introduction de la page (sans texte : celui par défaut)')
        .addStringOption((o) => o.setName('texte').setDescription('Texte (\\n pour un retour à la ligne)').setMaxLength(1500)),
    )
    .addSubcommand((sub) => sub.setName('publier').setDescription('Republie ou met à jour la page d’accueil'))
    .addSubcommand((sub) => sub.setName('etat').setDescription('Salon et rôles configurés'));
}

export async function handleWelcomeAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  // Publier une page peut dépasser les 3 s accordées par Discord (envoi de la bannière) : on diffère toujours.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = (content: string) => interaction.editReply(content);
  try {
    if (sub === 'installer') {
      const channel = interaction.options.getChannel('salon', true);
      const notifyChannel = interaction.options.getChannel('salon_notifications');
      await updateSettings(guildId, { welcomeChannelId: channel.id, ...(notifyChannel ? { notifyChannelId: notifyChannel.id } : {}) });
      await ensureNotifyRoles(interaction.guild);
      const outcome = await publishPages(interaction.guild);
      await reply(`${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}.\n${describeWelcome(await getSettings(guildId))}`);
      return;
    }
    if (sub === 'roles') {
      const changes: Record<string, string> = {};
      for (const [opt, field] of [['calin', 'notifyHugRoleId'], ['tombola', 'notifyLotteryRoleId'], ['duel', 'notifyDuelRoleId']] as const) {
        const role = interaction.options.getRole(opt);
        if (!role) continue;
        const problem = roleAssignabilityProblem(interaction.guild, role.id);
        if (problem) return void (await reply(`${roleMention(role.id)} : ${problem}`));
        changes[field] = role.id;
      }
      if (!Object.keys(changes).length) return void (await reply('Indique au moins un rôle.'));
      const s = await updateSettings(guildId, changes);
      await publishPages(interaction.guild).catch(() => undefined);
      await reply(describeWelcome(s));
      return;
    }
    if (sub === 'banniere') {
      const image = interaction.options.getAttachment('image');
      await setWelcomeBanner(guildId, image ? { url: image.url, contentType: image.contentType, size: image.size } : null);
      const s = await getSettings(guildId);
      const outcome = s.welcomeChannelId ? ` Page ${await publishWelcome(interaction.guild)}.` : '';
      await interaction.editReply(image ? `Bannière enregistrée.${outcome}` : `Bannière personnalisée retirée : la page reprend la bannière du bot.${outcome}`);
      return;
    }
    if (sub === 'texte') {
      const text = interaction.options.getString('texte')?.trim() || null;
      const s = await updateSettings(guildId, { welcomeText: text });
      const outcome = s.welcomeChannelId ? ` Page ${await publishWelcome(interaction.guild)}.` : '';
      await reply(text ? `Texte d’introduction enregistré.${outcome}` : `Texte par défaut rétabli.${outcome}`);
      return;
    }
    if (sub === 'publier') {
      const outcome = await publishPages(interaction.guild);
      await reply(`${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}.`);
      return;
    }
    await reply(describeWelcome(await getSettings(guildId)));
  } catch (err) {
    if (err instanceof NotifyError) return void (await reply(err.message));
    throw err;
  }
}

export function describeWelcome(s: Awaited<ReturnType<typeof getSettings>>): string {
  return [
    `**Salon d’accueil :** ${s.welcomeChannelId ? channelMention(s.welcomeChannelId) : '*aucun*'}` + (s.welcomeBanner ? ' · bannière personnalisée' : ' · bannière du bot') + (s.welcomeText ? ' · texte personnalisé' : ''),
    `**Salon des notifications :** ${s.notifyChannelId ? channelMention(s.notifyChannelId) : '*le menu est dans la page d’accueil*'}`,
    ...NOTIFY_ROLES.map((r) => `**${r.emoji} ${r.label} :** ${s[r.field] ? roleMention(s[r.field]!) : '*non configuré*'}`),
  ].join('\n');
}
