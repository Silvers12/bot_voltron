import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, StringSelectMenuBuilder, ThumbnailBuilder, time, TimestampStyles, userMention, type GuildMember, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings, Member, MemberAchievement, ShopItem, Transaction } from '../../generated/prisma/client.js';
import type { DailyStatus } from '../economy/daily.service.js';
import type { WeeklyStatus } from '../economy/weekly.service.js';
import { formatAmount } from '../settings/settings.service.js';
import { progressFor } from '../progression/levels.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { badgeLine, PROFILE_ACHIEVEMENTS_ID } from '../achievements/achievements.view.js';
import { card, clampLines, divider, screen, text } from '../../discord/v2.js';

export const PROFILE_REFRESH_ID = 'profil:refresh';
export const PROFILE_HISTORY_ID = 'profil:history';
export const PROFILE_DAILY_ID = 'profil:daily';
export const PROFILE_WEEKLY_ID = 'profil:weekly';
export const PROFILE_NAV_ID = 'profil:nav';
// Identifiants des écrans de la boutique (définis ici pour éviter un import circulaire avec shop.view)
export const SHOP_OPEN_ID = 'shop:open';
export const INVENTORY_OPEN_ID = 'shop:inventory';

const SIGNATURE = '-# Voltron, loutre paladin · Par mon bouclier et mes moustaches !';

export interface ProfileData {
  member: Member;
  guildMember: GuildMember;
  balance: number;
  settings: GuildSettings;
  daily: DailyStatus;
  weekly: WeeklyStatus;
  rank: number;
  achievements: MemberAchievement[];
  title: ShopItem | null;
  /** Message ponctuel affiché sous le profil (résultat d'une action) */
  notice?: string;
}

/** Écran principal du profil. */
export function buildProfileView({ member, guildMember, balance, settings, daily, weekly, rank, achievements, title, notice }: ProfileData) {
  const c = card();
  const header = [
    `# ${member.displayName}`,
    title ? `${title.emoji ? title.emoji + ' ' : '🏷️ '}**${title.name}**` : '',
    `Dans la compagnie depuis ${member.joinedAt ? time(member.joinedAt, TimestampStyles.LongDate) : 'un moment'} · profil créé ${time(member.createdAt, TimestampStyles.RelativeTime)}`,
  ].filter(Boolean).join('\n');
  c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(header)).setThumbnailAccessory(new ThumbnailBuilder().setURL(guildMember.displayAvatarURL({ size: 256 }))));
  if (notice) c.addTextDisplayComponents(text(`> ${notice}`));
  c.addSeparatorComponents(divider(true));

  c.addTextDisplayComponents(text(`💰 **Bourse** · **${formatAmount(balance, settings)}**\n${levelLine(member.xp, settings, rank)}`));

  const rewards: string[] = [];
  if (isFeatureEnabled(settings, 'quotidien')) {
    rewards.push(
      daily.claimedToday
        ? `🎁 **Récompense du jour** · déjà récupérée, la prochaine (**${formatAmount(daily.nextAmount, settings)}**) arrive ${time(daily.nextAt, TimestampStyles.RelativeTime)}`
        : `🎁 **Récompense du jour** · **${formatAmount(daily.nextAmount, settings)}** t’attendent !`,
      daily.streak > 0 ? `🔥 Série de **${daily.streak} jour${daily.streak > 1 ? 's' : ''}** (+${settings.dailyStreakBonusPercent} % par jour)` : '🔥 Aucune série en cours',
    );
  }
  if (isFeatureEnabled(settings, 'hebdo')) {
    rewards.push(
      weekly.claimedThisWeek
        ? `🗓️ **Récompense de la semaine** · déjà récupérée, la prochaine arrive ${time(weekly.nextAt, TimestampStyles.RelativeTime)}`
        : `🗓️ **Récompense de la semaine** · **${formatAmount(weekly.amount, settings)}** t’attendent !`,
    );
  }
  if (rewards.length) { c.addSeparatorComponents(divider()); c.addTextDisplayComponents(text(rewards.join('\n'))); }
  if (isFeatureEnabled(settings, 'succes')) { c.addSeparatorComponents(divider()); c.addTextDisplayComponents(text(`🏅 **Badges** · ${badgeLine(achievements)}`)); }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  if (isFeatureEnabled(settings, 'quotidien')) {
    row.addComponents(new ButtonBuilder().setCustomId(PROFILE_DAILY_ID).setLabel(daily.claimedToday ? 'Récompense récupérée' : 'Récupérer ma récompense').setStyle(ButtonStyle.Success).setEmoji('🎁').setDisabled(daily.claimedToday));
  }
  if (isFeatureEnabled(settings, 'hebdo')) {
    row.addComponents(new ButtonBuilder().setCustomId(PROFILE_WEEKLY_ID).setLabel(weekly.claimedThisWeek ? 'Hebdo récupérée' : 'Récupérer l’hebdo').setStyle(ButtonStyle.Success).setEmoji('🗓️').setDisabled(weekly.claimedThisWeek));
  }
  row.addComponents(new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'));

  const nav = new StringSelectMenuBuilder().setCustomId(PROFILE_NAV_ID).setPlaceholder('Explorer…').addOptions(
    { label: 'Historique', value: 'history', description: 'Les derniers mouvements de ta bourse', emoji: '📜' },
    ...(isFeatureEnabled(settings, 'boutique') ? [
      { label: 'Boutique', value: 'shop', description: 'Objets, rôles et titres à acheter', emoji: '🛒' },
      { label: 'Inventaire', value: 'inventory', description: 'Ce que tu possèdes, titre porté', emoji: '🎒' },
    ] : []),
    ...(isFeatureEnabled(settings, 'succes') ? [{ label: 'Succès', value: 'achievements', description: 'Badges débloqués et à débloquer', emoji: '🏅' }] : []),
    { label: 'Statistiques', value: 'stats', description: 'Tes chiffres de jeu et d’activité', emoji: '📊' },
  );
  const rows = [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(nav), row];

  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(SIGNATURE));
  return screen(c, rows);
}

function levelLine(xp: number, settings: GuildSettings, rank: number): string {
  const p = progressFor(xp, settings);
  const filled = Math.round((p.current / p.needed) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `⭐ **Niveau ${p.level}** · ${rank}ᵉ de la compagnie\n\`${bar}\` ${p.current}/${p.needed} XP`;
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
    case 'ACHIEVEMENT': return '🏅 succès débloqué';
    case 'COUNTING_FINE': return '🔢 amende de comptage';
  }
}

/** Écran de l'historique des mouvements de la bourse. */
export function buildHistoryView(member: Member, transactions: Transaction[], balance: number, settings: GuildSettings) {
  const lines = transactions.map((t) => {
    const label = describeTransaction(t);
    const reason = t.reason && !['WELCOME', 'DAILY', 'WEEKLY'].includes(t.type) ? ` · ${t.reason}` : '';
    return `${time(t.createdAt, TimestampStyles.ShortDateTime)} — **${formatAmount(t.delta, settings, { signed: true })}** ${label}${reason}`;
  });
  const c = card();
  c.addTextDisplayComponents(text(`# 📜 Historique de ${member.displayName}`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(lines.length ? clampLines(lines) : 'Aucun mouvement pour le moment. Ta bourse attend sa première pièce !'));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`💰 **Solde actuel** · **${formatAmount(balance, settings)}**`));
  return screen(c, [backRow()]);
}

export function backRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );
}
