import { randomInt } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildTextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { nextLocalWeekdayTime } from '../../core/time.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { credit, debit } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { trackAchievements } from '../achievements/achievements.service.js';
import { notifyMention } from '../notify/notify.service.js';
import { buildDrawAnnouncement, buildLotteryMessage } from './lottery.view.js';

import { botName } from '../../core/identity.js';
const log = createLogger('lottery');

export class LotteryError extends Error {
  balanceAfter?: number;
  withBalance(balance: number) { this.balanceAfter = balance; return this; }
}

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

/** Date du rappel de milieu de semaine pour ce tirage, ou null s'il n'y en a pas (désactivé ou après le tirage). */
export function reminderDate(lottery: Pick<Lottery, 'createdAt' | 'drawAt'>, s: GuildSettings): Date | null {
  if (s.lotteryReminderWeekday < 1) return null;
  const d = nextLocalWeekdayTime(lottery.createdAt, s.timezone, s.lotteryReminderWeekday, s.lotteryReminderHour);
  return d.getTime() < lottery.drawAt.getTime() ? d : null;
}

/** Date du dernier rappel (X heures avant le tirage), ou null. */
export function lastCallDate(lottery: Pick<Lottery, 'createdAt' | 'drawAt'>, s: GuildSettings): Date | null {
  if (s.lotteryLastCallHours < 1) return null;
  const d = new Date(lottery.drawAt.getTime() - s.lotteryLastCallHours * 3_600_000);
  return d.getTime() > lottery.createdAt.getTime() ? d : null;
}

/**
 * Publie le tirage dans le salon configuré : nouveau message avec les boutons, épinglé.
 * L'ancien message est désépinglé et perd ses boutons. Retourne le tirage mis à jour, ou null si la publication est impossible.
 */
export async function publishLottery(client: Client, lottery: Lottery, intro: string): Promise<Lottery | null> {
  const s = await getSettings(lottery.guildId);
  const guild = client.guilds.cache.get(lottery.guildId);
  if (!guild || !s.lotteryChannelId) return null;
  const channel = resolveLotteryChannel(guild, s.lotteryChannelId);
  if (typeof channel === 'string') { log.warn(`Publication de la tombola impossible sur ${guild.name} : ${channel}`); return null; }

  const fresh = await prisma.lottery.findUniqueOrThrow({ where: { id: lottery.id } });
  const message = await channel.send({ ...buildLotteryMessage(fresh, s, `${notifyMention(s, 'lottery')}${intro}`), allowedMentions: { parse: ['roles' as const] } }).catch((err) => { log.warn('Publication de la tombola impossible', err); return null; });
  if (!message) return null;

  const canPin = channel.permissionsFor(guild.members.me!).has(PermissionFlagsBits.ManageMessages);
  if (canPin) {
    await retireMessage(client, fresh, s, { unpin: true });
    await message.pin().catch((err) => log.warn('Épinglage impossible', err));
  } else {
    await retireMessage(client, fresh, s, { unpin: false });
  }
  return prisma.lottery.update({ where: { id: fresh.id }, data: { channelId: channel.id, messageId: message.id } });
}

/** Retire les boutons (et l'épingle) du message précédent d'un tirage. */
async function retireMessage(client: Client, lottery: Lottery, s: GuildSettings, { unpin }: { unpin: boolean }) {
  const old = await fetchLotteryMessage(client, lottery);
  if (!old) return;
  if (unpin && old.pinned) await old.unpin().catch(() => undefined);
  await old.edit(buildLotteryMessage(lottery, s, undefined, { buttons: false })).catch(() => undefined);
}

async function fetchLotteryMessage(client: Client, lottery: Pick<Lottery, 'channelId' | 'messageId'>) {
  if (!lottery.channelId || !lottery.messageId) return null;
  const channel = client.channels.cache.get(lottery.channelId);
  if (!channel || !channel.isTextBased()) return null;
  return channel.messages.fetch({ message: lottery.messageId }).catch(() => null);
}

