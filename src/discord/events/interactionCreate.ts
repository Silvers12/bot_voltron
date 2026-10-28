import { Events, MessageFlags, type Interaction, type RepliableInteraction } from 'discord.js';
import { defineEvent } from '../types.js';
import { isAllowedGuild } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { resolveButton, resolveModal, resolveSelect } from '../components.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { DISABLED_MESSAGE, featureForCommand, featureForComponent, isFeatureEnabled } from '../../modules/features/features.js';
import { isCommandChannelAllowed } from '../../modules/settings/commands.admin.js';
import { channelMention } from 'discord.js';

import { botName } from '../../core/identity.js';
const log = createLogger('interactions');

async function replyError(interaction: RepliableInteraction, content: string) {
  const payload = { content, flags: MessageFlags.Ephemeral } as const;
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

/** Fonctionnalité coupée par l'intendance ? (undefined = jamais gardée) */
async function isDisabled(guildId: string, feature: ReturnType<typeof featureForCommand>): Promise<boolean> {
  return feature !== undefined && !isFeatureEnabled(await getSettings(guildId), feature);
}

/** Refuse tout ce qui ne vient pas du serveur autorisé (bot privé). */
function isAllowed(interaction: Interaction): interaction is Interaction<'cached'> {
  return interaction.inCachedGuild() && isAllowedGuild(interaction.guildId);
}

export default defineEvent({
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    if (!isAllowed(interaction)) {
      if (interaction.isRepliable()) await replyError(interaction, `${botName()} ne sert que sa propre compagnie.`);
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          log.warn(`Commande inconnue : ${interaction.commandName}`);
          return;
        }
        if (await isDisabled(interaction.guildId, featureForCommand(interaction.commandName))) return replyError(interaction, DISABLED_MESSAGE);
        if (interaction.commandName !== 'admin') {
          const s = await getSettings(interaction.guildId);
          if (!isCommandChannelAllowed(s, interaction.channelId)) {
            return replyError(interaction, `Les commandes de ${botName()} s’utilisent dans ${s.commandChannelIds.map(channelMention).join(' ou ')}. Je t’y attends !`);
          }
        }
        const member = await ensureMember(interaction.member);
        await command.execute({ interaction, guildMember: interaction.member, member });
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        else await interaction.respond([]);
        return;
      }

      if (interaction.isButton()) {
        const resolved = resolveButton(interaction.customId);
        if (!resolved) {
          await replyError(interaction, 'Ce bouton n’est plus valide. Rouvre `/profil`.');
          return;
        }
        if (await isDisabled(interaction.guildId, featureForComponent(interaction.customId))) return replyError(interaction, DISABLED_MESSAGE);
        const member = await ensureMember(interaction.member);
        await resolved.handler({ interaction, guildMember: interaction.member, member, arg: resolved.arg });
        return;
      }

      if (interaction.isModalSubmit()) {
        const resolved = resolveModal(interaction.customId);
        if (!resolved) {
          await replyError(interaction, 'Ce formulaire n’est plus valide.');
          return;
        }
        const member = await ensureMember(interaction.member);
        await resolved.handler({ interaction, guildMember: interaction.member, member, arg: resolved.arg });
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handler = resolveSelect(interaction.customId);
        if (!handler) {
          await replyError(interaction, 'Ce menu n’est plus valide. Rouvre `/profil`.');
          return;
        }
        if (await isDisabled(interaction.guildId, featureForComponent(interaction.customId))) return replyError(interaction, DISABLED_MESSAGE);
        const member = await ensureMember(interaction.member);
        await handler({ interaction, guildMember: interaction.member, member, values: interaction.values });
        return;
      }
    } catch (err) {
      log.error('Erreur pendant une interaction', err);
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Oups, quelque chose a mal tourné. Réessaie dans un instant.').catch(() => {});
      }
    }
  },
});
