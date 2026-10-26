import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention } from 'discord.js';
import type { GroupHug, GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

export const HUG_JOIN_PREFIX = 'hug:join:';

export function buildHugOpenMessage(hug: GroupHug, count: number, s: GuildSettings) {
  const embed = new EmbedBuilder()
    .setColor(0xff6b9d)
    .setTitle('🤗 CÂLIN COLLECTIF !')
    .setDescription(
      [
        'Voltron surgit au milieu du salon, les bras grand ouverts et les moustaches frémissantes.',
        '',
        `**Appuyez sur CÂLIN avant ${time(hug.endsAt, TimestampStyles.RelativeTime)} !**`,
        `Chaque câlineur reçoit **${formatAmount(hug.rewardPerHugger, s)} × le nombre de câlineurs**. Plus vous êtes nombreux, plus ça rapporte.`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Câlineurs', value: `**${count}**`, inline: true },
      { name: 'Récompense actuelle', value: `**${formatAmount(hug.rewardPerHugger * count, s)}** chacun`, inline: true },
    )
    .setFooter({ text: 'Par mon bouclier et mes moustaches, venez là !' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(HUG_JOIN_PREFIX + hug.id).setLabel('CÂLIN').setStyle(ButtonStyle.Success).setEmoji('🤗'),
  );
  return { embeds: [embed], components: [row] };
}

export function buildHugClosedMessage(hug: GroupHug, participantIds: string[], rewardEach: number, s: GuildSettings) {
  const count = participantIds.length;
  const names = participantIds.map(userMention).join(', ');
  const embed = new EmbedBuilder()
    .setColor(count ? 0xff6b9d : 0x95a5a6)
    .setTitle(count ? '🤗 Câlin collectif terminé !' : '🦦 Câlin collectif… solitaire')
    .setDescription(
      count
        ? `Voltron serre fort ${count} camarade${count > 1 ? 's' : ''} : ${names}\n\nChacun repart avec **${formatAmount(rewardEach, s)}** (${formatAmount(hug.rewardPerHugger, s)} × ${count}).`
        : 'Personne n’est venu. Voltron referme doucement les bras et retourne à sa rivière. Il reviendra.',
    )
    .setFooter({ text: count ? 'Vous êtes une belle compagnie.' : 'Snif.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(HUG_JOIN_PREFIX + hug.id).setLabel('Terminé').setStyle(ButtonStyle.Secondary).setEmoji('🤗').setDisabled(true),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] as [] } };
}
