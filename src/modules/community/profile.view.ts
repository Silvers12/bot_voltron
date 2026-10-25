import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention, type GuildMember } from 'discord.js';
import type { GuildSettings, Member, Transaction } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

export const PROFILE_REFRESH_ID = 'profil:refresh';
export const PROFILE_HISTORY_ID = 'profil:history';

const VOLTRON_COLOR = 0x2e86c1;
const FOOTER = 'Voltron, loutre paladin · Par mon bouclier et mes moustaches !';

export interface ProfileData {
  member: Member;
  guildMember: GuildMember;
  balance: number;
  settings: GuildSettings;
}

/** Écran principal du profil : embed + boutons. */
export function buildProfileView({ member, guildMember, balance, settings }: ProfileData) {
  const embed = new EmbedBuilder()
    .setColor(VOLTRON_COLOR)
    .setAuthor({ name: `Profil de ${member.displayName}`, iconURL: guildMember.displayAvatarURL({ size: 128 }) })
    .setThumbnail(guildMember.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Bourse', value: `**${formatAmount(balance, settings)}**`, inline: false },
      {
        name: 'Dans la compagnie depuis',
        value: member.joinedAt ? time(member.joinedAt, TimestampStyles.LongDate) : 'Inconnu',
        inline: true,
      },
      { name: 'Profil créé', value: time(member.createdAt, TimestampStyles.RelativeTime), inline: true },
    )
    .setFooter({ text: FOOTER });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_HISTORY_ID).setLabel('Historique').setStyle(ButtonStyle.Primary).setEmoji('📜'),
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
  );

  return { embeds: [embed], components: [row] };
}

function describeTransaction(t: Transaction): string {
  switch (t.type) {
    case 'WELCOME': return '🎁 bourse de bienvenue';
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
    const reason = t.reason && t.type !== 'WELCOME' ? ` · ${t.reason}` : '';
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
