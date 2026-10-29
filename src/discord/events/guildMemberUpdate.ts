import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { createLogger } from '../../core/logger.js';
import { onRolesChanged } from '../../modules/prison/prison.service.js';

const log = createLogger('prison');

export default defineEvent({
  name: Events.GuildMemberUpdate,
  async execute(_client, before, after) {
    try {
      if (!before.partial) await onRolesChanged(before, after);
    } catch (err) {
      log.error('Erreur sur une mise à jour de membre', err);
    }
  },
});
