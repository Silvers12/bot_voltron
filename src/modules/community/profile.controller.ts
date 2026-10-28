import { MessageFlags, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import type { Member } from '../../generated/prisma/client.js';
import { registerButton, registerButtonPrefix, registerSelect, type ButtonContext, type SelectContext } from '../../discord/components.js';
import { closeSession, openSession, touchSession } from '../../discord/sessions.js';

/** Durée d'inactivité avant fermeture automatique du panneau. */
export const PROFILE_SESSION_TTL_MS = 2 * 60 * 1000;
export const profileSessionKey = (guildId: string, userId: string) => `profil:${guildId}:${userId}`;

/** Ouvre un panneau de profil en réponse à /profil : ferme l'éventuel panneau précédent du membre. */
export async function openProfile(ctx: { interaction: ChatInputCommandInteraction<'cached'>; member: Member; guildMember: GuildMember }) {
  const key = profileSessionKey(ctx.interaction.guildId, ctx.interaction.user.id);
  await closeSession(key);
  const view = await renderProfile(ctx.member, ctx.guildMember);
  await ctx.interaction.reply({ ...view, flags: view.flags | MessageFlags.Ephemeral });
  await openSession(key, ctx.interaction, PROFILE_SESSION_TTL_MS);
}

/** Enregistre un composant du panneau : chaque clic repousse l'expiration de la session. */
export function registerProfileButton(id: string, handler: (ctx: ButtonContext) => Promise<void>) {
  registerButton(id, async (ctx) => {
    await handler(ctx);
    touchSession(profileSessionKey(ctx.interaction.guildId, ctx.interaction.user.id), ctx.interaction, PROFILE_SESSION_TTL_MS);
  });
}

export function registerProfileButtonPrefix(prefix: string, handler: (ctx: ButtonContext) => Promise<void>) {
  registerButtonPrefix(prefix, async (ctx) => {
    await handler(ctx);
    touchSession(profileSessionKey(ctx.interaction.guildId, ctx.interaction.user.id), ctx.interaction, PROFILE_SESSION_TTL_MS);
  });
}

export function registerProfileSelect(id: string, handler: (ctx: SelectContext) => Promise<void>) {
  registerSelect(id, async (ctx) => {
    await handler(ctx);
    touchSession(profileSessionKey(ctx.interaction.guildId, ctx.interaction.user.id), ctx.interaction, PROFILE_SESSION_TTL_MS);
  });
}
import { getBalance, getHistory } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { claimDaily, getDailyStatus } from '../economy/daily.service.js';
import { claimWeekly, getWeeklyStatus } from '../economy/weekly.service.js';
import { getRank } from '../progression/xp.service.js';
import { listUnlocked, trackAchievements } from '../achievements/achievements.service.js';
import { getEquippedTitle } from '../shop/shop.service.js';
import { buildAchievementsView, PROFILE_ACHIEVEMENTS_ID } from '../achievements/achievements.view.js';
import { time, TimestampStyles } from 'discord.js';
import { renderProfileCard } from './profile.image.js';
import { withHeader } from '../../discord/header.js';
import { ACHIEVEMENTS } from '../achievements/achievements.catalog.js';
import { buildHistoryView, buildProfileView, buildPublicProfileView, PROFILE_DAILY_ID, PROFILE_HISTORY_ID, PROFILE_REFRESH_ID, PROFILE_WEEKLY_ID } from './profile.view.js';

/** Assemble les données du profil et construit l'écran. */
export async function renderProfile(member: Member, guildMember: GuildMember, notice?: string) {
  const [balance, settings, daily, weekly, rank, achievements, title] = await Promise.all([
    getBalance(member.id),
    getSettings(member.guildId),
    getDailyStatus(member.id, member.guildId),
    getWeeklyStatus(member.id, member.guildId),
    getRank(member.guildId, member.xp),
    listUnlocked(member.id),
    getEquippedTitle(member.id),
  ]);
  const avatarPng = Buffer.from(await (await fetch(guildMember.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
  const image = await renderProfileCard({ member, avatarPng, settings, rank, title, badges: achievements.length, badgesTotal: ACHIEVEMENTS.length, balance });
  return buildProfileView({ member, guildMember, balance, settings, daily, weekly, rank, achievements, title, notice, image });
}

/** Fiche publique d'un autre membre. */
export async function renderPublicProfile(member: Member, guildMember: GuildMember) {
  const [settings, rank, achievements, title] = await Promise.all([
    getSettings(member.guildId),
    getRank(member.guildId, member.xp),
    listUnlocked(member.id),
    getEquippedTitle(member.id),
  ]);
  const avatarPng = Buffer.from(await (await fetch(guildMember.displayAvatarURL({ extension: 'png', size: 256 }))).arrayBuffer());
  const image = await renderProfileCard({ member, avatarPng, settings, rank, title, badges: achievements.length, badgesTotal: ACHIEVEMENTS.length });
  return buildPublicProfileView({ member, settings, achievements, image });
}

export async function renderHistory(member: Member) {
  const [transactions, balance, settings] = await Promise.all([
    getHistory(member.id, 10),
    getBalance(member.id),
    getSettings(member.guildId),
  ]);
  return withHeader(buildHistoryView(member, transactions, balance, settings), { title: 'Historique', subtitle: `Les derniers mouvements de la bourse de ${member.displayName}`, color: '#8e44ad' });
}

// Les messages de /profil sont éphémères : seul leur destinataire peut cliquer ces boutons.
registerProfileButton(PROFILE_REFRESH_ID, async ({ interaction, member, guildMember }) => {
  await interaction.update(await renderProfile(member, guildMember));
});

/** Écran des succès avec son bandeau. */
export async function renderAchievements(member: Member) {
  const [unlocked, settings] = await Promise.all([listUnlocked(member.id), getSettings(member.guildId)]);
  return withHeader(buildAchievementsView(member.displayName, unlocked, settings, PROFILE_REFRESH_ID), { title: 'Succès', subtitle: `${unlocked.length} succès sur ${ACHIEVEMENTS.length} pour ${member.displayName}`, color: '#f39c12' });
}

registerProfileButton(PROFILE_ACHIEVEMENTS_ID, async ({ interaction, member }) => {
  await interaction.update(await renderAchievements(member));
});

registerProfileButton(PROFILE_HISTORY_ID, async ({ interaction, member }) => {
  await interaction.update(await renderHistory(member));
});

registerProfileButton(PROFILE_DAILY_ID, async ({ interaction, member, guildMember }) => {
  const settings = await getSettings(member.guildId);
  const result = await claimDaily(member.id, member.guildId, interaction.user.id);
  if (result.ok) trackAchievements(interaction.guild, member.id);
  const notice = result.ok
    ? `🎁 **${formatAmount(result.amount, settings)}** rejoignent ta bourse` +
      (result.bonusPercent > 0 ? ` (série de ${result.streak} jours, +${result.bonusPercent}%)` : '') +
      '. Belle journée au bord de la rivière !'
    : `Tu as déjà reçu ta récompense aujourd’hui. Reviens ${time(result.nextAt, TimestampStyles.RelativeTime)}.`;
  await interaction.update(await renderProfile(member, guildMember, notice));
});

registerProfileButton(PROFILE_WEEKLY_ID, async ({ interaction, member, guildMember }) => {
  const settings = await getSettings(member.guildId);
  const result = await claimWeekly(member.id, member.guildId, interaction.user.id);
  const notice = result.ok
    ? `🗓️ **${formatAmount(result.amount, settings)}** rejoignent ta bourse pour cette semaine !`
    : `Tu as déjà reçu ta récompense de la semaine. Reviens ${time(result.nextAt, TimestampStyles.RelativeTime)}.`;
  await interaction.update(await renderProfile(member, guildMember, notice));
});
