import { ActionRowBuilder, ButtonBuilder, ButtonStyle, channelMention, EmbedBuilder, roleMention, StringSelectMenuBuilder, time, TimestampStyles } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { FEATURES, featureInfo, isFeatureEnabled, type FeatureKey } from '../features/features.js';
import { ADMIN_EDIT_PREFIX, formsForModule } from './panel.forms.js';

export const ADMIN_FEATURES_SELECT_ID = 'admin:features';
export const ADMIN_MODULE_SELECT_ID = 'admin:module';
export const ADMIN_HOME_ID = 'admin:home';
export const ADMIN_REFRESH_ID = 'admin:refresh';
export const ADMIN_CLOSE_ID = 'admin:close';
export const ADMIN_TOGGLE_PREFIX = 'admin:toggle:';
export const ADMIN_MODULE_PREFIX = 'admin:open:';

const COLOR = 0xc0392b;
const FOOTER = 'Intendance de Voltron · panneau réservé, se ferme après 5 min d’inactivité';

export type ModuleKey = 'economie' | 'progression' | 'boutique' | 'casino' | 'duel' | 'calin_collectif' | 'tombola' | 'textes';

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  emoji: string;
  features: FeatureKey[];
}

export const MODULES: ModuleInfo[] = [
  { key: 'economie', label: 'Économie', emoji: '💰', features: ['quotidien', 'hebdo', 'calin'] },
  { key: 'progression', label: 'XP et niveaux', emoji: '⭐', features: ['xp'] },
  { key: 'boutique', label: 'Boutique', emoji: '🛒', features: ['boutique'] },
  { key: 'casino', label: 'Casino', emoji: '🎰', features: ['blackjack', 'machine'] },
  { key: 'duel', label: 'Duels', emoji: '⚔️', features: ['duel'] },
  { key: 'calin_collectif', label: 'Câlin collectif', emoji: '🫂', features: ['calin_collectif'] },
  { key: 'tombola', label: 'Tombola', emoji: '🎟️', features: ['tombola'] },
  { key: 'textes', label: 'Compliments et insultes', emoji: '💐', features: ['compliments', 'insultes'] },
];

export function moduleInfo(key: ModuleKey): ModuleInfo {
  return MODULES.find((m) => m.key === key)!;
}

export interface Overview {
  members: number;
  accounts: number;
  circulation: number;
  richest: number;
  slotPool: number;
  lottery: { pot: number; tickets: number; drawAt: Date } | null;
  nextHug: Date | null;
  openHug: boolean;
  pendingDuels: number;
  activeGames: number;
}

function featureLine(s: GuildSettings, key: FeatureKey): string {
  const f = featureInfo(key);
  return `${isFeatureEnabled(s, key) ? '🟢' : '⛔'} ${f.emoji} ${f.label}`;
}

