import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { createLogger } from '../../core/logger.js';
import { handleVoiceStateUpdate } from '../../modules/progression/xp.service.js';

const log = createLogger('xp');

export default defineEvent({
  name: Events.VoiceStateUpdate,
  async execute(_client, oldState, newState) {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (err) {
      log.error('Erreur XP vocal', err);
    }
  },
});
