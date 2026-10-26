import { channelMention, ChannelType, MessageFlags, time, TimestampStyles, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { formatAmount, getSettings, updateLotterySettings } from '../settings/settings.service.js';
import { draw, getOrCreateOpenLottery, lastCallDate, nextDrawDate, publishLottery, reminderDate, resolveLotteryChannel } from './lottery.service.js';
import { PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';

const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function buildLotteryAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('tombola')
    .setDescription('Tombola hebdomadaire')
    .addSubcommand((sub) =>
      sub
        .setName('salon')
        .setDescription('Salon d’annonce des tirages : active la tombola (sans option : désactive)')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon textuel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('regler')
        .setDescription('Prix, maximum de tickets, jour et heure du tirage, amorce, rappels')
        .addIntegerOption((o) => o.setName('prix').setDescription('Prix d’un ticket').setMinValue(1).setMaxValue(100000))
        .addIntegerOption((o) => o.setName('max_tickets').setDescription('Tickets max par membre (0 = illimité)').setMinValue(0).setMaxValue(1000))
        .addIntegerOption((o) => o.setName('jour').setDescription('Jour du tirage').addChoices(...DAYS.slice(1).map((d, i) => ({ name: d, value: i + 1 }))))
        .addIntegerOption((o) => o.setName('heure').setDescription('Heure du tirage (0-23)').setMinValue(0).setMaxValue(23))
        .addIntegerOption((o) => o.setName('amorce').setDescription('Cœurs ajoutés par la banque à chaque nouveau tirage').setMinValue(0).setMaxValue(1000000))
        .addIntegerOption((o) => o.setName('rappel_jour').setDescription('Jour du rappel de milieu de semaine').addChoices({ name: 'aucun', value: 0 }, ...DAYS.slice(1).map((d, i) => ({ name: d, value: i + 1 }))))
        .addIntegerOption((o) => o.setName('rappel_heure').setDescription('Heure du rappel (0-23)').setMinValue(0).setMaxValue(23))
        .addIntegerOption((o) => o.setName('dernier_rappel').setDescription('Dernier rappel, en heures avant le tirage (0 = aucun)').setMinValue(0).setMaxValue(72)),
    )
    .addSubcommand((sub) => sub.setName('publier').setDescription('Republie et épingle le tirage en cours dans le salon'))
    .addSubcommand((sub) => sub.setName('tirer').setDescription('Effectue le tirage maintenant'))
    .addSubcommand((sub) => sub.setName('etat').setDescription('Affiche la configuration et le tirage en cours'));
}

export async function handleLotteryAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const s = await getSettings(guildId);

  if (sub === 'salon') {
    const channel = interaction.options.getChannel('salon');
    if (channel) {
      const problem = resolveLotteryChannel(interaction.guild, channel.id);
      if (typeof problem === 'string') return void (await reply(`Impossible d’utiliser ${channelMention(channel.id)} : ${problem}`));
    }
    await updateLotterySettings(guildId, { lotteryChannelId: channel?.id ?? null });
    if (channel) {
      const lottery = await getOrCreateOpenLottery(guildId);
      await reply(`Tombola activée, tirages annoncés dans ${channelMention(channel.id)}. Premier tirage ${time(lottery.drawAt, TimestampStyles.RelativeTime)}.${pinWarning(interaction, channel.id)}`);
      await publishLottery(interaction.client, lottery, '🎟️ **La tombola est ouverte !** Un ticket, une chance. Le gagnant rafle toute la cagnotte.');
    } else {
      await reply('Tombola désactivée. Le tirage en cours reste ouvert mais ne sera pas tiré tant qu’aucun salon n’est configuré.');
    }
    return;
  }

  if (sub === 'regler') {
    const changes = {
      lotteryTicketPrice: interaction.options.getInteger('prix') ?? undefined,
      lotteryMaxTickets: interaction.options.getInteger('max_tickets') ?? undefined,
      lotteryDrawWeekday: interaction.options.getInteger('jour') ?? undefined,
      lotteryDrawHour: interaction.options.getInteger('heure') ?? undefined,
      lotterySeed: interaction.options.getInteger('amorce') ?? undefined,
      lotteryReminderWeekday: interaction.options.getInteger('rappel_jour') ?? undefined,
      lotteryReminderHour: interaction.options.getInteger('rappel_heure') ?? undefined,
      lotteryLastCallHours: interaction.options.getInteger('dernier_rappel') ?? undefined,
    };
    const updated = Object.values(changes).some((v) => v !== undefined) ? await updateLotterySettings(guildId, changes) : s;
    // Le prix et la date du tirage en cours suivent les nouveaux réglages (tickets déjà vendus inchangés).
    if (changes.lotteryDrawWeekday !== undefined || changes.lotteryDrawHour !== undefined || changes.lotteryTicketPrice !== undefined) {
      await prisma.lottery.updateMany({
        where: { guildId, state: 'OPEN' },
        data: { drawAt: nextDrawDate(updated), ...(changes.lotteryTicketPrice !== undefined ? { ticketPrice: updated.lotteryTicketPrice } : {}) },
      });
    }
    await reply(describe(updated, await prisma.lottery.findFirst({ where: { guildId, state: 'OPEN' } })));
    return;
  }

  if (sub === 'publier') {
    if (!s.lotteryChannelId) return void (await reply('Active d’abord la tombola avec `/admin tombola salon`.'));
    const open = await getOrCreateOpenLottery(guildId);
    const published = await publishLottery(interaction.client, open, '🎟️ **La tombola continue !** Tentez votre chance.');
    await reply(published ? `Tombola publiée dans ${channelMention(s.lotteryChannelId)}.${pinWarning(interaction, s.lotteryChannelId)}` : 'Publication impossible, vérifie le salon et les permissions du bot.');
    return;
  }

  if (sub === 'tirer') {
    if (!s.lotteryChannelId) return void (await reply('Active d’abord la tombola avec `/admin tombola salon`.'));
    const open = await getOrCreateOpenLottery(guildId);
    const result = await draw(interaction.client, open.id);
    if (!result) return void (await reply('Le tirage vient d’être effectué par ailleurs.'));
    await reply(result.winner ? `Tirage effectué : <@${result.winner.discordUserId}> remporte ${formatAmount(result.lottery.pot, s)}.` : `Tirage effectué sans ticket : ${formatAmount(result.lottery.pot, s)} reportés.`);
    return;
  }

  if (sub === 'etat') {
    await reply(describe(s, await prisma.lottery.findFirst({ where: { guildId, state: 'OPEN' } })));
  }
}

