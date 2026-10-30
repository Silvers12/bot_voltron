import {
  ActionRowBuilder, AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, roleMention,
  SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { MENTIONS } from './mentions.js';
import { renderNotifyBanner } from './notify.image.js';

import { botBannerUrl, botName } from '../../core/identity.js';
export const NOTIFY_TOGGLE_PREFIX = 'notify:toggle:';
export const NOTIFY_SELECT_ID = 'notify:select';
export const MENTIONS_SELECT_ID = 'notify:mentions';
export type NotifyKey = 'hug' | 'lottery' | 'duel';

export const NOTIFY_ROLES: Array<{ key: NotifyKey; field: 'notifyHugRoleId' | 'notifyLotteryRoleId' | 'notifyDuelRoleId'; label: string; emoji: string; roleName: string; description: string }> = [
  { key: 'hug', field: 'notifyHugRoleId', label: 'Câlins collectifs', emoji: '🤗', roleName: 'Câlins collectifs', description: `quand ${botName()} ouvre les bras` },
  { key: 'lottery', field: 'notifyLotteryRoleId', label: 'Tombola', emoji: '🎟️', roleName: 'Tombola', description: 'nouvelle tombola, rappels, tirage' },
  { key: 'duel', field: 'notifyDuelRoleId', label: 'Duels', emoji: '⚔️', roleName: 'Duels', description: 'quand un duel est lancé' },
];

export function roleIdFor(s: GuildSettings, key: NotifyKey): string | null {
  return s[NOTIFY_ROLES.find((r) => r.key === key)!.field];
}

const COLOR = 0x2e86c1;
const BANNER_NAME = 'banniere';

const DEFAULT_INTRO = `Moi, c’est **${botName()}**, la petite loutre du serveur : j’anime la compagnie. Ici, on gagne des cœurs en participant, on les dépense, on les parie, et on se fait des câlins. Fais comme chez toi, et viens me faire un câlin !`;

const text = (content: string) => new TextDisplayBuilder().setContent(content);
const divider = (large = false) => new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/**
 * Page d'accueil en composants V2 : un conteneur coloré avec la bannière, un titre au nom du serveur,
 * les blocs de présentation séparés par des lignes. Sans salon de notifications dédié, le menu des rôles est inclus ici.
 */
export function buildWelcomeMessage(s: GuildSettings, guildName: string) {
  const files: AttachmentBuilder[] = [];
  const ext = s.welcomeBannerType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const bannerFile = `${BANNER_NAME}.${ext}`;
  if (s.welcomeBanner) files.push(new AttachmentBuilder(Buffer.from(s.welcomeBanner), { name: bannerFile }));

  const container = new ContainerBuilder().setAccentColor(COLOR);
  // Bannière : l'image envoyée par /admin accueil banniere, sinon celle du bot sur le portail Discord
  const bannerUrl = s.welcomeBanner ? `attachment://${bannerFile}` : botBannerUrl();
  if (bannerUrl) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)));
  container.addTextDisplayComponents(text(`# Bienvenue sur ${guildName} !\n${(s.welcomeText ?? DEFAULT_INTRO).replaceAll('\\n', '\n')}`));

  const on = (k: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(s, k);
  const surprise = s.countingRewardEvery > 0 && s.countingRewardMax > 0 ? ` De temps en temps, un bon nombre cache une surprise de ${formatAmount(s.countingRewardMin, s)} à ${formatAmount(s.countingRewardMax, s)}.` : '';
  const blocks: Array<{ name: string; value: string; show: boolean }> = [
    { name: '🦦 Ton profil', value: '`/profil` : ta bourse, tes récompenses, ta boutique, ton inventaire, tes succès, tes stats, ton historique et le **guide de toutes les commandes** (menu Explorer). `/profil membre:` montre la fiche publique de quelqu’un.', show: true },
    { name: '💰 Ta bourse', value: `**${formatAmount(s.dailyAmount, s)}** chaque jour sur \`/profil\`, bonus de série, et **${formatAmount(s.weeklyAmount, s)}** par semaine. Offre des ${s.currencyPlural} avec \`/calin\`${on('boutique') ? ', un objet avec `/don`' : ''}.`, show: on('quotidien') || on('hebdo') || on('calin') },
    { name: '🛒 Boutique', value: 'Objets absurdes, rôles et **titres** à porter sur ton profil, depuis `/profil`. Les objets s’offrent avec `/don`.', show: on('boutique') },
    { name: '🎲 Jeux', value: [on('blackjack') && '`/blackjack` contre la banque', on('machine') && '`/machine` et sa cagnotte', on('duel') && '`/duel` avec mise', on('vol') && '`/vol` (une chance sur deux, et ça peut coûter cher)', on('tombola') && '`/tombola` chaque semaine', on('des') && '`/de` · `/pileouface`'].filter(Boolean).join(' · '), show: on('blackjack') || on('machine') || on('duel') || on('vol') || on('tombola') || on('des') },
    { name: '🧸 Taux du jour', value: '`/taux` : ta chance, ta choupitude et le reste, renouvelés chaque jour. `/duo` pour vous deux.', show: on('taux') },
    { name: '⭐ Progression', value: 'De l’XP en discutant et en vocal, des niveaux et leurs rôles, `/classement`, `/stats`, et des **succès** à débloquer (`/succes`).', show: on('xp') || on('succes') },
    { name: '🤗 Câlins collectifs', value: `${botName()} surgit à l’improviste : cliquez **CÂLIN**, plus vous êtes nombreux, plus ça rapporte.`, show: on('calin_collectif') && s.groupHugChannelIds.length > 0 },
    { name: '🔢 Comptage', value: `Dans <#${s.countingChannelId}>, on compte à la suite (les petites formules sont acceptées), jamais deux fois d’affilée. Une erreur coûte ${formatAmount(s.countingFine, s)}, puis pile ou face : on continue ou on repart à 1.${surprise} Modifier son message après coup envoie en **prison** : ${s.prisonMinutes} min sans aucun jeu.`, show: on('comptage') && !!s.countingChannelId },
    { name: '💐 Entre camarades', value: '`/compliment` et `/insulte` (second degré garanti), avec des raretés à collectionner.', show: on('compliments') || on('insultes') },
    { name: '🎵 Musique', value: `\`/youtube play\` dans un vocal : vidéos, playlists ou recherches YouTube, avec un lecteur à boutons.${s.djRoleId ? ` Réservé au rôle <@&${s.djRoleId}>.` : ''}`, show: on('musique') },
  ];
  const shown = blocks.filter((b) => b.show && b.value);
  if (shown.length) {
    container.addSeparatorComponents(divider(true));
    container.addTextDisplayComponents(text('## Ce qui t’attend'));
    container.addTextDisplayComponents(text(shown.map((b) => `**${b.name}**\n${b.value}`).join('\n\n')));
  }

  if (s.notifyChannelId) {
    container.addSeparatorComponents(divider(true));
    container.addTextDisplayComponents(text(`## 🔔 Être prévenu\nChoisis tes notifications dans <#${s.notifyChannelId}>.`));
  } else {
    addNotifyBlock(container, s);
  }
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text(`-# ${botName()}, petite loutre du serveur · Un câlin ? 🦦`));

  return { components: [container], files, flags: MessageFlags.IsComponentsV2 as const };
}

