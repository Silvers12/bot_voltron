import { MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand } from '../types.js';
import { trackAchievements } from '../../modules/achievements/achievements.service.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { hug, InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('calin')
    .setDescription('Fais un câlin à un membre : offre-lui des cœurs de ta bourse')
    .addUserOption((o) => o.setName('membre').setDescription('Qui reçoit le câlin').setRequired(true))
    .addIntegerOption((o) => o.setName('montant').setDescription('Combien de cœurs').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('message').setDescription('Un petit mot (facultatif)').setMaxLength(100)),

  async execute({ interaction, member }) {
    const settings = await getSettings(interaction.guildId);
    const target = interaction.options.getMember('membre');
    const amount = interaction.options.getInteger('montant', true);
    const message = interaction.options.getString('message');
    const refuse = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (!target) return void (await refuse('Ce membre ne fait pas (ou plus) partie du serveur.'));
    if (target.user.bot) return void (await refuse('Les bots ne savent pas recevoir les câlins. Pas même Voltron, hélas.'));
    if (target.id === interaction.user.id) return void (await refuse('Un câlin à soi-même ? Essaie plutôt avec un camarade.'));

    const toMember = await ensureMember(target);
    try {
      const { sent } = await hug({
        fromMemberId: member.id,
        fromDiscordId: interaction.user.id,
        toMemberId: toMember.id,
        toDiscordId: target.id,
        amount,
        reason: message,
      });
      trackAchievements(interaction.guild, member.id);
      trackAchievements(interaction.guild, toMember.id);
      const note = message ? `\n> ${message}` : '';
      await interaction.reply({
        content: `🤗 ${userMention(interaction.user.id)} fait un câlin à ${userMention(target.id)} et lui offre **${formatAmount(amount, settings)}** !${note}`,
        allowedMentions: { users: [target.id] },
      });
      await interaction.followUp({ content: `Il te reste ${formatAmount(sent.balanceAfter, settings)}.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await refuse(`Il te manque des cœurs : tu n’as que ${formatAmount(err.balance, settings)}. La bourse se remplit avec le temps !`);
        return;
      }
      throw err;
    }
  },
});
