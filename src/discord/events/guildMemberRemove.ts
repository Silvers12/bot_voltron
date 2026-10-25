import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { config } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { markMemberLeft } from '../../modules/community/member.service.js';

const log = createLogger('members');

export default defineEvent({
  name: Events.GuildMemberRemove,
  async execute(_client, member) {
    if (member.guild.id !== config.discord.guildId) return;
    await markMemberLeft(member);
    log.info(`Membre parti : ${member.user?.username ?? member.id}`);
  },
});
