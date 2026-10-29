import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildTheftMessage } from '../../modules/theft/theft.view.js';
import { defineCommand } from '../types.js';
import { trackAchievements } from '../../modules/achievements/achievements.service.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { formatAmount, getSettings } from '../../modules/settings/settings.service.js';
import { attemptTheft, TheftError } from '../../modules/theft/theft.service.js';

import { botName } from '../../core/identity.js';
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('vol')
    .setDescription('Tente de dérober une part de la bourse d’un membre… à tes risques et périls')
    .addUserOption((o) => o.setName('membre').setDescription('Ta cible').setRequired(true)),

  async execute({ interaction, member }) {
    const settings = await getSettings(interaction.guildId);
    const target = interaction.options.getMember('membre');
    // Refus toujours discret : si la réponse publique est déjà réservée, on l'efface et on répond en privé.
    const refuse = async (content: string) => {
      if (!interaction.deferred) return void (await interaction.reply({ content, flags: MessageFlags.Ephemeral }));
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    };

    if (!target) return void (await refuse('Ce membre ne fait pas (ou plus) partie du serveur.'));
    if (target.user.bot) return void (await refuse('Voler un bot ? Ils n’ont que des zéros et des uns dans les poches.'));
    if (target.id === interaction.user.id) return void (await refuse(`Se voler soi-même ? Même ${botName()} n’y comprend rien.`));

    const toMember = await ensureMember(target);
    await interaction.deferReply();
    try {
      const outcome = await attemptTheft(
        { id: member.id, discordUserId: interaction.user.id },
        { id: toMember.id, discordUserId: target.id },
        settings,
        { thief: interaction.member.displayName, target: target.displayName },
        (n) => formatAmount(n, settings),
      );
      trackAchievements(interaction.guild, member.id);
      trackAchievements(interaction.guild, toMember.id);
      await interaction.editReply(await buildTheftMessage(interaction.member, target, outcome, settings));
      await interaction.followUp({ content: `Ta bourse : ${formatAmount(outcome.thiefBalanceAfter, settings)}.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      if (err instanceof TheftError) return void (await refuse(err.message));
      throw err;
    }
  },
});
