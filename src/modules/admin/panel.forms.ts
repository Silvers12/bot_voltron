import { ActionRowBuilder, ChannelType, channelMention, ModalBuilder, TextInputBuilder, TextInputStyle, type Guild } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { prisma } from '../../infrastructure/prisma.js';
import { formatAmount, updateSettings } from '../settings/settings.service.js';
import { resolveHugChannel, scheduleNext } from '../events/grouphug.service.js';
import { nextDrawDate, publishLottery, resolveLotteryChannel } from '../lottery/lottery.service.js';
import { resyncAllLevels } from '../progression/levels.service.js';
import type { Client } from 'discord.js';
import type { ModuleKey } from './panel.view.js';

export const ADMIN_EDIT_PREFIX = 'admin:edit:';
export const ADMIN_FORM_PREFIX = 'admin:form:';

const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

type FieldKind =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'text'; maxLength: number; required: boolean }
  | { kind: 'channel'; required: boolean }
  | { kind: 'channels' }
  | { kind: 'weekday'; allowNone: boolean };

interface Field {
  id: string;
  label: string;
  help?: string;
  type: FieldKind;
  current(s: GuildSettings): string;
}

type Values = Record<string, number | string | string[] | null>;

export interface Form {
  key: string;
  module: ModuleKey;
  title: string;
  button: string;
  fields: Field[];
  /** Applique les valeurs validées ; retourne un message pour le panneau. */
  apply(ctx: { guild: Guild; client: Client; before: GuildSettings; values: Values }): Promise<string>;
}

const int = (min: number, max: number): FieldKind => ({ kind: 'int', min, max });
const text = (maxLength: number, required = true): FieldKind => ({ kind: 'text', maxLength, required });
const channelOf = (s: GuildSettings, id: string | null) => (id ? channelMention(id) : '');

