import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles, userMention, type MessageActionRowComponentBuilder } from 'discord.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import type { GuildSettings, MemberAchievement } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { ACHIEVEMENTS, TIER_LABEL, TIER_REWARD, type Achievement } from './achievements.catalog.js';
import type { Unlock } from './achievements.service.js';

import { botName } from '../../core/identity.js';
export const PROFILE_ACHIEVEMENTS_ID = 'profil:achievements';
const COLOR = 0xe67e22;
const FOOTER = `${botName()}, loutre paladin · Par mon bouclier et mes moustaches !`;

export function badgeLine(unlocked: MemberAchievement[]): string {
  const emojis = unlocked.map((u) => ACHIEVEMENTS.find((a) => a.key === u.key)?.emoji).filter(Boolean);
  if (!emojis.length) return 'Aucun badge pour l’instant';
  return `${emojis.slice(0, 20).join(' ')}${emojis.length > 20 ? ' …' : ''} (${emojis.length}/${ACHIEVEMENTS.length})`;
}

/** Écran complet des succès d'un membre : débloqués avec date, verrouillés avec indice. */
export function buildAchievementsEmbed(displayName: string, unlocked: MemberAchievement[], s: GuildSettings, { showHints = true, title = null as string | null } = {}) {
  const byKey = new Map(unlocked.map((u) => [u.key, u]));
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🏅 Succès de ${displayName}`)
    .setDescription(`${title ? `🏷️ *${title}*\n` : ''}**${unlocked.length}** succès sur ${ACHIEVEMENTS.length}.`)
    .setFooter({ text: FOOTER });
  const categories = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
  for (const cat of categories) {
    const lines = ACHIEVEMENTS.filter((a) => a.category === cat).map((a) => {
      const u = byKey.get(a.key);
      if (u) return `${a.emoji} **${a.name}** · ${TIER_LABEL[a.tier]} · ${time(u.unlockedAt, TimestampStyles.ShortDate)}`;
      return showHints ? `🔒 ${a.name} · *${a.hint}* · +${formatAmount(TIER_REWARD[a.tier], s)}` : `🔒 ${a.name}`;
    });
    embed.addFields({ name: cat, value: lines.join('\n') });
  }
  return embed;
}

/** Écran des succès dans le profil (composants V2). */
export function buildAchievementsView(displayName: string, unlocked: MemberAchievement[], s: GuildSettings, backId: string) {
  const byKey = new Map(unlocked.map((u) => [u.key, u]));
  const c = card(COLOR);
  let first = true;
  for (const cat of [...new Set(ACHIEVEMENTS.map((a) => a.category))]) {
    const lines = ACHIEVEMENTS.filter((a) => a.category === cat).map((a) => {
      const u = byKey.get(a.key);
      return u ? `${a.emoji} **${a.name}** · ${TIER_LABEL[a.tier]} · ${time(u.unlockedAt, TimestampStyles.ShortDate)}` : `🔒 ${a.name} · *${a.hint}* · +${formatAmount(TIER_REWARD[a.tier], s)}`;
    });
    if (!first) c.addSeparatorComponents(divider());
    first = false;
    c.addTextDisplayComponents(text(`## ${cat}\n${lines.join('\n')}`));
  }
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(backId).setLabel('Retour au profil').setStyle(ButtonStyle.Secondary).setEmoji('🦦'),
  );
  return screen(c, [row]);
}

export function buildUnlockAnnouncement(discordUserId: string, unlocks: Unlock[], s: GuildSettings) {
  const lines = unlocks.map((u) => `${u.achievement.emoji} **${u.achievement.name}** (${TIER_LABEL[u.achievement.tier]}) : ${userMention(discordUserId)} ${u.achievement.description}${u.reward ? ` *+${formatAmount(u.reward, s)}*` : ''}`);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(unlocks.length > 1 ? '🏅 Nouveaux succès !' : '🏅 Nouveau succès !')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${botName()} applaudit des deux pattes.` });
  return { embeds: [embed], allowedMentions: { users: [discordUserId] } };
}

export function describeAchievementForAdmin(a: Achievement, count: number): string {
  return `${a.emoji} ${a.name} · ${TIER_LABEL[a.tier]} · ${count} membre${count > 1 ? 's' : ''}`;
}
