import { channelMention, ChannelType, MessageFlags, roleMention, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import { ensureNotifyRoles, NotifyError, publishWelcome } from './notify.service.js';
import { NOTIFY_ROLES } from './notify.view.js';

export function buildWelcomeAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('accueil')
    .setDescription('Page d’accueil et rôles de notification')
    .addSubcommand((sub) =>
      sub
        .setName('installer')
        .setDescription('Crée les rôles manquants et publie la page d’accueil dans un salon')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon de la page d’accueil').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Utilise des rôles existants au lieu de ceux créés par Voltron')
        .addRoleOption((o) => o.setName('calin').setDescription('Rôle « câlins collectifs »'))
        .addRoleOption((o) => o.setName('tombola').setDescription('Rôle « tombola »'))
        .addRoleOption((o) => o.setName('duel').setDescription('Rôle « duels »')),
    )
    .addSubcommand((sub) => sub.setName('publier').setDescription('Republie ou met à jour la page d’accueil'))
    .addSubcommand((sub) => sub.setName('etat').setDescription('Salon et rôles configurés'));
}

export async function handleWelcomeAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  try {
    if (sub === 'installer') {
      const channel = interaction.options.getChannel('salon', true);
      await updateSettings(guildId, { welcomeChannelId: channel.id });
      await ensureNotifyRoles(interaction.guild);
      const outcome = await publishWelcome(interaction.guild);
      await reply(`Page d’accueil ${outcome} dans ${channelMention(channel.id)}.\n${describeWelcome(await getSettings(guildId))}`);
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
      if (s.welcomeChannelId) await publishWelcome(interaction.guild).catch(() => undefined);
      await reply(describeWelcome(s));
      return;
    }
    if (sub === 'publier') {
      const outcome = await publishWelcome(interaction.guild);
      await reply(`Page d’accueil ${outcome}.`);
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
    `**Salon d’accueil :** ${s.welcomeChannelId ? channelMention(s.welcomeChannelId) : '*aucun*'}`,
    ...NOTIFY_ROLES.map((r) => `**${r.emoji} ${r.label} :** ${s[r.field] ? roleMention(s[r.field]!) : '*non configuré*'}`),
  ].join('\n');
}
