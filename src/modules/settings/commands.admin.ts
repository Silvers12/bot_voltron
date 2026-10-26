import { channelMention, ChannelType, MessageFlags, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { getSettings, updateSettings } from './settings.service.js';

export function buildCommandsAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('commandes')
    .setDescription('Salons où les membres peuvent utiliser Voltron')
    .addSubcommand((sub) =>
      sub.setName('ajouter-salon').setDescription('Autorise un salon').addChannelOption((o) => o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub.setName('retirer-salon').setDescription('Retire un salon de la liste').addChannelOption((o) => o.setName('salon').setDescription('Salon').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('partout').setDescription('Vide la liste : commandes autorisées partout'))
    .addSubcommand((sub) => sub.setName('liste').setDescription('Affiche les salons autorisés'));
}

export async function handleCommandsAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const s = await getSettings(guildId);

  if (sub === 'ajouter-salon') {
    const channel = interaction.options.getChannel('salon', true);
    if (s.commandChannelIds.includes(channel.id)) return void (await reply('Ce salon est déjà autorisé.'));
    const updated = await updateSettings(guildId, { commandChannelIds: [...s.commandChannelIds, channel.id] });
    await reply(`${channelMention(channel.id)} ajouté. ${describeCommandChannels(updated)}`);
    return;
  }
  if (sub === 'retirer-salon') {
    const channel = interaction.options.getChannel('salon', true);
    const updated = await updateSettings(guildId, { commandChannelIds: s.commandChannelIds.filter((id) => id !== channel.id) });
    await reply(`${channelMention(channel.id)} retiré. ${describeCommandChannels(updated)}`);
    return;
  }
  if (sub === 'partout') {
    await updateSettings(guildId, { commandChannelIds: [] });
    await reply('Les commandes sont de nouveau autorisées partout.');
    return;
  }
  await reply(describeCommandChannels(s));
}

export function describeCommandChannels(s: { commandChannelIds: string[] }): string {
  return s.commandChannelIds.length
    ? `Commandes des membres autorisées dans : ${s.commandChannelIds.map(channelMention).join(' ')}. \`/admin\` reste utilisable partout.`
    : 'Commandes autorisées partout (aucune restriction).';
}

/** Les commandes des membres sont-elles permises dans ce salon ? */
export function isCommandChannelAllowed(s: { commandChannelIds: string[] }, channelId: string | null): boolean {
  return s.commandChannelIds.length === 0 || (channelId !== null && s.commandChannelIds.includes(channelId));
}