/** Écran d'accueil : vue d'ensemble, état des fonctionnalités, menus. */
export function buildHomeView(s: GuildSettings, o: Overview, notice?: string) {
  const half = Math.ceil(FEATURES.length / 2);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🛡️ Intendance de Voltron')
    .addFields(
      {
        name: 'Compagnie',
        value: [
          `Membres présents : **${o.members}**`,
          `Bourses ouvertes : **${o.accounts}**`,
          `En circulation : **${formatAmount(o.circulation, s)}**`,
          `Plus grosse bourse : **${formatAmount(o.richest, s)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'En ce moment',
        value: [
          `🎰 Cagnotte machine : **${formatAmount(o.slotPool, s)}**`,
          o.lottery ? `🎟️ Tombola : **${formatAmount(o.lottery.pot, s)}**, ${o.lottery.tickets} ticket(s), tirage ${time(o.lottery.drawAt, TimestampStyles.RelativeTime)}` : '🎟️ Tombola : inactive',
          o.openHug ? '🫂 Câlin collectif **en cours**' : o.nextHug ? `🫂 Prochain câlin collectif ${time(o.nextHug, TimestampStyles.RelativeTime)}` : '🫂 Câlin collectif : aucun salon',
          `🃏 Parties de blackjack en cours : **${o.activeGames}** · ⚔️ duels en attente : **${o.pendingDuels}**`,
        ].join('\n'),
        inline: true,
      },
      { name: 'Fonctionnalités', value: FEATURES.slice(0, half).map((f) => featureLine(s, f.key)).join('\n'), inline: true },
      { name: '​', value: FEATURES.slice(half).map((f) => featureLine(s, f.key)).join('\n'), inline: true },
    )
    .setFooter({ text: FOOTER });
  if (notice) embed.setDescription(notice);

  const features = new StringSelectMenuBuilder()
    .setCustomId(ADMIN_FEATURES_SELECT_ID)
    .setPlaceholder('Cocher les fonctionnalités actives')
    .setMinValues(0)
    .setMaxValues(FEATURES.length)
    .addOptions(FEATURES.map((f) => ({ label: f.label, value: f.key, description: f.description, emoji: f.emoji, default: isFeatureEnabled(s, f.key) })));
  const modules = new StringSelectMenuBuilder()
    .setCustomId(ADMIN_MODULE_SELECT_ID)
    .setPlaceholder('Voir les réglages d’un module')
    .addOptions(MODULES.map((m) => ({ label: m.label, value: m.key, emoji: m.emoji })));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ADMIN_REFRESH_ID).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId(ADMIN_CLOSE_ID).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(features),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modules),
      buttons,
    ],
  };
}

export interface ModuleDetails {
  /** Lignes « réglage : valeur » */
  lines: string[];
  /** Commandes pour modifier */
  commands: string[];
}

/** Écran d'un module : réglages, commandes, interrupteurs. */
export function buildModuleView(s: GuildSettings, module: ModuleInfo, details: ModuleDetails, notice?: string) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${module.emoji} ${module.label}`)
    .addFields(
      { name: 'État', value: module.features.map((k) => featureLine(s, k)).join('\n') },
      { name: 'Réglages', value: details.lines.join('\n') || '*Aucun réglage*' },
      { name: 'Pour modifier', value: [...formsForModule(module.key).map((f) => `✏️ bouton **${f.button}** ci-dessous`), ...details.commands.map((c) => `\`${c}\``)].join('\n') || '*Rien à modifier*' },
    )
    .setFooter({ text: FOOTER });
  if (notice) embed.setDescription(notice);

  const toggles = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...module.features.map((k) => {
      const enabled = isFeatureEnabled(s, k);
      const f = featureInfo(k);
      return new ButtonBuilder()
        .setCustomId(`${ADMIN_TOGGLE_PREFIX}${module.key}:${k}`)
        .setLabel(`${enabled ? 'Désactiver' : 'Activer'} ${f.label.toLowerCase()}`)
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(f.emoji);
    }),
  );
  const forms = formsForModule(module.key);
  const edits = forms.length
    ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...forms.map((f) => new ButtonBuilder().setCustomId(`${ADMIN_EDIT_PREFIX}${f.key}`).setLabel(`Modifier : ${f.button}`).setStyle(ButtonStyle.Primary).setEmoji('✏️')))]
    : [];
  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ADMIN_HOME_ID).setLabel('Accueil').setStyle(ButtonStyle.Secondary).setEmoji('🏠'),
    new ButtonBuilder().setCustomId(`${ADMIN_MODULE_PREFIX}${module.key}`).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId(ADMIN_CLOSE_ID).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return { embeds: [embed], components: [toggles, ...edits, nav] };
}

export function buildClosedView() {
  return { embeds: [new EmbedBuilder().setColor(COLOR).setDescription('Panneau fermé. `/admin panneau` pour le rouvrir.')], components: [] };
}

export { channelMention, roleMention };
