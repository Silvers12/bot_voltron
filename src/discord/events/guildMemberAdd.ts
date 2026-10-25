import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { config } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { ensureMember } from '../../modules/community/member.service.js';

const log = createLogger('members');

export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(_client, member) {
    if (member.guild.id !== config.discord.guildId || member.user.bot) return;
    await ensureMember(member);
    log.info(`Nouveau membre : ${member.user.username} (${member.id})`);
  },
});
