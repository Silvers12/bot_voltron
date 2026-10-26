import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention, type GuildMember } from 'discord.js';
import type { GuildSettings, Member, Transaction } from '../../generated/prisma/client.js';
import type { DailyStatus } from '../economy/daily.service.js';
import type { WeeklyStatus } from '../economy/weekly.service.js';
import { formatAmount } from '../settings/settings.service.js';
import { progressFor } from '../progression/levels.service.js';

export const PROFILE_REFRESH_ID = 'profil:refresh';
export const PROFILE_HISTORY_ID = 'profil:history';
export const PROFILE_DAILY_ID = 'profil:daily';
export const PROFILE_WEEKLY_ID = 'profil:weekly';
// Identifiants des écrans de la boutique (définis ici pour éviter un import circulaire avec shop.view)
export const SHOP_OPEN_ID = 'shop:open';
export const INVENTORY_OPEN_ID = 'shop:inventory';

const VOLTRON_COLOR = 0x2e86c1;
const FOOTER = 'Voltron, loutre paladin · Par mon bouclier et mes moustaches !';

export interface ProfileData {
  member: Member;
  guildMember: GuildMember;
  balance: number;
  settings: GuildSettings;
  daily: DailyStatus;
  weekly: WeeklyStatus;
  rank: number;
  /** Message ponctuel affiché sous le profil (résultat d'une action) */
  notice?: string;
}

/** Écran principal du profil : embed + boutons. */
export function buildProfileView({ member, guildMember, balance, settings, daily, weekly, rank, notice }: ProfileData) {
  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setAuthor({ name: `Profil de ${member.displayName}`, iconURL: guildMember.displayAvatarURL({ size: 128 }) })
    .setThumbnail(guildMember.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Bourse', value: `**${formatAmount(balance, settings)}**`, inline: true },
      { name: 'Niveau', value: levelLine(member.xp, settings, rank), inline: true },
      {
        name: 'Dans la compagnie depuis',
        value: member.joinedAt ? time(member.joinedAt, TimestampStyles.LongDate) : 'Inconnu',
        inline: true,
      },
      { name: 'Profil créé', value: time(member.createdAt, TimestampStyles.RelativeTime), inline: true },
      {
        name: 'Récompense du jour',
        value: daily.claimedToday
          ? `Déjà récupérée. La prochaine (**${formatAmount(daily.nextAmount, settings)}**) arrive ${time(daily.nextAt, TimestampStyles.RelativeTime)}.`
          : `**${formatAmount(daily.nextAmount, settings)}** t’attendent !`,
        inline: true,
      },
      {
        name: 'Série',
        value: daily.streak > 0
          ? `🔥 ${daily.streak} jour${daily.streak > 1 ? 's' : ''} d’affilée (+${settings.dailyStreakBonusPercent}% par jour)`
          : 'Aucune série en cours',
        inline: true,
      },
      {
        name: 'Récompense de la semaine',
        value: weekly.claimedThisWeek
          ? `Déjà récupérée. La prochaine arrive ${time(weekly.nextAt, TimestampStyles.RelativeTime)}.`
          : `**${formatAmount(weekly.amount, settings)}** t’attendent !`,
      },
    )
    .setFooter({ text: FOOTER });
  if (notice) embed.setDescription(notice);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PROFILE_DAILY_ID)
      .setLabel(daily.claimedToday ? 'Récompense récupérée' : 'Récupérer ma récompense')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎁')
      .setDisabled(daily.claimedToday),
    new ButtonBuilder()
      .setCustomId(PROFILE_WEEKLY_ID)
      .setLabel(weekly.claimedThisWeek ? 'Hebdo récupérée' : 'Récupérer l’hebdo')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🗓️')
      .setDisabled(weekly.claimedThisWeek),
    new ButtonBuilder().setCustomId(PROFILE_HISTORY_ID).setLabel('Historique').setStyle(ButtonStyle.Primary).setEmoji('📜'),
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SHOP_OPEN_ID).setLabel('Boutique').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
    new ButtonBuilder().setCustomId(INVENTORY_OPEN_ID).setLabel('Inventaire').setStyle(ButtonStyle.Primary).setEmoji('🎒'),
  );

  return { embeds: [embed], components: [row, row2] };
}

function levelLine(xp: number, settings: GuildSettings, rank: number): string {
  const p = progressFor(xp, settings);
  const filled = Math.round((p.current / p.needed) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `**Niveau ${p.level}** · ${rank}ᵉ de la compagnie\n${bar} ${p.current}/${p.needed} XP`;
}

function describeTransaction(t: Transaction): string {
  switch (t.type) {
    case 'WELCOME': return '🎁 bourse de bienvenue';
    case 'DAILY': return '🌅 récompense du jour';
    case 'WEEKLY': return '🗓️ récompense de la semaine';
    case 'PURCHASE': return '🛒 achat';
    case 'REFUND': return '↩️ remboursement';
    case 'BET': return '🎰 mise';
    case 'BET_WIN': return '🎰 gain';
    case 'GROUP_HUG': return '🤗 câlin collectif';
    case 'DUEL_STAKE': return '⚔️ mise de duel';
    case 'DUEL_WIN': return '⚔️ duel gagné';
    case 'DUEL_REFUND': return '⚔️ mise rendue';
    case 'LOTTERY_TICKET': return '🎟️ tickets de tombola';
    case 'LOTTERY_WIN': return '🎟️ tombola gagnée';
    case 'HUG_SENT': return `🤗 câlin à ${t.counterpartyDiscordId ? userMention(t.counterpartyDiscordId) : 'quelqu’un'}`;
    case 'HUG_RECEIVED': return `🤗 câlin de ${t.counterpartyDiscordId ? userMention(t.counterpartyDiscordId) : 'quelqu’un'}`;
    case 'ADMIN_CREDIT': return '🛡️ offert par l’intendance';
    case 'ADMIN_DEBIT': return '🛡️ retiré par l’intendance';
  }
}

/** Écran de l'historique des mouvements de la bourse. */
export function buildHistoryView(member: Member, transactions: Transaction[], balance: number, settings: GuildSettings) {
  const lines = transactions.map((t) => {
    const label = describeTransaction(t);
    const reason = t.reason && !['WELCOME', 'DAILY', 'WEEKLY'].includes(t.type) ? ` · ${t.reason}` : '';
    return `${time(t.createdAt, TimestampStyles.ShortDateTime)} — **${formatAmount(t.delta, settings, { signed: true })}** ${label}${reason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setTitle(`Historique de ${member.displayName}`)
    .setDescription(lines.length ? lines.join('\n') : 'Aucun mouvement pour le moment. Ta bourse attend sa première pièce !')
    .addFields({ name: 'Solde actuel', value: `**${formatAmount(balance, settings)}**` })
    .setFooter({ text: FOOTER });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );

  return { embeds: [embed], components: [row] };
}
