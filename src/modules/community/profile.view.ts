import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, StringSelectMenuBuilder, time, TimestampStyles, userMention, type GuildMember, type MessageActionRowComponentBuilder } from 'discord.js';
import type { GuildSettings, Member, MemberAchievement, ShopItem, Transaction } from '../../generated/prisma/client.js';
import type { DailyStatus } from '../economy/daily.service.js';
import type { WeeklyStatus } from '../economy/weekly.service.js';
import { formatAmount } from '../settings/settings.service.js';
import { progressFor } from '../progression/levels.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { badgeLine, PROFILE_ACHIEVEMENTS_ID } from '../achievements/achievements.view.js';
import { card, divider, imageScreen, screen, text } from '../../discord/v2.js';
import { renderListCard, type ListLine } from '../../core/listimage.js';

import { botName } from '../../core/identity.js';
export const PROFILE_REFRESH_ID = 'profil:refresh';
export const PROFILE_HISTORY_ID = 'profil:history';
export const PROFILE_DAILY_ID = 'profil:daily';
export const PROFILE_WEEKLY_ID = 'profil:weekly';
export const PROFILE_NAV_ID = 'profil:nav';
// Identifiants des écrans de la boutique (définis ici pour éviter un import circulaire avec shop.view)
export const SHOP_OPEN_ID = 'shop:open';
export const INVENTORY_OPEN_ID = 'shop:inventory';

const SIGNATURE = `-# ${botName()}, loutre paladin · Par mon bouclier et mes moustaches !`;

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
  /** Bannière générée (avatar, titre, niveau, bourse) */
  image: Buffer;
}

/** Écran principal du profil. */
export function buildProfileView({ member, settings, daily, weekly, achievements, notice, image }: ProfileData) {
  const c = card();
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://profil.png').setDescription(`Profil de ${member.displayName}`)));
  if (notice) c.addTextDisplayComponents(text(`> ${notice}`));

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
  if (rewards.length) c.addTextDisplayComponents(text(rewards.join('\n')));
  if (isFeatureEnabled(settings, 'succes')) c.addTextDisplayComponents(text(`🏅 **Badges** · ${badgeLine(achievements)}`));

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
    { label: 'Guide des commandes', value: 'help', description: 'Toutes les commandes, rangées et expliquées', emoji: '📖' },
  );
  const rows = [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(nav), row];

  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(SIGNATURE));
  // attachments: [] remplace l'ancienne bannière quand l'écran est mis à jour
  return { ...screen(c, rows), files: [new AttachmentBuilder(image, { name: 'profil.png' })], attachments: [] };
}

/** Fiche publique d'un membre, en lecture seule : nom, titre, ancienneté, niveau et XP, badges. Rien de personnel (bourse, récompenses). */
export function buildPublicProfileView({ member, settings, achievements, image }: Pick<ProfileData, 'member' | 'settings' | 'achievements'> & { image: Buffer }) {
  const c = card();
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://profil.png').setDescription(`Fiche de ${member.displayName}`)));
  if (isFeatureEnabled(settings, 'succes')) c.addTextDisplayComponents(text(`🏅 ${badgeLine(achievements)}`));
  c.addTextDisplayComponents(text(SIGNATURE));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'profil.png' })] };
}


/** Libellé d'un mouvement, avec le nom du membre concerné quand il y en a un. */
function describeTransaction(t: Transaction, nameOf: (id: string) => string): string {
  const who = t.counterpartyDiscordId ? nameOf(t.counterpartyDiscordId) : 'quelqu’un';
  switch (t.type) {
    case 'WELCOME': return '🎁 Bourse de bienvenue';
    case 'DAILY': return '🌅 Récompense du jour';
    case 'WEEKLY': return '🗓️ Récompense de la semaine';
    case 'PURCHASE': return '🛒 Achat';
    case 'REFUND': return '↩️ Remboursement';
    case 'BET': return '🎰 Mise';
    case 'BET_WIN': return '🎰 Gain';
    case 'GROUP_HUG': return '🤗 Câlin collectif';
    case 'DUEL_STAKE': return '⚔️ Mise de duel';
    case 'DUEL_WIN': return '⚔️ Duel gagné';
    case 'DUEL_REFUND': return '⚔️ Mise rendue';
    case 'LOTTERY_TICKET': return '🎟️ Tickets de tombola';
    case 'LOTTERY_WIN': return '🎟️ Tombola gagnée';
    case 'HUG_SENT': return `🤗 Câlin à ${who}`;
    case 'HUG_RECEIVED': return `🤗 Câlin de ${who}`;
    case 'ADMIN_CREDIT': return '🛡️ Offert par l’intendance';
    case 'ADMIN_DEBIT': return '🛡️ Retiré par l’intendance';
    case 'ACHIEVEMENT': return '🏅 Succès débloqué';
    case 'COUNTING_FINE': return '🔢 Amende de comptage';
    case 'THEFT_GAIN': return `🥷 Volé à ${who}`;
    case 'THEFT_LOSS': return `🥷 Dérobé par ${who}`;
    case 'THEFT_FINE': return `🚔 Vol raté sur ${who}`;
    case 'THEFT_COMPENSATION': return `🚔 Dédommagement de ${who}`;
  }
}

/** Écran de l'historique des mouvements de la bourse, en image. */
export async function buildHistoryView(member: Member, transactions: Transaction[], balance: number, settings: GuildSettings, nameOf: (id: string) => string) {
  const when = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: settings.timezone });
  const lines: ListLine[] = transactions.map((t) => ({
    label: describeTransaction(t, nameOf),
    value: formatAmount(t.delta, settings, { signed: true }),
    valueColor: t.delta >= 0 ? '#2ecc71' : '#e74c3c',
    sub: `${when.format(t.createdAt)}${t.reason && !['WELCOME', 'DAILY', 'WEEKLY'].includes(t.type) ? ` · ${t.reason}` : ''}`,
  }));
  const image = await renderListCard({
    title: 'Historique', subtitle: `Les derniers mouvements de la bourse de ${member.displayName}`, color: '#8e44ad', lines,
    empty: 'Aucun mouvement pour le moment. Ta bourse attend sa première pièce !', footer: `Solde actuel : ${formatAmount(balance, settings)}`,
  });
  return imageScreen(image, 'historique.png', 0x8e44ad, [backRow()], { caption: `Historique de ${member.displayName}` });
}

export function backRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );
}
