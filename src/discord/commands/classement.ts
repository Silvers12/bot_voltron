import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { registerButtonPrefix } from '../components.js';
import { prisma } from '../../infrastructure/prisma.js';
import { formatVoiceDuration, getLeaderboardPage, getRank, type LeaderboardPage } from '../../modules/progression/xp.service.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE_PREFIX = 'lb:page:';

function buildLeaderboard(data: LeaderboardPage, me: { xp: number; rank: number }) {
  const lines = data.entries.map(
    (r) => `${MEDALS[r.rank - 1] ?? `**${r.rank}.**`} ${userMention(r.discordUserId)} — **${r.xp} XP** · ${r.messageCount} msg · ${formatVoiceDuration(r.voiceSeconds)} vocal`,
  );
  const embed = new EmbedBuilder()
    .setColor(0x2e86c1)
    .setTitle('🏆 Classement de la compagnie')
    .setDescription(lines.length ? lines.join('\n') : 'Personne n’a encore gagné d’expérience. À vos claviers et à vos micros !')
    .setFooter({ text: `Page ${data.page}/${data.pageCount} · ${data.total} membres · Toi : ${me.rank}ᵉ avec ${me.xp} XP` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${PAGE_PREFIX}${data.page - 1}`).setLabel('Précédent').setStyle(ButtonStyle.Secondary).setEmoji('◀️').setDisabled(data.page <= 1),
    new ButtonBuilder().setCustomId(`${PAGE_PREFIX}${data.page + 1}`).setLabel('Suivant').setStyle(ButtonStyle.Secondary).setEmoji('▶️').setDisabled(data.page >= data.pageCount),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] as [] } };
}

async function render(guildId: string, memberId: string, page: number) {
  const fresh = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { xp: true } });
  const [data, rank] = await Promise.all([getLeaderboardPage(guildId, page), getRank(guildId, fresh.xp)]);
  return buildLeaderboard(data, { xp: fresh.xp, rank });
}

// Le classement est public : n'importe qui peut tourner les pages, le pied de page reflète alors son propre rang.
registerButtonPrefix(PAGE_PREFIX, async ({ interaction, member, arg }) => {
  await interaction.update(await render(interaction.guildId, member.id, Number(arg) || 1));
});

export default defineCommand({
  data: new SlashCommandBuilder().setName('classement').setDescription('Classement d’expérience de la compagnie'),
  async execute({ interaction, member }) {
    await interaction.reply(await render(interaction.guildId, member.id, 1));
  },
});