/** Met à jour la cagnotte sur le message épinglé (après un achat depuis un autre message). */
export async function refreshPublishedMessage(client: Client, lottery: Lottery, exceptMessageId?: string) {
  if (!lottery.messageId || lottery.messageId === exceptMessageId) return;
  const msg = await fetchLotteryMessage(client, lottery);
  if (!msg) return;
  const s = await getSettings(lottery.guildId);
  await msg.edit(buildLotteryMessage(lottery, s)).catch(() => undefined);
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

  // Le tirage ne peut pas se glisser entre les deux écritures : la ligne du tirage est verrouillée (état OPEN vérifié) jusqu'au commit.
  const result = await prisma.$transaction(async (db) => {
    const { count: open } = await db.lottery.updateMany({ where: { id: lottery.id, state: 'OPEN' }, data: { pot: { increment: cost }, totalTickets: { increment: count } } });
    if (open === 0) return null;
    const entry = await db.lotteryEntry.upsert({
      where: { lotteryId_memberId: { lotteryId: lottery.id, memberId: member.id } },
      create: { lotteryId: lottery.id, memberId: member.id, tickets: count },
      update: { tickets: { increment: count } },
    });
    const updated = await db.lottery.findUniqueOrThrow({ where: { id: lottery.id } });
    return { updated, entry };
  });
  if (!result) {
    const refund = await credit({ memberId: member.id, amount: cost, type: 'REFUND', actorDiscordId: 'voltron', reason: 'Tombola : tirage en cours, tickets remboursés' });
    throw new LotteryError(`Le tirage vient d’avoir lieu, tes ${formatAmount(cost, s)} te sont rendus. Réessaie pour le prochain !`).withBalance(refund.balanceAfter);
  }
  return { lottery: result.updated, bought: count, owned: result.entry.tickets, balanceAfter: debited.balanceAfter };
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
  if (guild && winner) trackAchievements(guild, winner.memberId);
  if (guild && s.lotteryChannelId) {
    const channel = resolveLotteryChannel(guild, s.lotteryChannelId);
    if (typeof channel !== 'string') await channel.send(buildDrawAnnouncement(result, total, s)).catch((err) => log.warn('Annonce du tirage impossible', err));
    await retireMessage(client, lottery, s, { unpin: true });
    const published = await publishLottery(client, next, nextIntro(next, carryOver, s));
    if (published) result.next = published;
  }
  return result;
}

function nextIntro(next: Lottery, carryOver: number, s: GuildSettings): string {
  if (carryOver > 0) return `🎟️ **Nouvelle tombola !** La cagnotte repart avec les ${formatAmount(carryOver, s)} reportés. Tentez votre chance !`;
  if (next.pot > 0) return `🎟️ **Nouvelle tombola !** La banque amorce la cagnotte avec ${formatAmount(next.pot, s)}. Tentez votre chance !`;
  return '🎟️ **Nouvelle tombola !** La cagnotte est vide, à vous de la remplir. Tentez votre chance !';
}

/** Pointage : ouvre un tirage si nécessaire et tire ceux dont l'heure est passée. */
export async function tickLottery(client: Client) {
  for (const guildId of config.discord.guildIds) {
    const s = await getSettings(guildId);
    if (!s.lotteryChannelId || !isFeatureEnabled(s, 'tombola')) continue;
    const open = await getOrCreateOpenLottery(guildId);
    const now = Date.now();
    if (open.drawAt.getTime() <= now) {
      await draw(client, open.id).catch((err) => log.error(`Tirage ${open.id} échoué`, err));
      continue;
    }
    await sendReminders(client, open, s, now);
  }
}

/** Envoie le rappel de milieu de semaine puis le dernier rappel, une seule fois chacun (verrou par updateMany). */
async function sendReminders(client: Client, open: Lottery, s: GuildSettings, now: number) {
  const reminder = reminderDate(open, s);
  if (reminder && !open.reminderSentAt && reminder.getTime() <= now) {
    const { count } = await prisma.lottery.updateMany({ where: { id: open.id, reminderSentAt: null, state: 'OPEN' }, data: { reminderSentAt: new Date() } });
    if (count) await publishLottery(client, open, `🎟️ **Rappel de ${botName()} !** Le tirage approche et la cagnotte grossit. Qui veut ses tickets ?`);
    return;
  }
  const lastCall = lastCallDate(open, s);
  if (lastCall && !open.lastCallSentAt && lastCall.getTime() <= now) {
    const { count } = await prisma.lottery.updateMany({ where: { id: open.id, lastCallSentAt: null, state: 'OPEN' }, data: { lastCallSentAt: new Date() } });
    if (count) await publishLottery(client, open, `🎟️ **Derniers tickets !** ${botName()} sort le chapeau dans ${s.lotteryLastCallHours} h. Après, c'est trop tard !`);
  }
}