/** Bloc « Être prévenu » : explication, liste des rôles et menu à choix multiples. */
function addNotifyBlock(container: ContainerBuilder, s: GuildSettings) {
  const configured = NOTIFY_ROLES.filter((r) => s[r.field]);
  container.addSeparatorComponents(divider(true));
  container.addTextDisplayComponents(
    text(
      `## 🔔 Être prévenu\n` +
        (configured.length
          ? `Choisis dans le menu ce pour quoi ${botName()} doit te mentionner. Tu peux revenir changer d’avis quand tu veux.\n` + configured.map((r) => `${r.emoji} **${r.label}** · ${r.description} · ${roleMention(s[r.field]!)}`).join('\n')
          : '*Les rôles de notification ne sont pas encore configurés.*'),
    ),
  );
  if (configured.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(NOTIFY_SELECT_ID)
      .setPlaceholder('Mes notifications…')
      .setMinValues(0)
      .setMaxValues(configured.length)
      .addOptions(configured.map((r) => new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.key).setDescription(r.description).setEmoji(r.emoji)));
    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  addMentionsBlock(container);
}

/** Bloc « Mentions à propos de toi » : tout ce pour quoi le bot peut te mentionner personnellement, à garder ou refuser. */
function addMentionsBlock(container: ContainerBuilder) {
  container.addSeparatorComponents(divider(true));
  container.addTextDisplayComponents(
    text(
      `## 📣 Mentions à propos de toi\n` +
        `${botName()} te mentionne aussi quand quelque chose te concerne directement. Garde coché ce que tu veux recevoir, décoche le reste : le message reste visible, mais tu n’es plus notifié.\n` +
        MENTIONS.map((m) => `${m.emoji} **${m.label}** · ${m.description}`).join('\n'),
    ),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(MENTIONS_SELECT_ID)
    .setPlaceholder('Mentions à garder…')
    .setMinValues(0)
    .setMaxValues(MENTIONS.length)
    .addOptions(MENTIONS.map((m) => new StringSelectMenuOptionBuilder().setLabel(m.label).setValue(m.key).setDescription(m.description).setEmoji(m.emoji)));
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
}

/** Page des notifications, publiée dans son propre salon : uniquement le choix des rôles. */
export async function buildNotifyMessage(s: GuildSettings) {
  const container = new ContainerBuilder().setAccentColor(COLOR);
  const banner = await renderNotifyBanner();
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://notifications.png').setDescription('Notifications : choisis ce que tu reçois')));
  addNotifyBlock(container, s);
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text(`-# ${botName()}, petite loutre du serveur · Un câlin ? 🦦`));
  return { components: [container], files: [new AttachmentBuilder(banner, { name: 'notifications.png' })], flags: MessageFlags.IsComponentsV2 as const };
}
