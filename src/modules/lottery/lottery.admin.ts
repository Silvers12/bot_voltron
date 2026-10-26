import { channelMention, ChannelType, MessageFlags, time, TimestampStyles, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { formatAmount, getSettings, updateLotterySettings } from '../settings/settings.service.js';
import { draw, getOrCreateOpenLottery, nextDrawDate, resolveLotteryChannel } from './lottery.service.js';
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
        .setDescription('Prix, maximum de tickets, jour et heure du tirage, amorce')
        .addIntegerOption((o) => o.setName('prix').setDescription('Prix d’un ticket').setMinValue(1).setMaxValue(100000))
        .addIntegerOption((o) => o.setName('max_tickets').setDescription('Tickets max par membre (0 = illimité)').setMinValue(0).setMaxValue(1000))
        .addIntegerOption((o) => o.setName('jour').setDescription('Jour du tirage').addChoices(...DAYS.slice(1).map((d, i) => ({ name: d, value: i + 1 }))))
        .addIntegerOption((o) => o.setName('heure').setDescription('Heure du tirage (0-23)').setMinValue(0).setMaxValue(23))
        .addIntegerOption((o) => o.setName('amorce').setDescription('Cœurs ajoutés par la banque à chaque nouveau tirage').setMinValue(0).setMaxValue(1000000)),
    )
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
      await reply(`Tombola activée, tirages annoncés dans ${channelMention(channel.id)}. Premier tirage ${time(lottery.drawAt, TimestampStyles.RelativeTime)}.`);
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

function describe(s: Awaited<ReturnType<typeof getSettings>>, open: { pot: number; totalTickets: number; drawAt: Date } | null): string {
  return [
    `**Salon :** ${s.lotteryChannelId ? channelMention(s.lotteryChannelId) : '*aucun (désactivée)*'}`,
    `**Ticket :** ${formatAmount(s.lotteryTicketPrice, s)} · max ${s.lotteryMaxTickets || 'illimité'} par membre`,
    `**Tirage :** ${DAYS[s.lotteryDrawWeekday]} à ${s.lotteryDrawHour} h (${s.timezone}) · amorce ${formatAmount(s.lotterySeed, s)}`,
    open ? `**En cours :** cagnotte ${formatAmount(open.pot, s)}, ${open.totalTickets} ticket(s), tirage ${time(open.drawAt, TimestampStyles.RelativeTime)}` : '**En cours :** aucun tirage ouvert',
  ].join('\n');
}
