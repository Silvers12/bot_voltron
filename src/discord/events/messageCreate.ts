import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { createLogger } from '../../core/logger.js';
import { handleMessage } from '../../modules/progression/xp.service.js';

const log = createLogger('xp');

export default defineEvent({
  name: Events.MessageCreate,
  async execute(_client, message) {
    try {
      await handleMessage(message);
    } catch (err) {
      log.error('Erreur XP message', err);
    }
  },
});