export const FORMS: Form[] = [
  {
    key: 'monnaie', module: 'economie', title: 'Monnaie', button: 'Monnaie',
    fields: [
      { id: 'currencySingular', label: 'Nom au singulier', type: text(30), current: (s) => s.currencySingular },
      { id: 'currencyPlural', label: 'Nom au pluriel', type: text(30), current: (s) => s.currencyPlural },
      { id: 'currencySymbol', label: 'Symbole (vide = aucun)', type: text(20, false), current: (s) => s.currencySymbol },
    ],
    async apply({ guild, values }) {
      const s = await updateSettings(guild.id, values as Partial<GuildSettings>);
      return `Monnaie : ${formatAmount(1, s)}, ${formatAmount(2, s)}.`;
    },
  },
  {
    key: 'montants', module: 'economie', title: 'Montants', button: 'Montants',
    fields: [
      { id: 'startingBalance', label: 'Bourse de bienvenue', type: int(0, 1_000_000), current: (s) => `${s.startingBalance}` },
      { id: 'dailyAmount', label: 'Récompense du jour', type: int(0, 1_000_000), current: (s) => `${s.dailyAmount}` },
      { id: 'dailyStreakBonusPercent', label: 'Bonus de série (% par jour)', type: int(0, 100), current: (s) => `${s.dailyStreakBonusPercent}` },
      { id: 'weeklyAmount', label: 'Récompense de la semaine', type: int(0, 1_000_000), current: (s) => `${s.weeklyAmount}` },
    ],
    async apply({ guild, values }) {
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Montants enregistrés.';
    },
  },
  {
    key: 'xp', module: 'progression', title: 'Gains d’XP', button: 'XP',
    fields: [
      { id: 'xpPerMessage', label: 'XP par message (0 = aucun)', type: int(0, 1000), current: (s) => `${s.xpPerMessage}` },
      { id: 'xpMessageCooldownSeconds', label: 'Délai entre messages comptés (s)', type: int(0, 86400), current: (s) => `${s.xpMessageCooldownSeconds}` },
      { id: 'xpPerVoiceInterval', label: 'XP par tranche de vocal (0 = aucun)', type: int(0, 1000), current: (s) => `${s.xpPerVoiceInterval}` },
      { id: 'voiceIntervalMinutes', label: 'Durée d’une tranche de vocal (min)', type: int(1, 1440), current: (s) => `${s.voiceIntervalMinutes}` },
    ],
    async apply({ guild, values }) {
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Gains d’XP enregistrés.';
    },
  },
  {
    key: 'niveaux', module: 'progression', title: 'Niveaux', button: 'Niveaux',
    fields: [
      { id: 'levelBaseXp', label: 'XP de base pour le niveau suivant', type: int(1, 100_000), current: (s) => `${s.levelBaseXp}` },
      { id: 'levelStepXp', label: 'XP en plus par niveau (pas)', type: int(0, 100_000), current: (s) => `${s.levelStepXp}` },
      { id: 'levelUpChannelId', label: 'Salon des annonces (vide = aucune)', help: '#salon ou son nom', type: { kind: 'channel', required: false }, current: (s) => channelOf(s, s.levelUpChannelId) },
    ],
    async apply({ guild, before, values }) {
      const s = await updateSettings(guild.id, values as Partial<GuildSettings>);
      if (s.levelBaseXp !== before.levelBaseXp || s.levelStepXp !== before.levelStepXp) {
        const n = await resyncAllLevels(guild);
        return `Courbe enregistrée, niveaux recalculés : ${n} membre(s) ont changé de niveau.`;
      }
      return 'Réglages des niveaux enregistrés.';
    },
  },
  {
    key: 'blackjack', module: 'casino', title: 'Blackjack', button: 'Blackjack',
    fields: [
      { id: 'blackjackMinBet', label: 'Mise minimale', type: int(1, 1_000_000), current: (s) => `${s.blackjackMinBet}` },
      { id: 'blackjackMaxBet', label: 'Mise maximale', type: int(1, 1_000_000), current: (s) => `${s.blackjackMaxBet}` },
    ],
    async apply({ guild, values }) {
      if ((values.blackjackMinBet as number) > (values.blackjackMaxBet as number)) throw new FormError('La mise minimale doit être inférieure ou égale à la maximale.');
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Mises du blackjack enregistrées.';
    },
  },
  {
    key: 'machine', module: 'casino', title: 'Machine à sous', button: 'Machine',
    fields: [
      { id: 'slotBet', label: 'Prix d’un tour', type: int(1, 100_000), current: (s) => `${s.slotBet}` },
      { id: 'slotTriplePercent', label: 'Part de cagnotte pour un triple (%)', type: int(1, 100), current: (s) => `${s.slotTriplePercent}` },
      { id: 'slotJackpotSeed', label: 'Cagnotte de départ après jackpot', type: int(0, 1_000_000), current: (s) => `${s.slotJackpotSeed}` },
    ],
    async apply({ guild, values }) {
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Réglages de la machine enregistrés (la cagnotte en cours est inchangée).';
    },
  },
  {
    key: 'duel', module: 'duel', title: 'Duels', button: 'Mises',
    fields: [
      { id: 'duelMinStake', label: 'Mise minimale', type: int(1, 1_000_000), current: (s) => `${s.duelMinStake}` },
      { id: 'duelMaxStake', label: 'Mise maximale', type: int(1, 1_000_000), current: (s) => `${s.duelMaxStake}` },
    ],
    async apply({ guild, values }) {
      if ((values.duelMinStake as number) > (values.duelMaxStake as number)) throw new FormError('La mise minimale doit être inférieure ou égale à la maximale.');
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Mises des duels enregistrées.';
    },
  },
  {
    key: 'calin_collectif', module: 'calin_collectif', title: 'Câlin collectif', button: 'Réglages',
    fields: [
      { id: 'groupHugChannelIds', label: 'Salons (vide = inactif)', help: '#salon1 #salon2…', type: { kind: 'channels' }, current: (s) => s.groupHugChannelIds.map((id) => channelMention(id)).join(' ') },
      { id: 'groupHugReward', label: 'Récompense par câlineur', type: int(0, 100_000), current: (s) => `${s.groupHugReward}` },
      { id: 'groupHugDurationSeconds', label: 'Durée du câlin (secondes)', type: int(10, 3600), current: (s) => `${s.groupHugDurationSeconds}` },
      { id: 'groupHugMinIntervalMinutes', label: 'Intervalle minimum (minutes)', type: int(1, 10080), current: (s) => `${s.groupHugMinIntervalMinutes}` },
      { id: 'groupHugMaxIntervalMinutes', label: 'Intervalle maximum (minutes)', type: int(1, 10080), current: (s) => `${s.groupHugMaxIntervalMinutes}` },
    ],
    async apply({ guild, before, values }) {
      if ((values.groupHugMinIntervalMinutes as number) > (values.groupHugMaxIntervalMinutes as number)) throw new FormError('L’intervalle minimum doit être inférieur ou égal au maximum.');
      for (const id of values.groupHugChannelIds as string[]) {
        const problem = resolveHugChannel(guild, id);
        if (typeof problem === 'string') throw new FormError(`${channelMention(id)} : ${problem}`);
      }
      const s = await updateSettings(guild.id, values as Partial<GuildSettings>);
      const intervalChanged = s.groupHugMinIntervalMinutes !== before.groupHugMinIntervalMinutes || s.groupHugMaxIntervalMinutes !== before.groupHugMaxIntervalMinutes;
      if (s.groupHugChannelIds.length && (intervalChanged || !before.groupHugChannelIds.length || !s.nextGroupHugAt)) {
        await scheduleNext(guild.id);
        return 'Câlin collectif enregistré, prochaine apparition reprogrammée.';
      }
      return 'Câlin collectif enregistré.';
    },
  },
  {
    key: 'tombola_tirage', module: 'tombola', title: 'Tombola : tirage', button: 'Tirage',
    fields: [
      { id: 'lotteryChannelId', label: 'Salon (vide = tombola désactivée)', help: '#salon ou son nom', type: { kind: 'channel', required: false }, current: (s) => channelOf(s, s.lotteryChannelId) },
      { id: 'lotteryTicketPrice', label: 'Prix d’un ticket', type: int(1, 100_000), current: (s) => `${s.lotteryTicketPrice}` },
      { id: 'lotteryMaxTickets', label: 'Tickets max par membre (0 = illimité)', type: int(0, 1000), current: (s) => `${s.lotteryMaxTickets}` },
      { id: 'lotteryDrawWeekday', label: 'Jour du tirage', help: 'lundi … dimanche', type: { kind: 'weekday', allowNone: false }, current: (s) => DAYS[s.lotteryDrawWeekday] ?? '' },
      { id: 'lotteryDrawHour', label: 'Heure du tirage (0-23)', type: int(0, 23), current: (s) => `${s.lotteryDrawHour}` },
    ],
    async apply({ guild, client, before, values }) {
      const channelId = values.lotteryChannelId as string | null;
      if (channelId) {
        const problem = resolveLotteryChannel(guild, channelId);
        if (typeof problem === 'string') throw new FormError(`${channelMention(channelId)} : ${problem}`);
      }
      const s = await updateSettings(guild.id, values as Partial<GuildSettings>);
      await prisma.lottery.updateMany({ where: { guildId: guild.id, state: 'OPEN' }, data: { drawAt: nextDrawDate(s), ticketPrice: s.lotteryTicketPrice } });
      if (s.lotteryChannelId && !before.lotteryChannelId) {
        const open = await prisma.lottery.findFirst({ where: { guildId: guild.id, state: 'OPEN' } });
        if (open) await publishLottery(client, open, '🎟️ **La tombola est ouverte !** Un ticket, une chance. Le gagnant rafle toute la cagnotte.');
        return 'Tombola activée et publiée dans le salon.';
      }
      return s.lotteryChannelId ? 'Tirage enregistré (date et prix du tirage en cours mis à jour).' : 'Tombola désactivée : le tirage en cours reste ouvert sans être tiré.';
    },
  },
  {
    key: 'succes', module: 'succes', title: 'Succès et badges', button: 'Annonces',
    fields: [
      { id: 'achievementChannelId', label: 'Salon des annonces (vide = aucune)', help: '#salon ou son nom', type: { kind: 'channel', required: false }, current: (s) => channelOf(s, s.achievementChannelId) },
    ],
    async apply({ guild, values }) {
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Salon des annonces de succès enregistré.';
    },
  },
  {
    key: 'tombola_rappels', module: 'tombola', title: 'Tombola : rappels et amorce', button: 'Rappels',
    fields: [
      { id: 'lotteryReminderWeekday', label: 'Jour du rappel (aucun = pas de rappel)', help: 'mercredi, aucun…', type: { kind: 'weekday', allowNone: true }, current: (s) => (s.lotteryReminderWeekday ? DAYS[s.lotteryReminderWeekday] ?? '' : 'aucun') },
      { id: 'lotteryReminderHour', label: 'Heure du rappel (0-23)', type: int(0, 23), current: (s) => `${s.lotteryReminderHour}` },
      { id: 'lotteryLastCallHours', label: 'Dernier rappel, heures avant (0 = aucun)', type: int(0, 72), current: (s) => `${s.lotteryLastCallHours}` },
      { id: 'lotterySeed', label: 'Amorce de la banque par tirage', type: int(0, 1_000_000), current: (s) => `${s.lotterySeed}` },
    ],
    async apply({ guild, values }) {
      await updateSettings(guild.id, values as Partial<GuildSettings>);
      return 'Rappels enregistrés.';
    },
  },
];

