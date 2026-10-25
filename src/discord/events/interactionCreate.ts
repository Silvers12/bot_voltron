import { Events, MessageFlags, type Interaction, type RepliableInteraction } from 'discord.js';
import { defineEvent } from '../types.js';
import { config } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { getButtonHandler } from '../components.js';

const log = createLogger('interactions');

async function replyError(interaction: RepliableInteraction, content: string) {
  const payload = { content, flags: MessageFlags.Ephemeral } as const;
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

/** Refuse tout ce qui ne vient pas du serveur autorisé (bot privé). */
function isAllowed(interaction: Interaction): interaction is Interaction<'cached'> {
  return interaction.inCachedGuild() && interaction.guildId === config.discord.guildId;
}

export default defineEvent({
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    if (!isAllowed(interaction)) {
      if (interaction.isRepliable()) await replyError(interaction, 'Voltron ne sert que sa propre compagnie.');
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          log.warn(`Commande inconnue : ${interaction.commandName}`);
          return;
        }
        const member = await ensureMember(interaction.member);
        await command.execute({ interaction, guildMember: interaction.member, member });
        return;
      }

      if (interaction.isButton()) {
        const handler = getButtonHandler(interaction.customId);
        if (!handler) {
          await replyError(interaction, 'Ce bouton n’est plus valide. Rouvre `/profil`.');
          return;
        }
        const member = await ensureMember(interaction.member);
        await handler({ interaction, guildMember: interaction.member, member });
        return;
      }
    } catch (err) {
      log.error('Erreur pendant une interaction', err);
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Par mes moustaches, quelque chose a mal tourné. Réessaie dans un instant.').catch(() => {});
      }
    }
  },
});
