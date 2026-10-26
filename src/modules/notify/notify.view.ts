import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, roleMention } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';

export const NOTIFY_TOGGLE_PREFIX = 'notify:toggle:';
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

/**
 * Page d'accueil : bannière (si fournie), présentation en blocs, puis le bloc des notifications
 * avec ses boutons. La bannière est jointe au message et référencée par `attachment://`.
 */
export function buildWelcomeMessage(s: GuildSettings, guildName: string) {
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];

  const ext = s.welcomeBannerType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const bannerFile = `${BANNER_NAME}.${ext}`;
  if (s.welcomeBanner) files.push(new AttachmentBuilder(Buffer.from(s.welcomeBanner), { name: bannerFile }));

  const intro = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`Bienvenue sur ${guildName} !`)
    .setDescription((s.welcomeText ?? DEFAULT_INTRO).replaceAll('\\n', '\n'));
  if (s.welcomeBanner) intro.setImage(`attachment://${bannerFile}`);
  embeds.push(intro);

  const on = (k: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(s, k);
  const blocks: Array<{ name: string; value: string; show: boolean }> = [
    { name: '💰 Ta bourse', value: `**${formatAmount(s.dailyAmount, s)}** chaque jour sur \`/profil\`, bonus de série, et **${formatAmount(s.weeklyAmount, s)}** par semaine. Offre des ${s.currencyPlural} avec \`/calin\`.`, show: on('quotidien') || on('hebdo') || on('calin') },
    { name: '🛒 Boutique', value: 'Objets, rôles et **titres** à porter sur ton profil, depuis `/profil`.', show: on('boutique') },
    { name: '🎲 Jeux', value: [on('blackjack') && '`/blackjack`', on('machine') && '`/machine`', on('duel') && '`/duel`', on('tombola') && '`/tombola`'].filter(Boolean).join(' · '), show: on('blackjack') || on('machine') || on('duel') || on('tombola') },
    { name: '⭐ Progression', value: 'De l’XP en discutant et en vocal, des niveaux, `/classement`, et des **succès** à débloquer (`/succes`).', show: on('xp') || on('succes') },
    { name: '🤗 Câlins collectifs', value: 'Voltron surgit à l’improviste : cliquez **CÂLIN**, plus vous êtes nombreux, plus ça rapporte.', show: on('calin_collectif') && s.groupHugChannelIds.length > 0 },
    { name: '🔢 Comptage', value: `Dans <#${s.countingChannelId}>, on compte à la suite. Une erreur coûte ${formatAmount(s.countingFine, s)} !`, show: on('comptage') && !!s.countingChannelId },
    { name: '💐 Entre camarades', value: '`/compliment` et `/insulte` (second degré garanti).', show: on('compliments') || on('insultes') },
  ];
  const shown = blocks.filter((b) => b.show && b.value);
  if (shown.length) {
    embeds.push(new EmbedBuilder().setColor(COLOR).setTitle('Ce qui t’attend').addFields(shown.map((b) => ({ name: b.name, value: b.value, inline: true }))));
  }

  embeds.push(
    new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🔔 Être prévenu')
      .setDescription(
        [
          'Un clic prend le rôle, un second le retire.',
          '',
          ...NOTIFY_ROLES.map((r) => `${r.emoji} **${r.label}** · ${r.description}${s[r.field] ? ` · ${roleMention(s[r.field]!)}` : ''}`),
        ].join('\n'),
      )
      .setFooter({ text: 'Voltron, loutre paladin' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...NOTIFY_ROLES.map((r) =>
      new ButtonBuilder().setCustomId(`${NOTIFY_TOGGLE_PREFIX}${r.key}`).setLabel(r.label).setStyle(ButtonStyle.Primary).setEmoji(r.emoji).setDisabled(!s[r.field]),
    ),
  );
  return { embeds, components: [row], files };
}
