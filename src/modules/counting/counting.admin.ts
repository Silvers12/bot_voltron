import { channelMention, ChannelType, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder, roleMention } from 'discord.js';
import { formatAmount, getSettings, updateSettings } from '../settings/settings.service.js';
import { getCounting, resetCounting } from './counting.service.js';
import { addPrisonSubcommands, handlePrisonAdmin, PRISON_SUBCOMMANDS } from '../prison/prison.admin.js';

export function buildCountingAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return addPrisonSubcommands(group)
    .setName('comptage')
    .setDescription('Salon de comptage')
    .addSubcommand((sub) =>
      sub
        .setName('salon')
        .setDescription('Salon de comptage : active le jeu (sans option : désactive)')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon textuel').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub.setName('amende').setDescription('Amende en cas d’erreur').addIntegerOption((o) => o.setName('montant').setDescription('Cœurs retirés (0 = aucune)').setRequired(true).setMinValue(0).setMaxValue(1_000_000)),
    )
    .addSubcommand((sub) => sub.setName('reinitialiser').setDescription('Remet le compteur à zéro (prochain nombre : 1)'))
    .addSubcommand((sub) => sub.setName('etat').setDescription('Affiche le salon, l’amende, le nombre courant et le record'));
}

export async function handleCountingAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  if ((PRISON_SUBCOMMANDS as readonly string[]).includes(sub)) return handlePrisonAdmin(interaction);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (sub === 'salon') {
    const channel = interaction.options.getChannel('salon');
    if (channel) {
      const me = interaction.guild.members.me!;
      const perms = interaction.guild.channels.cache.get(channel.id)?.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.AddReactions) || !perms.has(PermissionFlagsBits.ReadMessageHistory)) {
        return void (await reply('Le bot doit pouvoir voir le salon, y écrire, lire l’historique et ajouter des réactions.'));
      }
    }
    await updateSettings(guildId, { countingChannelId: channel?.id ?? null });
    await reply(channel ? `Comptage activé dans ${channelMention(channel.id)}. Prochain nombre : **${(await getCounting(guildId)).current + 1}**.` : 'Comptage désactivé.');
    return;
  }
  if (sub === 'amende') {
    const s = await updateSettings(guildId, { countingFine: interaction.options.getInteger('montant', true) });
    await reply(`Amende fixée à ${formatAmount(s.countingFine, s)}.`);
    return;
  }
  if (sub === 'reinitialiser') {
    await resetCounting(guildId);
    await reply('Compteur remis à zéro : prochain nombre **1**.');
    return;
  }
  await reply(describeCounting(await getSettings(guildId), await getCounting(guildId)));
}

export function describeCounting(s: Awaited<ReturnType<typeof getSettings>>, c: { current: number; best: number; failures: number }): string {
  return [
    `**Salon :** ${s.countingChannelId ? channelMention(s.countingChannelId) : '*aucun (désactivé)*'}`,
    `**Amende :** ${formatAmount(s.countingFine, s)}`,
    `**Surprise :** ${s.countingRewardEvery > 0 && s.countingRewardMax > 0 ? `environ un nombre sur ${s.countingRewardEvery}, de ${formatAmount(s.countingRewardMin, s)} à ${formatAmount(s.countingRewardMax, s)}` : 'désactivée'}`,
    `**Prison :** ${s.prisonRoleId ? roleMention(s.prisonRoleId) : '*rôle « Prison » créé au besoin*'} · ${s.prisonMinutes} min sans aucun jeu pour qui modifie son message après coup`,
    `**Prochain nombre :** ${c.current + 1} · record ${c.best} · ${c.failures} erreur(s)`,
  ].join('\n');
}
