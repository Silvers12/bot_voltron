import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, roleMention } from 'discord.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

export const NOTIFY_TOGGLE_PREFIX = 'notify:toggle:';
export type NotifyKey = 'hug' | 'lottery' | 'duel';

export const NOTIFY_ROLES: Array<{ key: NotifyKey; field: 'notifyHugRoleId' | 'notifyLotteryRoleId' | 'notifyDuelRoleId'; label: string; emoji: string; roleName: string; description: string }> = [
  { key: 'hug', field: 'notifyHugRoleId', label: 'Câlins collectifs', emoji: '🤗', roleName: 'Câlins collectifs', description: 'être prévenu quand Voltron ouvre les bras' },
  { key: 'lottery', field: 'notifyLotteryRoleId', label: 'Tombola', emoji: '🎟️', roleName: 'Tombola', description: 'nouvelle tombola, rappels et tirages' },
  { key: 'duel', field: 'notifyDuelRoleId', label: 'Duels', emoji: '⚔️', roleName: 'Duels', description: 'être prévenu quand un duel est lancé' },
];

export function roleIdFor(s: GuildSettings, key: NotifyKey): string | null {
  return s[NOTIFY_ROLES.find((r) => r.key === key)!.field];
}

/** Message d'accueil : présentation de Voltron et boutons pour prendre ou retirer les rôles de notification. */
export function buildWelcomeMessage(s: GuildSettings) {
  const embed = new EmbedBuilder()
    .setColor(0x2e86c1)
    .setTitle('🦦 Bienvenue chez Voltron, loutre paladin')
    .setDescription(
      [
        `Chaque membre a une bourse de **${s.currencyPlural}** ${s.currencySymbol} : récompense chaque jour sur \`/profil\`, câlins entre membres avec \`/calin\`, boutique, succès et titres.`,
        'Pour les joueurs : `/blackjack`, `/machine`, `/duel`, `/tombola`, et des câlins collectifs qui surgissent quand on ne s’y attend pas. `/classement` pour voir qui anime le plus la compagnie.',
        '',
        '**Choisis ce pour quoi tu veux être prévenu.** Un clic prend le rôle, un second le retire.',
        ...NOTIFY_ROLES.map((r) => `${r.emoji} **${r.label}** · ${r.description}${s[r.field] ? ` · ${roleMention(s[r.field]!)}` : ' · *(non configuré)*'}`),
      ].join('\n'),
    )
    .setFooter({ text: `Par mon bouclier et mes moustaches ! · Récompense du jour : ${formatAmount(s.dailyAmount, s)}` });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...NOTIFY_ROLES.map((r) =>
      new ButtonBuilder().setCustomId(`${NOTIFY_TOGGLE_PREFIX}${r.key}`).setLabel(r.label).setStyle(ButtonStyle.Primary).setEmoji(r.emoji).setDisabled(!s[r.field]),
    ),
  );
  return { embeds: [embed], components: [row] };
}
