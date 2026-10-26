import { randomInt } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildTextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { nextLocalWeekdayTime } from '../../core/time.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { credit, debit } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { buildDrawAnnouncement } from './lottery.view.js';

const log = createLogger('lottery');

export class LotteryError extends Error {}

export function resolveLotteryChannel(guild: Guild, channelId: string): GuildTextBasedChannel | string {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return 'Ce salon n’existe plus.';
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return 'Il faut un salon textuel.';
  const me = guild.members.me;
  if (!me) return 'Le bot n’est pas chargé sur ce serveur.';
  const perms = channel.permissionsFor(me);
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.EmbedLinks)) {
    return 'Le bot doit pouvoir voir le salon, y envoyer des messages et intégrer des liens.';
  }
  return channel;
}

export function nextDrawDate(s: GuildSettings, from = new Date()): Date {
  return nextLocalWeekdayTime(from, s.timezone, s.lotteryDrawWeekday, s.lotteryDrawHour);
}

/** Tirage ouvert du serveur, créé si besoin (avec amorce et report éventuel). */
export async function getOrCreateOpenLottery(guildId: string, carryOver = 0): Promise<Lottery> {
  const open = await prisma.lottery.findFirst({ where: { guildId, state: 'OPEN' } });
  if (open) return open;
  const s = await getSettings(guildId);
  const lottery = await prisma.lottery.create({
    data: { guildId, drawAt: nextDrawDate(s), ticketPrice: s.lotteryTicketPrice, pot: s.lotterySeed + carryOver },
  });
  log.info(`Tombola ${lottery.id} ouverte sur ${guildId}, tirage ${lottery.drawAt.toISOString()}, cagnotte ${lottery.pot}`);
  return lottery;
}

export async function getEntry(lotteryId: string, memberId: string): Promise<number> {
  const e = await prisma.lotteryEntry.findUnique({ where: { lotteryId_memberId: { lotteryId, memberId } } });
  return e?.tickets ?? 0;
}

export interface BuyResult {
  lottery: Lottery;
  bought: number;
  owned: number;
  balanceAfter: number;
}

/** Achète `count` tickets : débit, puis cagnotte et compteurs dans une même transaction. */
export async function buyTickets(member: { id: string; guildId: string; discordUserId: string }, count: number): Promise<BuyResult> {
  const s = await getSettings(member.guildId);
  if (!s.lotteryChannelId) throw new LotteryError('La tombola n’est pas activée sur ce serveur.');
  const lottery = await getOrCreateOpenLottery(member.guildId);
  if (lottery.drawAt.getTime() <= Date.now()) throw new LotteryError('Le tirage est en cours, réessaie dans une minute.');
  const owned = await getEntry(lottery.id, member.id);
  if (s.lotteryMaxTickets > 0 && owned + count > s.lotteryMaxTickets) {
    const left = s.lotteryMaxTickets - owned;
    throw new LotteryError(left > 0 ? `Tu ne peux plus prendre que ${left} ticket${left > 1 ? 's' : ''} pour ce tirage.` : `Tu as déjà tes ${s.lotteryMaxTickets} tickets pour ce tirage.`);
  }
  const cost = lottery.ticketPrice * count;
  const debited = await debit({ memberId: member.id, amount: cost, type: 'LOTTERY_TICKET', actorDiscordId: member.discordUserId, reason: `Tombola : ${count} ticket${count > 1 ? 's' : ''}` });

  const [updated, entry] = await prisma.$transaction([
    prisma.lottery.update({ where: { id: lottery.id }, data: { pot: { increment: cost }, totalTickets: { increment: count } } }),
    prisma.lotteryEntry.upsert({
      where: { lotteryId_memberId: { lotteryId: lottery.id, memberId: member.id } },
      create: { lotteryId: lottery.id, memberId: member.id, tickets: count },
      update: { tickets: { increment: count } },
    }),
  ]);
  return { lottery: updated, bought: count, owned: entry.tickets, balanceAfter: debited.balanceAfter };
}

export interface DrawResult {
  lottery: Lottery;
  winner: { memberId: string; discordUserId: string; displayName: string; tickets: number } | null;
  next: Lottery;
}

/** Tire au sort (pondéré par tickets), crédite le gagnant, ouvre le tirage suivant. Sans ticket : la cagnotte est reportée. */
export async function draw(client: Client, lotteryId: string): Promise<DrawResult | null> {
  const { count } = await prisma.lottery.updateMany({ where: { id: lotteryId, state: 'OPEN' }, data: { state: 'DRAWN', drawnAt: new Date() } });
  if (count === 0) return null;
  const lottery = await prisma.lottery.findUniqueOrThrow({ where: { id: lotteryId }, include: { entries: { include: { member: true } } } });
  const total = lottery.entries.reduce((n, e) => n + e.tickets, 0);

  let winner: DrawResult['winner'] = null;
  let carryOver = 0;
  if (total > 0) {
    let pick = randomInt(total);
    for (const e of lottery.entries) {
      pick -= e.tickets;
      if (pick < 0) { winner = { memberId: e.memberId, discordUserId: e.member.discordUserId, displayName: e.member.displayName, tickets: e.tickets }; break; }
    }
    await prisma.lottery.update({ where: { id: lottery.id }, data: { winnerMemberId: winner!.memberId, winnerTickets: winner!.tickets } });
    await credit({ memberId: winner!.memberId, amount: lottery.pot, type: 'LOTTERY_WIN', actorDiscordId: 'voltron', reason: `Tombola gagnée (${winner!.tickets}/${total} tickets)` });
    log.info(`Tombola ${lottery.id} : ${winner!.discordUserId} gagne ${lottery.pot} avec ${winner!.tickets}/${total} tickets`);
  } else {
    carryOver = lottery.pot;
    log.info(`Tombola ${lottery.id} : aucun ticket, ${carryOver} reportés`);
  }

  const next = await getOrCreateOpenLottery(lottery.guildId, carryOver);
  const result: DrawResult = { lottery, winner, next };

  const s = await getSettings(lottery.guildId);
  const guild = client.guilds.cache.get(lottery.guildId);
  if (guild && s.lotteryChannelId) {
    const channel = resolveLotteryChannel(guild, s.lotteryChannelId);
    if (typeof channel !== 'string') await channel.send(buildDrawAnnouncement(result, total, s)).catch((err) => log.warn('Annonce du tirage impossible', err));
  }
  return result;
}

/** Pointage : ouvre un tirage si nécessaire et tire ceux dont l'heure est passée. */
export async function tickLottery(client: Client) {
  for (const guildId of config.discord.guildIds) {
    const s = await getSettings(guildId);
    if (!s.lotteryChannelId) continue;
    const open = await getOrCreateOpenLottery(guildId);
    if (open.drawAt.getTime() <= Date.now()) {
      await draw(client, open.id).catch((err) => log.error(`Tirage ${open.id} échoué`, err));
    }
  }
}
