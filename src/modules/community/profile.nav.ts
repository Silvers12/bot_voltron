import { registerProfileSelect, renderHistory, renderProfile } from './profile.controller.js';
import { renderInventory, renderShop } from '../shop/shop.controller.js';
import { listUnlocked } from '../achievements/achievements.service.js';
import { buildAchievementsView } from '../achievements/achievements.view.js';
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
    case 'achievements': return void (await interaction.update(buildAchievementsView(member.displayName, await listUnlocked(member.id), settings, PROFILE_REFRESH_ID)));
    case 'stats': return void (await interaction.update(buildStatsView(member.displayName, await computeGameStats(member.id), settings, { withBack: true })));
    default: return void (await interaction.update(await renderProfile(member, guildMember)));
  }
});
