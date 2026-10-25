import type { GuildMember } from 'discord.js';
import type { Member } from '../../generated/prisma/client.js';
import { registerButton } from '../../discord/components.js';
import { getBalance, getHistory } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { claimDaily, getDailyStatus } from '../economy/daily.service.js';
import { claimWeekly, getWeeklyStatus } from '../economy/weekly.service.js';
import { time, TimestampStyles } from 'discord.js';
import { buildHistoryView, buildProfileView, PROFILE_DAILY_ID, PROFILE_HISTORY_ID, PROFILE_REFRESH_ID, PROFILE_WEEKLY_ID } from './profile.view.js';

/** Assemble les données du profil et construit l'écran. */
export async function renderProfile(member: Member, guildMember: GuildMember, notice?: string) {
  const [balance, settings, daily, weekly] = await Promise.all([
    getBalance(member.id),
    getSettings(member.guildId),
    getDailyStatus(member.id, member.guildId),
    getWeeklyStatus(member.id, member.guildId),
  ]);
  return buildProfileView({ member, guildMember, balance, settings, daily, weekly, notice });
}

export async function renderHistory(member: Member) {
  const [transactions, balance, settings] = await Promise.all([
    getHistory(member.id, 10),
    getBalance(member.id),
    getSettings(member.guildId),
  ]);
  return buildHistoryView(member, transactions, balance, settings);
}

// Les messages de /profil sont éphémères : seul leur destinataire peut cliquer ces boutons.
registerButton(PROFILE_REFRESH_ID, async ({ interaction, member, guildMember }) => {
  await interaction.update(await renderProfile(member, guildMember));
});

registerButton(PROFILE_HISTORY_ID, async ({ interaction, member }) => {
  await interaction.update(await renderHistory(member));
});

registerButton(PROFILE_DAILY_ID, async ({ interaction, member, guildMember }) => {
  const settings = await getSettings(member.guildId);
  const result = await claimDaily(member.id, member.guildId, interaction.user.id);
  const notice = result.ok
    ? `🎁 **${formatAmount(result.amount, settings)}** rejoignent ta bourse` +
      (result.bonusPercent > 0 ? ` (série de ${result.streak} jours, +${result.bonusPercent}%)` : '') +
      '. Belle journée pour défendre la rivière !'
    : `Tu as déjà reçu ta récompense aujourd’hui. Reviens ${time(result.nextAt, TimestampStyles.RelativeTime)}.`;
  await interaction.update(await renderProfile(member, guildMember, notice));
});

registerButton(PROFILE_WEEKLY_ID, async ({ interaction, member, guildMember }) => {
  const settings = await getSettings(member.guildId);
  const result = await claimWeekly(member.id, member.guildId, interaction.user.id);
  const notice = result.ok
    ? `🗓️ **${formatAmount(result.amount, settings)}** rejoignent ta bourse pour cette semaine !`
    : `Tu as déjà reçu ta récompense de la semaine. Reviens ${time(result.nextAt, TimestampStyles.RelativeTime)}.`;
  await interaction.update(await renderProfile(member, guildMember, notice));
});
