import { channelMention, ChannelType, MessageFlags, time, TimestampStyles, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { formatAmount, getSettings, updateGroupHugSettings } from '../settings/settings.service.js';
import { getOpenHug, GroupHugError, launchHug, resolveHugChannel, scheduleNext } from './grouphug.service.js';

import { botName } from '../../core/identity.js';
export function buildGroupHugAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('calin')
    .setDescription(`Câlin collectif : apparitions de ${botName()}`)
    .addSubcommand((sub) =>
      sub
        .setName('ajouter-salon')
        .setDescription(`Ajoute un salon où ${botName()} peut apparaître`)
        .addChannelOption((o) => o.setName('salon').setDescription('Salon textuel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer-salon')
        .setDescription('Retire un salon de la liste')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('regler')
        .setDescription('Règle la récompense, la durée et l’intervalle entre apparitions')
        .addIntegerOption((o) => o.setName('recompense').setDescription('Cœurs par câlineur (× nombre de câlineurs)').setMinValue(0).setMaxValue(100000))
        .addIntegerOption((o) => o.setName('duree').setDescription('Durée du câlin en secondes').setMinValue(10).setMaxValue(3600))
        .addIntegerOption((o) => o.setName('intervalle_min').setDescription('Minutes minimum entre deux apparitions').setMinValue(1).setMaxValue(10080))
        .addIntegerOption((o) => o.setName('intervalle_max').setDescription('Minutes maximum entre deux apparitions').setMinValue(1).setMaxValue(10080)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lancer')
        .setDescription('Lance un câlin collectif maintenant')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (sinon tiré au hasard parmi la liste)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) => sub.setName('etat').setDescription('Affiche la configuration et la prochaine apparition'));
}

export async function handleGroupHugAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const s = await getSettings(guildId);

  if (sub === 'ajouter-salon') {
    const channel = interaction.options.getChannel('salon', true);
    const problem = resolveHugChannel(interaction.guild, channel.id);
    if (typeof problem === 'string') return void (await reply(`Impossible d’utiliser ${channelMention(channel.id)} : ${problem}`));
    if (s.groupHugChannelIds.includes(channel.id)) return void (await reply('Ce salon est déjà dans la liste.'));
    const wasEmpty = s.groupHugChannelIds.length === 0;
    await updateGroupHugSettings(guildId, { groupHugChannelIds: [...s.groupHugChannelIds, channel.id] });
    const next = wasEmpty ? await scheduleNext(guildId) : s.nextGroupHugAt;
    await reply(`${channelMention(channel.id)} ajouté. ${wasEmpty ? `Les apparitions sont activées, la première ${next ? time(next, TimestampStyles.RelativeTime) : 'bientôt'}.` : ''}`);
    return;
  }

  if (sub === 'retirer-salon') {
    const channel = interaction.options.getChannel('salon', true);
    const remaining = s.groupHugChannelIds.filter((id) => id !== channel.id);
    if (remaining.length === s.groupHugChannelIds.length) return void (await reply('Ce salon n’était pas dans la liste.'));
    await updateGroupHugSettings(guildId, { groupHugChannelIds: remaining, ...(remaining.length ? {} : { nextGroupHugAt: null }) });
    await reply(`${channelMention(channel.id)} retiré.${remaining.length ? '' : ' Plus aucun salon : les apparitions sont désactivées.'}`);
    return;
  }

  if (sub === 'regler') {
    const changes = {
      groupHugReward: interaction.options.getInteger('recompense') ?? undefined,
      groupHugDurationSeconds: interaction.options.getInteger('duree') ?? undefined,
      groupHugMinIntervalMinutes: interaction.options.getInteger('intervalle_min') ?? undefined,
      groupHugMaxIntervalMinutes: interaction.options.getInteger('intervalle_max') ?? undefined,
    };
    const min = changes.groupHugMinIntervalMinutes ?? s.groupHugMinIntervalMinutes;
    const max = changes.groupHugMaxIntervalMinutes ?? s.groupHugMaxIntervalMinutes;
    if (min > max) return void (await reply('L’intervalle minimum doit être inférieur ou égal au maximum.'));
    const updated = Object.values(changes).some((v) => v !== undefined) ? await updateGroupHugSettings(guildId, changes) : s;
    await reply(describe(updated));
    return;
  }

  if (sub === 'lancer') {
    try {
      const hug = await launchHug(interaction.guild, interaction.options.getChannel('salon')?.id);
      await reply(`Câlin collectif lancé dans ${channelMention(hug.channelId)} !`);
    } catch (err) {
      if (err instanceof GroupHugError) return void (await reply(err.message));
      throw err;
    }
    return;
  }

  if (sub === 'etat') {
    const open = await getOpenHug(guildId);
    await reply(`${describe(s)}\n${open ? `**En cours :** dans ${channelMention(open.channelId)}, fin ${time(open.endsAt, TimestampStyles.RelativeTime)}` : ''}`);
  }
}

function describe(s: Awaited<ReturnType<typeof getSettings>>): string {
  const channels = s.groupHugChannelIds.length ? s.groupHugChannelIds.map(channelMention).join(', ') : '*aucun (désactivé)*';
  return [
    `**Salons :** ${channels}`,
    `**Récompense :** ${formatAmount(s.groupHugReward, s)} par câlineur × nombre de câlineurs`,
    `**Durée :** ${s.groupHugDurationSeconds} s`,
    `**Intervalle :** entre ${s.groupHugMinIntervalMinutes} et ${s.groupHugMaxIntervalMinutes} min`,
    `**Prochaine apparition :** ${s.nextGroupHugAt && s.groupHugChannelIds.length ? time(s.nextGroupHugAt, TimestampStyles.RelativeTime) : '—'}`,
  ].join('\n');
}