export class FormError extends Error {}

export function formsForModule(module: ModuleKey): Form[] {
  return FORMS.filter((f) => f.module === module);
}

export function findForm(key: string): Form | undefined {
  return FORMS.find((f) => f.key === key);
}

/** Construit la modale pré-remplie avec les valeurs actuelles. */
export function buildFormModal(form: Form, s: GuildSettings): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`${ADMIN_FORM_PREFIX}${form.key}`).setTitle(form.title.slice(0, 45));
  for (const f of form.fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label.slice(0, 45)).setStyle(TextInputStyle.Short).setMaxLength(200);
    const current = f.current(s);
    if (current) input.setValue(current); // Discord refuse une valeur pré-remplie vide
    const required = f.type.kind === 'int' || f.type.kind === 'weekday' || (f.type.kind === 'text' && f.type.required) || (f.type.kind === 'channel' && f.type.required);
    input.setRequired(required);
    if (f.help) input.setPlaceholder(f.help);
    if (f.type.kind === 'text') input.setMaxLength(f.type.maxLength);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

/** Analyse et valide les champs saisis. Retourne les valeurs typées ou la liste des erreurs. */
export function parseForm(form: Form, guild: Guild, raw: (id: string) => string): { values: Values; errors: string[] } {
  const values: Values = {};
  const errors: string[] = [];
  for (const f of form.fields) {
    const input = raw(f.id).trim();
    const t = f.type;
    switch (t.kind) {
      case 'int': {
        const n = Number(input);
        if (!/^-?\d+$/.test(input) || n < t.min || n > t.max) errors.push(`**${f.label}** : entier entre ${t.min} et ${t.max} attendu.`);
        else values[f.id] = n;
        break;
      }
      case 'text':
        if (t.required && !input) errors.push(`**${f.label}** : obligatoire.`);
        else values[f.id] = input;
        break;
      case 'channel': {
        if (!input) { if (t.required) errors.push(`**${f.label}** : obligatoire.`); else values[f.id] = null; break; }
        const id = resolveChannelId(guild, input);
        if (!id) errors.push(`**${f.label}** : salon « ${input} » introuvable.`);
        else values[f.id] = id;
        break;
      }
      case 'channels': {
        const ids: string[] = [];
        for (const part of input.split(/[\s,;]+/).filter(Boolean)) {
          const id = resolveChannelId(guild, part);
          if (!id) errors.push(`**${f.label}** : salon « ${part} » introuvable.`);
          else if (!ids.includes(id)) ids.push(id);
        }
        values[f.id] = ids;
        break;
      }
      case 'weekday': {
        const d = parseWeekday(input, t.allowNone);
        if (d === null) errors.push(`**${f.label}** : jour attendu (lundi … dimanche${t.allowNone ? ', ou aucun' : ''}).`);
        else values[f.id] = d;
        break;
      }
    }
  }
  return { values, errors };
}

function resolveChannelId(guild: Guild, input: string): string | null {
  const m = /^<#(\d+)>$/.exec(input) ?? /^(\d{15,22})$/.exec(input);
  const candidate = m ? guild.channels.cache.get(m[1]!) : guild.channels.cache.find((c) => c.name.toLowerCase() === input.replace(/^#/, '').toLowerCase());
  if (!candidate || (candidate.type !== ChannelType.GuildText && candidate.type !== ChannelType.GuildAnnouncement)) return null;
  return candidate.id;
}

function parseWeekday(input: string, allowNone: boolean): number | null {
  const v = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (allowNone && (v === '' || v === '0' || v === 'aucun' || v === 'non')) return 0;
  if (/^[1-7]$/.test(v)) return Number(v);
  const idx = DAYS.findIndex((d) => d && d.startsWith(v.slice(0, 3)) && v.length >= 3);
  return idx > 0 ? idx : null;
}
