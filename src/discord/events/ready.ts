import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { config, isAllowedGuild } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { syncGuildMembers } from '../../modules/community/member.service.js';
import { reconcileVoiceSessions, tickVoiceSessions } from '../../modules/progression/xp.service.js';
import { settleAbandonedGames } from '../../modules/casino/blackjack.service.js';
import { reconcileHugs, tickScheduler } from '../../modules/events/grouphug.service.js';
import { reconcileDuels } from '../../modules/duel/duel.service.js';
import { armDuelExpiry } from '../commands/duel.js';

const log = createLogger('ready');

export default defineEvent({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    log.info(`Connecté en tant que ${client.user.tag}`);

    const guilds = config.discord.guildIds.map((id) => client.guilds.cache.get(id)).filter((g) => g !== undefined);
    for (const id of config.discord.guildIds) {
      if (!client.guilds.cache.has(id)) log.error(`Le bot n'est pas présent sur le serveur autorisé ${id}.`);
    }
    const others = client.guilds.cache.filter((g) => !isAllowedGuild(g.id));
    if (others.size > 0) {
      log.warn(`Présent aussi sur ${others.size} serveur(s) non autorisé(s), ignorés : ${others.map((g) => g.name).join(', ')}`);
    }

    for (const guild of guilds) {
      log.info(`Serveur autorisé : ${guild.name} (${guild.memberCount} membres)`);
      await syncGuildMembers(guild);
      await reconcileVoiceSessions(guild);
    }
    await settleAbandonedGames();
    await reconcileHugs(client);
    for (const duel of await reconcileDuels()) armDuelExpiry(client, duel);
    setInterval(() => void tickScheduler(client).catch((err) => log.error('Planificateur de câlins échoué', err)), 30_000);
    setInterval(() => {
      for (const guild of guilds) void tickVoiceSessions(guild).catch((err) => log.error(`Pointage vocal échoué (${guild.name})`, err));
    }, 60_000);
  },
});
