import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, time, TimestampStyles, userMention, type Guild, type MessageActionRowComponentBuilder } from 'discord.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import { notifyMention } from '../notify/notify.service.js';
import { loadIllustration, memberAvatarPng, renderDuoCard } from '../../core/duo-card.js';
import type { DuelResolution, DuelWithMembers } from './duel.service.js';

export const DUEL_ACCEPT_PREFIX = 'duel:accept:';
export const DUEL_DECLINE_PREFIX = 'duel:decline:';
export const DUEL_CANCEL_PREFIX = 'duel:cancel:';

const COLOR = 0xc0392b;

async function avatars(guild: Guild, duel: DuelWithMembers) {
  return Promise.all([memberAvatarPng(guild, duel.challenger.discordUserId), memberAvatarPng(guild, duel.opponent.discordUserId)]);
}

/** Carte du défi (deux personnages, mise, illustration) avec les boutons. `pingUsers` : identifiants réellement notifiés. */
export async function buildChallengeMessage(guild: Guild, duel: DuelWithMembers, s: GuildSettings, pingUsers: string[]) {
  const ping = notifyMention(s, 'duel');
  const [a, b] = await avatars(guild, duel);
  const image = await renderDuoCard({
    title: 'Défi en duel !', badge: `Mise : ${formatAmount(duel.stake, s)} chacun`, badgeColor: '#b71c1c', from: '#1a0f0f', to: '#c0392b',
    left: { name: duel.challenger.displayName, avatarPng: a }, right: { name: duel.opponent.displayName, avatarPng: b }, link: '⚔️',
    text: `${duel.challenger.displayName} jette son gant au visage de ${duel.opponent.displayName} ! Le vainqueur empoche ${formatAmount(duel.stake * 2, s)}.`,
    illustration: await loadIllustration('duel', 'defi'),
  });
  const c = card(COLOR);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://duel.png').setDescription(`Défi de ${duel.challenger.displayName} à ${duel.opponent.displayName}`)));
  c.addTextDisplayComponents(text(`${ping}${userMention(duel.opponent.discordUserId)}, ${userMention(duel.challenger.discordUserId)} te défie ! ⏳ Le défi expire ${time(duel.expiresAt, TimestampStyles.RelativeTime)}.\n-# Seul le défié peut accepter ou refuser. Le défieur peut annuler.`));
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(DUEL_ACCEPT_PREFIX + duel.id).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId(DUEL_DECLINE_PREFIX + duel.id).setLabel('Refuser').setStyle(ButtonStyle.Secondary).setEmoji('🏳️'),
    new ButtonBuilder().setCustomId(DUEL_CANCEL_PREFIX + duel.id).setLabel('Annuler').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  return { ...screen(c, [row]), files: [new AttachmentBuilder(image, { name: 'duel.png' })], attachments: [], allowedMentions: { users: pingUsers, parse: ['roles' as const] } };
}

export function buildClosedMessage(duel: DuelWithMembers, s: GuildSettings, outcome: 'declined' | 'cancelled' | 'expired') {
  const body = {
    declined: `${userMention(duel.opponent.discordUserId)} décline le duel. ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
    cancelled: `${userMention(duel.challenger.discordUserId)} retire son défi et récupère sa mise.`,
    expired: `${userMention(duel.opponent.discordUserId)} n’a pas répondu. Le défi s’éteint et ${userMention(duel.challenger.discordUserId)} récupère sa mise.`,
  }[outcome];
  const c = card(0x95a5a6);
  c.addTextDisplayComponents(text(`# ⚔️ Duel sans suite\n${body}\n-# Mise : ${formatAmount(duel.stake, s)}`));
  return { ...screen(c), files: [], attachments: [], allowedMentions: { parse: [] as [] } };
}

/** Carte du résultat : vainqueur à gauche, perdant à droite, cagnotte, récit de la fin ; les manches en texte dessous. */
export async function buildResolvedMessage(guild: Guild, r: DuelResolution, s: GuildSettings) {
  const { duel } = r;
  const challengerWon = r.winnerId === duel.challengerId;
  const winner = challengerWon ? duel.challenger : duel.opponent;
  const loser = challengerWon ? duel.opponent : duel.challenger;
  const [wa, la] = await Promise.all([memberAvatarPng(guild, winner.discordUserId), memberAvatarPng(guild, loser.discordUserId)]);
  const image = await renderDuoCard({
    title: 'Victoire !', badge: `${winner.displayName.slice(0, 16)} empoche ${formatAmount(r.pot, s)}`, badgeColor: '#f39c12', from: '#1a237e', to: '#f1c40f',
    left: { name: winner.displayName, avatarPng: wa }, right: { name: loser.displayName, avatarPng: la }, link: '🏆',
    text: r.finish.replaceAll('**', ''), illustration: await loadIllustration('duel', 'victoire'),
  });
  const lines = r.rounds.map((round) => `• ${round.text}\n  🎲 ${duel.challenger.displayName} **${round.challengerRoll}** · ${duel.opponent.displayName} **${round.opponentRoll}**`);
  const c = card(0xf1c40f);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://duel.png').setDescription(`Victoire de ${winner.displayName}`)));
  c.addTextDisplayComponents(text(lines.join('\n')));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# ⚔️ ${userMention(duel.challenger.discordUserId)} contre ${userMention(duel.opponent.discordUserId)} · mise ${formatAmount(duel.stake, s)} chacun`));
  return { ...screen(c), files: [new AttachmentBuilder(image, { name: 'duel.png' })], attachments: [], allowedMentions: { parse: [] as [] } };
}
