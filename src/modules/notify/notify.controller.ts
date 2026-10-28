import { MessageFlags } from 'discord.js';
import { registerButtonPrefix, registerSelect } from '../../discord/components.js';
import { applyNotifySelection, NotifyError, toggleNotifyRole } from './notify.service.js';
import { NOTIFY_ROLES, NOTIFY_SELECT_ID, NOTIFY_TOGGLE_PREFIX, type NotifyKey } from './notify.view.js';

import { botName } from '../../core/identity.js';
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

// Menu déroulant de la page d'accueil : l'ensemble coché devient l'ensemble porté.
registerSelect(NOTIFY_SELECT_ID, async ({ interaction, guildMember, values }) => {
  const selected = values.filter((v): v is NotifyKey => NOTIFY_ROLES.some((r) => r.key === v));
  try {
    const { on, off } = await applyNotifySelection(guildMember, selected);
    const label = (k: NotifyKey) => { const r = NOTIFY_ROLES.find((x) => x.key === k)!; return `${r.emoji} ${r.label}`; };
    const now = NOTIFY_ROLES.filter((r) => selected.includes(r.key)).map((r) => `${r.emoji} ${r.label}`);
    const lines = [
      on.length ? `Ajouté : ${on.map(label).join(', ')}.` : '',
      off.length ? `Retiré : ${off.map(label).join(', ')}.` : '',
      now.length ? `Tu seras prévenu pour : ${now.join(', ')}.` : `Tu ne seras prévenu de rien. ${botName()} respecte ton calme.`,
    ].filter(Boolean);
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  } catch (err) {
    if (err instanceof NotifyError) return void (await interaction.reply({ content: `Impossible pour le moment : ${err.message}`, flags: MessageFlags.Ephemeral }));
    throw err;
  }
});