function pinWarning(interaction: ChatInputCommandInteraction<'cached'>, channelId: string): string {
  const channel = interaction.guild.channels.cache.get(channelId);
  const canPin = channel && !channel.isDMBased() && channel.permissionsFor(interaction.guild.members.me!).has(PermissionFlagsBits.ManageMessages);
  return canPin ? '' : '\n⚠️ Le bot n’a pas « Gérer les messages » dans ce salon : la tombola ne sera pas épinglée.';
}

function describe(s: Awaited<ReturnType<typeof getSettings>>, open: { pot: number; totalTickets: number; drawAt: Date; createdAt: Date; reminderSentAt: Date | null; lastCallSentAt: Date | null } | null): string {
  const lines = [
    `**Salon :** ${s.lotteryChannelId ? channelMention(s.lotteryChannelId) : '*aucun (désactivée)*'}`,
    `**Ticket :** ${formatAmount(s.lotteryTicketPrice, s)} · max ${s.lotteryMaxTickets || 'illimité'} par membre`,
    `**Tirage :** ${DAYS[s.lotteryDrawWeekday]} à ${s.lotteryDrawHour} h (${s.timezone}) · amorce ${formatAmount(s.lotterySeed, s)}`,
    `**Rappels :** ${s.lotteryReminderWeekday ? `${DAYS[s.lotteryReminderWeekday]} à ${s.lotteryReminderHour} h` : 'aucun en semaine'} · ${s.lotteryLastCallHours ? `dernier rappel ${s.lotteryLastCallHours} h avant le tirage` : 'pas de dernier rappel'}`,
  ];
  if (!open) return [...lines, '**En cours :** aucun tirage ouvert'].join('\n');
  const reminder = reminderDate(open, s);
  const lastCall = lastCallDate(open, s);
  const status = (d: Date | null, sent: Date | null) => (d ? (sent ? 'envoyé' : time(d, TimestampStyles.RelativeTime)) : 'aucun');
  return [
    ...lines,
    `**En cours :** cagnotte ${formatAmount(open.pot, s)}, ${open.totalTickets} ticket(s), tirage ${time(open.drawAt, TimestampStyles.RelativeTime)}`,
    `**Prochains rappels :** semaine ${status(reminder, open.reminderSentAt)} · dernier ${status(lastCall, open.lastCallSentAt)}`,
  ].join('\n');
}
