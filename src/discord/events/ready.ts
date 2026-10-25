import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { config } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { syncGuildMembers } from '../../modules/community/member.service.js';
import { reconcileVoiceSessions, tickVoiceSessions } from '../../modules/progression/xp.service.js';
import { settleAbandonedGames } from '../../modules/casino/blackjack.service.js';

const log = createLogger('ready');

export default defineEvent({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    log.info(`Connecté en tant que ${client.user.tag}`);

    const guild = client.guilds.cache.get(config.discord.guildId);
    if (!guild) {
      log.error(`Le bot n'est pas présent sur le serveur autorisé ${config.discord.guildId}.`);
      return;
    }
    log.info(`Serveur autorisé : ${guild.name} (${guild.memberCount} membres)`);

    const others = client.guilds.cache.filter((g) => g.id !== guild.id);
    if (others.size > 0) {
      log.warn(`Présent aussi sur ${others.size} autre(s) serveur(s) non autorisé(s) : ${others.map((g) => g.name).join(', ')}`);
    }

    await syncGuildMembers(guild);
    await reconcileVoiceSessions(guild);
    await settleAbandonedGames();
    setInterval(() => void tickVoiceSessions(guild).catch((err) => log.error('Pointage vocal échoué', err)), 60_000);
  },
});
