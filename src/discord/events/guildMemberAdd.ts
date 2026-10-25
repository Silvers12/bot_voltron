import { Events } from 'discord.js';
import { defineEvent } from '../types.js';
import { isAllowedGuild } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { ensureMember } from '../../modules/community/member.service.js';

const log = createLogger('members');

export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(_client, member) {
    if (!isAllowedGuild(member.guild.id) || member.user.bot) return;
    await ensureMember(member);
    log.info(`Nouveau membre : ${member.user.username} (${member.id})`);
  },
});
