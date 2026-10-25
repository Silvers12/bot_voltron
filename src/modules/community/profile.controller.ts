import type { GuildMember } from 'discord.js';
import type { Member } from '../../generated/prisma/client.js';
import { registerButton } from '../../discord/components.js';
import { getBalance, getHistory } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { buildHistoryView, buildProfileView, PROFILE_HISTORY_ID, PROFILE_REFRESH_ID } from './profile.view.js';

/** Assemble les données du profil et construit l'écran. */
export async function renderProfile(member: Member, guildMember: GuildMember) {
  const [balance, settings] = await Promise.all([getBalance(member.id), getSettings(member.guildId)]);
  return buildProfileView({ member, guildMember, balance, settings });
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
