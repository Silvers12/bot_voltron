import {
  ActionRowBuilder, AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, roleMention,
  SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder,
} from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';

export const NOTIFY_TOGGLE_PREFIX = 'notify:toggle:';
export const NOTIFY_SELECT_ID = 'notify:select';
export type NotifyKey = 'hug' | 'lottery' | 'duel';

export const NOTIFY_ROLES: Array<{ key: NotifyKey; field: 'notifyHugRoleId' | 'notifyLotteryRoleId' | 'notifyDuelRoleId'; label: string; emoji: string; roleName: string; description: string }> = [
  { key: 'hug', field: 'notifyHugRoleId', label: 'Câlins collectifs', emoji: '🤗', roleName: 'Câlins collectifs', description: 'quand Voltron ouvre les bras' },
  { key: 'lottery', field: 'notifyLotteryRoleId', label: 'Tombola', emoji: '🎟️', roleName: 'Tombola', description: 'nouvelle tombola, rappels, tirage' },
  { key: 'duel', field: 'notifyDuelRoleId', label: 'Duels', emoji: '⚔️', roleName: 'Duels', description: 'quand un duel est lancé' },
];

export function roleIdFor(s: GuildSettings, key: NotifyKey): string | null {
  return s[NOTIFY_ROLES.find((r) => r.key === key)!.field];
}

const COLOR = 0x2e86c1;
const BANNER_NAME = 'banniere';

const DEFAULT_INTRO = 'Moi, c’est **Voltron**, loutre paladin et gardien de la rivière : j’anime la compagnie. Ici, on gagne des cœurs en participant, on les dépense, on les parie, et on se fait des câlins. Par mon bouclier et mes moustaches, fais comme chez toi !';

const text = (content: string) => new TextDisplayBuilder().setContent(content);
const divider = (large = false) => new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/**
 * Page d'accueil en composants V2 : un conteneur coloré avec la bannière, un titre au nom du serveur,
 * les blocs de présentation séparés par des lignes, et un menu déroulant pour choisir ses notifications.
 */
export function buildWelcomeMessage(s: GuildSettings, guildName: string) {
  const files: AttachmentBuilder[] = [];
  const ext = s.welcomeBannerType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const bannerFile = `${BANNER_NAME}.${ext}`;
  if (s.welcomeBanner) files.push(new AttachmentBuilder(Buffer.from(s.welcomeBanner), { name: bannerFile }));

  const container = new ContainerBuilder().setAccentColor(COLOR);
  if (s.welcomeBanner) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerFile}`)));
  container.addTextDisplayComponents(text(`# Bienvenue sur ${guildName} !\n${(s.welcomeText ?? DEFAULT_INTRO).replaceAll('\\n', '\n')}`));

  const on = (k: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(s, k);
  const blocks: Array<{ name: string; value: string; show: boolean }> = [
    { name: '💰 Ta bourse', value: `**${formatAmount(s.dailyAmount, s)}** chaque jour sur \`/profil\`, bonus de série, et **${formatAmount(s.weeklyAmount, s)}** par semaine. Offre des ${s.currencyPlural} avec \`/calin\`.`, show: on('quotidien') || on('hebdo') || on('calin') },
    { name: '🛒 Boutique', value: 'Objets, rôles et **titres** à porter sur ton profil, depuis `/profil`.', show: on('boutique') },
    { name: '🎲 Jeux', value: [on('blackjack') && '`/blackjack`', on('machine') && '`/machine`', on('duel') && '`/duel`', on('vol') && '`/vol`', on('tombola') && '`/tombola`', on('des') && '`/de` · `/pileouface`'].filter(Boolean).join(' · '), show: on('blackjack') || on('machine') || on('duel') || on('vol') || on('tombola') || on('des') },
    { name: '⭐ Progression', value: 'De l’XP en discutant et en vocal, des niveaux, `/classement`, et des **succès** à débloquer (`/succes`).', show: on('xp') || on('succes') },
    { name: '🤗 Câlins collectifs', value: 'Voltron surgit à l’improviste : cliquez **CÂLIN**, plus vous êtes nombreux, plus ça rapporte.', show: on('calin_collectif') && s.groupHugChannelIds.length > 0 },
    { name: '🔢 Comptage', value: `Dans <#${s.countingChannelId}>, on compte à la suite. Une erreur coûte ${formatAmount(s.countingFine, s)} !`, show: on('comptage') && !!s.countingChannelId },
    { name: '💐 Entre camarades', value: '`/compliment` et `/insulte` (second degré garanti).', show: on('compliments') || on('insultes') },
  ];
  const shown = blocks.filter((b) => b.show && b.value);
  if (shown.length) {
    container.addSeparatorComponents(divider(true));
    container.addTextDisplayComponents(text('## Ce qui t’attend'));
    container.addTextDisplayComponents(text(shown.map((b) => `**${b.name}**\n${b.value}`).join('\n\n')));
  }

  const configured = NOTIFY_ROLES.filter((r) => s[r.field]);
  container.addSeparatorComponents(divider(true));
  container.addTextDisplayComponents(
    text(
      `## 🔔 Être prévenu\n` +
        (configured.length
          ? 'Choisis dans le menu ce pour quoi Voltron doit te mentionner. Tu peux revenir changer d’avis quand tu veux.\n' + configured.map((r) => `${r.emoji} **${r.label}** · ${r.description} · ${roleMention(s[r.field]!)}`).join('\n')
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
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(text('-# Voltron, loutre paladin · Par mon bouclier et mes moustaches !'));

  return { components: [container], files, flags: MessageFlags.IsComponentsV2 as const };
}
