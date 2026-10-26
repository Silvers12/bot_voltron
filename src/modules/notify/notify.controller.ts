import { MessageFlags } from 'discord.js';
import { registerButtonPrefix } from '../../discord/components.js';
import { NotifyError, toggleNotifyRole } from './notify.service.js';
import { NOTIFY_ROLES, NOTIFY_TOGGLE_PREFIX, type NotifyKey } from './notify.view.js';

registerButtonPrefix(NOTIFY_TOGGLE_PREFIX, async ({ interaction, guildMember, arg }) => {
  const info = NOTIFY_ROLES.find((r) => r.key === arg);
  if (!info) return void (await interaction.reply({ content: 'Bouton inconnu.', flags: MessageFlags.Ephemeral }));
  try {
    const on = await toggleNotifyRole(guildMember, info.key as NotifyKey);
    await interaction.reply({
      content: on ? `${info.emoji} Tu seras prévenu pour **${info.label.toLowerCase()}**. Reclique pour arrêter.` : `${info.emoji} Tu ne seras plus prévenu pour **${info.label.toLowerCase()}**.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    if (err instanceof NotifyError) return void (await interaction.reply({ content: `Impossible pour le moment : ${err.message}`, flags: MessageFlags.Ephemeral }));
    throw err;
  }
});
