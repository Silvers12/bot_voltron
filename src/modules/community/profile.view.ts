import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, type GuildMember } from 'discord.js';
import type { Member } from '../../generated/prisma/client.js';

export const PROFILE_REFRESH_ID = 'profil:refresh';

/** Construit l'écran de profil d'un membre (embed + boutons). */
export function buildProfileView(member: Member, guildMember: GuildMember) {
  const embed = new EmbedBuilder()
    .setColor(0x2e86c1)
    .setAuthor({ name: `Profil de ${member.displayName}`, iconURL: guildMember.displayAvatarURL({ size: 128 }) })
    .setThumbnail(guildMember.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: 'Dans la compagnie depuis',
        value: member.joinedAt ? time(member.joinedAt, TimestampStyles.LongDate) : 'Inconnu',
        inline: true,
      },
      { name: 'Profil créé', value: time(member.createdAt, TimestampStyles.RelativeTime), inline: true },
    )
    .setFooter({ text: 'Voltron, loutre paladin · Par mon bouclier et mes moustaches !' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel('Rafraîchir').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
  );

  return { embeds: [embed], components: [row] };
}
