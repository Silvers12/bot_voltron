import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { isFeatureEnabled } from '../features/features.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import { PROFILE_REFRESH_ID } from '../community/profile.view.js';
import { ADMIN_CATEGORY, HELP_CATEGORIES, type HelpCategory, type HelpEntry } from './help.catalog.js';

export const HELP_SELECT_ID = 'profil:help';
export const HELP_INDEX_ID = 'profil:helpindex';

/** Identifiants des commandes du serveur (nom → id) pour les rendre cliquables. */
export type CommandIds = ReadonlyMap<string, string>;

function visibleEntries(cat: HelpCategory, s: GuildSettings): HelpEntry[] {
  return cat.entries.filter((e) => (!e.feature || isFeatureEnabled(s, e.feature)) && (!e.show || e.show(s)));
}

export function helpCategories(s: GuildSettings, admin: boolean): HelpCategory[] {
  return [...HELP_CATEGORIES, ...(admin ? [ADMIN_CATEGORY] : [])].filter((c) => visibleEntries(c, s).length > 0);
}

function mention(e: HelpEntry, ids: CommandIds): string {
  const id = ids.get(e.command);
  const isSlash = /^[a-z]+$/.test(e.command);
  const subOk = (v: string) => /^[a-z]+( [a-z]+)?$/.test(v);
  if (!isSlash) return `**${e.command}**`;
  const sub = e.sub && subOk(e.sub) ? e.sub : null;
  const label = sub ? `/${e.command} ${sub}` : `/${e.command}`;
  const link = id ? (sub ? `</${e.command} ${sub}:${id}>` : `</${e.command}:${id}>`) : `\`${label}\``;
  const extra = e.sub && !sub ? ` → *${e.sub}*` : '';
  return `${link}${extra}${e.args ? ` \`${e.args}\`` : ''}`;
}

function menuRow(s: GuildSettings, admin: boolean, current?: string) {
  const menu = new StringSelectMenuBuilder().setCustomId(HELP_SELECT_ID).setPlaceholder('Choisir une rubrique…').addOptions(
    helpCategories(s, admin).map((c) => ({ label: c.label, value: c.key, description: c.blurb, emoji: c.emoji, default: c.key === current })),
  );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}

function buttonsRow(withIndex: boolean) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  if (withIndex) row.addComponents(new ButtonBuilder().setCustomId(HELP_INDEX_ID).setLabel('Sommaire').setStyle(ButtonStyle.Secondary).setEmoji('📖'));
  row.addComponents(new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'));
  return row;
}

/** Sommaire du guide : une ligne par rubrique, le menu pour en ouvrir une. */
export function buildHelpIndex(s: GuildSettings, admin: boolean) {
  const cats = helpCategories(s, admin);
  const c = card();
  c.addTextDisplayComponents(text('# 📖 Guide des commandes\nTout ce que Voltron sait faire, rangé par rubrique. Choisis-en une dans le menu ; les commandes y sont cliquables.'));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(cats.map((cat) => `${cat.emoji} **${cat.label}** · ${cat.blurb}\n-# ${visibleEntries(cat, s).map((e) => (/^[a-z]+$/.test(e.command) ? `/${e.command}${e.sub && /^[a-z]+( [a-z]+)?$/.test(e.sub) ? ` ${e.sub}` : ''}` : e.command)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}`).join('\n\n')));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text('-# Les commandes se lancent dans les salons prévus pour Voltron. Les rubriques en pause n’apparaissent pas.'));
  return screen(c, [menuRow(s, admin), buttonsRow(false)]);
}

/** Écran d'une rubrique : intro, puis une commande par bloc avec son explication. */
export function buildHelpCategory(s: GuildSettings, admin: boolean, key: string, ids: CommandIds) {
  const cat = helpCategories(s, admin).find((c) => c.key === key);
  if (!cat) return buildHelpIndex(s, admin);
  const c = card();
  c.addTextDisplayComponents(text(`# ${cat.emoji} ${cat.label}\n${cat.intro(s)}`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(visibleEntries(cat, s).map((e) => `${mention(e, ids)}\n${e.describe(s)}`).join('\n\n')));
  return screen(c, [menuRow(s, admin, key), buttonsRow(true)]);
}
