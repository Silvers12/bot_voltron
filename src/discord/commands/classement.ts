import { EmbedBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { formatVoiceDuration, getLeaderboard, getRank } from '../../modules/progression/xp.service.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default defineCommand({
  data: new SlashCommandBuilder().setName('classement').setDescription('Classement d’expérience de la compagnie'),
  async execute({ interaction, member }) {
    const [top, myRank] = await Promise.all([getLeaderboard(interaction.guildId, 10), getRank(interaction.guildId, member.xp)]);

    const lines = top.map((r) => `${MEDALS[r.rank - 1] ?? `**${r.rank}.**`} ${userMention(r.discordUserId)} — **${r.xp} XP** · ${r.messageCount} msg · ${formatVoiceDuration(r.voiceSeconds)} vocal`);

    const embed = new EmbedBuilder()
      .setColor(0x2e86c1)
      .setTitle('🏆 Classement de la compagnie')
      .setDescription(lines.length ? lines.join('\n') : 'Personne n’a encore gagné d’expérience. À vos claviers et à vos micros !')
      .setFooter({ text: `Toi : ${myRank}ᵉ avec ${member.xp} XP · +1 XP par message, +1 XP par 30 min de vocal` });

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
});
