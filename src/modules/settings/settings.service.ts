import { prisma } from '../../infrastructure/prisma.js';
import type { GuildSettings } from '../../generated/prisma/client.js';

const cache = new Map<string, GuildSettings>();

/** Réglages du serveur, créés avec les valeurs par défaut au premier accès. */
export async function getSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId }, update: {} });
  cache.set(guildId, settings);
  return settings;
}

export interface CurrencyInput {
  singular: string;
  plural: string;
  symbol: string;
}

export async function updateCurrency(guildId: string, currency: CurrencyInput): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, currencySingular: currency.singular, currencyPlural: currency.plural, currencySymbol: currency.symbol },
    update: { currencySingular: currency.singular, currencyPlural: currency.plural, currencySymbol: currency.symbol },
  });
  cache.set(guildId, settings);
  return settings;
}

export async function updateStartingBalance(guildId: string, startingBalance: number): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, startingBalance },
    update: { startingBalance },
  });
  cache.set(guildId, settings);
  return settings;
}

export async function updateDailyAmount(guildId: string, dailyAmount: number): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, dailyAmount }, update: { dailyAmount } });
  cache.set(guildId, settings);
  return settings;
}

export async function updateWeeklyAmount(guildId: string, weeklyAmount: number): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, weeklyAmount }, update: { weeklyAmount } });
  cache.set(guildId, settings);
  return settings;
}

export async function updateXpSettings(
  guildId: string,
  changes: Partial<Pick<GuildSettings, 'xpPerMessage' | 'xpMessageCooldownSeconds' | 'xpPerVoiceInterval' | 'voiceIntervalMinutes'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

export async function updateBlackjackLimits(guildId: string, blackjackMinBet: number, blackjackMaxBet: number): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, blackjackMinBet, blackjackMaxBet },
    update: { blackjackMinBet, blackjackMaxBet },
  });
  cache.set(guildId, settings);
  return settings;
}

export async function updateGroupHugSettings(
  guildId: string,
  changes: Partial<Pick<GuildSettings, 'groupHugChannelIds' | 'groupHugReward' | 'groupHugDurationSeconds' | 'groupHugMinIntervalMinutes' | 'groupHugMaxIntervalMinutes' | 'nextGroupHugAt'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

export async function updateLevelSettings(
  guildId: string,
  changes: Partial<Pick<GuildSettings, 'levelBaseXp' | 'levelStepXp' | 'levelUpChannelId'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

export async function updateSlotLimits(
  guildId: string,
  changes: Partial<Pick<GuildSettings, 'slotBet' | 'slotJackpotSeed' | 'slotTriplePercent'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

export async function updateDuelLimits(guildId: string, duelMinStake: number, duelMaxStake: number): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, duelMinStake, duelMaxStake }, update: { duelMinStake, duelMaxStake } });
  cache.set(guildId, settings);
  return settings;
}

export async function updateLotterySettings(
  guildId: string,
  changes: Partial<Pick<GuildSettings, 'lotteryChannelId' | 'lotteryTicketPrice' | 'lotteryMaxTickets' | 'lotteryDrawWeekday' | 'lotteryDrawHour' | 'lotterySeed' | 'lotteryReminderWeekday' | 'lotteryReminderHour' | 'lotteryLastCallHours'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

/** Mise à jour générique de réglages (formulaires du panneau d'intendance). */
export async function updateSettings(guildId: string, changes: Partial<Omit<GuildSettings, 'guildId' | 'updatedAt'>>): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, ...changes }, update: changes });
  cache.set(guildId, settings);
  return settings;
}

export async function updateDisabledFeatures(guildId: string, disabledFeatures: string[]): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({ where: { guildId }, create: { guildId, disabledFeatures }, update: { disabledFeatures } });
  cache.set(guildId, settings);
  return settings;
}

/** Formate un montant avec le nom de monnaie du serveur : `1 écu 🪙`, `25 écus 🪙`, `-3 écus 🪙`. */
export function formatAmount(amount: number, settings: GuildSettings, { signed = false } = {}): string {
  const abs = Math.abs(amount);
  const unit = abs === 1 ? settings.currencySingular : settings.currencyPlural;
  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : '';
  const symbol = settings.currencySymbol ? ` ${settings.currencySymbol}` : '';
  return `${sign}${abs.toLocaleString('fr-FR')} ${unit}${symbol}`;
}
