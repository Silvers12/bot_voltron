import { ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles, userMention, type MessageActionRowComponentBuilder } from 'discord.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import { notifyMention } from '../notify/notify.service.js';
import type { GroupHug, GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

import { botName } from '../../core/identity.js';
export const HUG_JOIN_PREFIX = 'hug:join:';

export function buildHugOpenMessage(hug: GroupHug, count: number, s: GuildSettings) {
  const ping = notifyMention(s, 'hug').trim();
  const c = card(0xff6b9d);
  c.addTextDisplayComponents(text(`${ping ? `${ping}\n` : ''}# 🤗 CÂLIN COLLECTIF !\n${botName()} surgit au milieu du salon, les bras grand ouverts et les moustaches frémissantes.`));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(`**Appuyez sur CÂLIN avant ${time(hug.endsAt, TimestampStyles.RelativeTime)} !**\nChaque câlineur reçoit **${formatAmount(hug.rewardPerHugger, s)} × le nombre de câlineurs**. Plus vous êtes nombreux, plus ça rapporte.`));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`🤗 **Câlineurs** · **${count}** · 💰 **Récompense actuelle** · **${formatAmount(hug.rewardPerHugger * count, s)}** chacun\n-# Par mon bouclier et mes moustaches, venez là !`));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(HUG_JOIN_PREFIX + hug.id).setLabel('CÂLIN').setStyle(ButtonStyle.Success).setEmoji('🤗'),
  );
  return screen(c, [row]);
}

export function buildHugClosedMessage(hug: GroupHug, participantIds: string[], rewardEach: number, s: GuildSettings) {
  const count = participantIds.length;
  const names = participantIds.map(userMention).join(', ');
  const c = card(count ? 0xff6b9d : 0x95a5a6);
  c.addTextDisplayComponents(text(count ? '# 🤗 Câlin collectif terminé !' : '# 🦦 Câlin collectif… solitaire'));
  c.addSeparatorComponents(divider(true));
  c.addTextDisplayComponents(text(
    count
      ? `${botName()} serre fort ${count} camarade${count > 1 ? 's' : ''} : ${names}\n\nChacun repart avec **${formatAmount(rewardEach, s)}** (${formatAmount(hug.rewardPerHugger, s)} × ${count}).\n-# Vous êtes une belle compagnie.`
      : `Personne n’est venu. ${botName()} referme doucement les bras et retourne à sa rivière. Il reviendra.\n-# Snif.`,
  ));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(HUG_JOIN_PREFIX + hug.id).setLabel('Terminé').setStyle(ButtonStyle.Secondary).setEmoji('🤗').setDisabled(true),
  );
  return { ...screen(c, [row]), allowedMentions: { parse: [] as [] } };
}
