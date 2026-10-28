import { MessageFlags } from 'discord.js';
import { registerButtonPrefix } from '../../discord/components.js';
import { joinHug } from './grouphug.service.js';
import { HUG_JOIN_PREFIX } from './grouphug.view.js';

import { botName } from '../../core/identity.js';
// Message public : n'importe quel membre peut rejoindre, une seule fois.
registerButtonPrefix(HUG_JOIN_PREFIX, async ({ interaction, member, arg: hugId }) => {
  const result = await joinHug(interaction.client, hugId, member.id);
  const content = result.ok
    ? `Tu es dans le câlin ! Vous êtes **${result.count}** pour l’instant. 🤗`
    : result.reason === 'already'
      ? `Tu es déjà dans les bras de ${botName()}. Un seul câlin par personne, mais il vient du cœur.`
      : `Trop tard, ${botName()} a déjà refermé les bras. Guette sa prochaine apparition !`;
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
});
