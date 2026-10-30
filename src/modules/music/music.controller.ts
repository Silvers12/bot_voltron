import { MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { registerButtonPrefix, registerSelect } from '../../discord/components.js';
import { getSettings } from '../settings/settings.service.js';
import { canDj, getPlayer } from './music.service.js';
import { buildQueueMessage, YT_JUMP_ID, YT_PAGE_PREFIX, YT_PREFIX } from './music.view.js';
import { LOOP_LABEL, shorten } from './format.js';
import type { GuildPlayer } from './player.js';

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral as const });

async function guard(interaction: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>): Promise<GuildPlayer | null> {
  const s = await getSettings(interaction.guildId);
  if (!canDj(interaction.member, s)) { await interaction.reply(ephemeral(`❌ Il faut le rôle <@&${s.djRoleId}> pour contrôler le lecteur.`)); return null; }
  const p = getPlayer(interaction.guildId);
  if (!p) {
    await interaction.reply(ephemeral('Le lecteur n’est pas connecté. Lance `/youtube play`.'));
    if (!interaction.customId.startsWith(YT_PAGE_PREFIX) && interaction.customId !== YT_JUMP_ID) await interaction.message.edit({ components: [] }).catch(() => undefined);
    return null;
  }
  return p;
}

/** Met à jour le lecteur : sur place si c'est le message cliqué, sinon en privé puis via le contrôleur. */
async function refresh(interaction: ButtonInteraction<'cached'>, p: GuildPlayer, toast: string) {
  await interaction.reply(ephemeral(toast));
  await p.editController();
}

registerButtonPrefix(YT_PAGE_PREFIX, async ({ interaction, arg }) => {
  const p = await guard(interaction);
  if (!p) return;
  await interaction.update(buildQueueMessage(p, Number(arg.split(':').pop()) || 1));
});

registerButtonPrefix(YT_PREFIX, async ({ interaction, arg }) => {
  const p = await guard(interaction);
  if (!p) return;
  switch (arg) {
    case 'prev':
      if (!p.previous()) return void (await interaction.reply(ephemeral('Pas de piste précédente.')));
      return refresh(interaction, p, '⏮️ Piste précédente.');
    case 'pause': {
      const state = p.togglePause();
      if (!state) return void (await interaction.reply(ephemeral('Rien en lecture.')));
      return refresh(interaction, p, state === 'paused' ? '⏸️ Pause.' : '▶️ Reprise.');
    }
    case 'next':
      if (!p.current) return void (await interaction.reply(ephemeral('Rien en lecture.')));
      p.skip();
      return refresh(interaction, p, '⏭️ Piste suivante.');
    case 'stop':
      await interaction.deferUpdate();
      return p.stop();
    case 'shuffle':
      return refresh(interaction, p, `🔀 ${p.shuffle()} pistes mélangées.`);
    case 'loop':
      return refresh(interaction, p, `Boucle : ${LOOP_LABEL[p.cycleLoop()]}`);
    case 'voldown':
      p.setVolume(p.volume - 0.1);
      return refresh(interaction, p, `🔉 Volume : ${Math.round(p.volume * 100)} %`);
    case 'volup':
      p.setVolume(p.volume + 0.1);
      return refresh(interaction, p, `🔊 Volume : ${Math.round(p.volume * 100)} %`);
    case 'queue':
      return void (await interaction.reply({ ...buildQueueMessage(p), flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] }));
    default:
      return void (await interaction.reply(ephemeral('Bouton inconnu.')));
  }
});

registerSelect(YT_JUMP_ID, async ({ interaction, values }) => {
  const p = await guard(interaction);
  if (!p) return;
  const track = p.jumpTo(Number(values[0]));
  if (!track) return void (await interaction.reply(ephemeral('Cette piste n’est plus dans la file.')));
  await interaction.update(buildQueueMessage(p));
  await interaction.followUp(ephemeral(`▶️ Lecture de **${shorten(track.title, 80)}**`));
});
