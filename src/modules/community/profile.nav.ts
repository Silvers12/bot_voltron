import { registerProfileButton, registerProfileSelect, renderAchievements, renderHistory, renderProfile } from './profile.controller.js';
import { withHeader } from '../../discord/header.js';
import { isBotAdmin } from '../../core/permissions.js';
import { buildHelpCategory, buildHelpIndex, HELP_INDEX_ID, HELP_SELECT_ID } from '../help/help.view.js';
import { commandIds } from '../help/help.commands.js';
import { renderInventory, renderShop } from '../shop/shop.controller.js';
import { computeGameStats } from '../stats/stats.service.js';
import { buildStatsView } from '../stats/stats.view.js';
import { getSettings } from '../settings/settings.service.js';
import { PROFILE_NAV_ID, PROFILE_REFRESH_ID } from './profile.view.js';

/** Menu « Explorer » du profil : chaque option ouvre un écran. */
registerProfileSelect(PROFILE_NAV_ID, async ({ interaction, member, guildMember, values }) => {
  const settings = await getSettings(member.guildId);
  switch (values[0]) {
    case 'history': return void (await interaction.update(await renderHistory(member)));
    case 'shop': return void (await interaction.update(await renderShop(member)));
    case 'inventory': return void (await interaction.update(await renderInventory(member)));
    case 'achievements': return void (await interaction.update(await renderAchievements(member)));
    case 'help': return void (await interaction.update(await buildHelpIndex(settings, isBotAdmin(guildMember))));
    case 'stats': return void (await interaction.update(await withHeader(buildStatsView(member.displayName, await computeGameStats(member.id), settings, { withBack: true }), { title: 'Statistiques', subtitle: `Les chiffres de jeu de ${member.displayName}`, color: '#2e86c1' })));
    default: return void (await interaction.update(await renderProfile(member, guildMember)));
  }
});

/** Guide des commandes : rubrique choisie dans le menu, ou retour au sommaire. */
registerProfileSelect(HELP_SELECT_ID, async ({ interaction, member, guildMember, values }) => {
  const settings = await getSettings(member.guildId);
  await interaction.update(await buildHelpCategory(settings, isBotAdmin(guildMember), values[0] ?? '', await commandIds(interaction.guild)));
});

registerProfileButton(HELP_INDEX_ID, async ({ interaction, member, guildMember }) => {
  await interaction.update(await buildHelpIndex(await getSettings(member.guildId), isBotAdmin(guildMember)));
});
