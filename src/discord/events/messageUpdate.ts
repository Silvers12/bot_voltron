import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { createLogger } from '../../core/logger.js';
import { handleCountingEdit } from '../../modules/counting/counting.service.js';

const log = createLogger('comptage');

export default defineEvent({
  name: Events.MessageUpdate,
  async execute(_client, _oldMessage, newMessage) {
    try {
      await handleCountingEdit(newMessage);
    } catch (err) {
      log.error('Erreur sur un message modifié', err);
    }
  },
});
