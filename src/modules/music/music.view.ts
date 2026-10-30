import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { card, divider, screen, text } from '../../discord/v2.js';
import { fmtDuration, fmtViews, LOOP_LABEL, progressBar, shorten } from './format.js';
import type { GuildPlayer } from './player.js';
import type { Track } from './ytdlp.js';
import { IDLE_TIMEOUT_MS } from './player.js';

export const YT_PREFIX = 'yt:';
export const YT_JUMP_ID = 'yt:jump';
export const YT_PAGE_PREFIX = 'yt:page:';

const COLOR_PLAYING = 0xff0033, COLOR_PAUSED = 0xf5a623, COLOR_IDLE = 0x3b82f6, COLOR_DONE = 0x5c6370;
const PER_PAGE = 10;

export const label = (t: Track, n = 70) => `[${shorten(t.title, n)}](${t.webpageUrl}) \`${fmtDuration(t.duration)}\``;
const channelLabel = (t: Track) => (!t.uploader ? '—' : t.uploaderUrl ? `[${shorten(t.uploader, 40)}](${t.uploaderUrl})` : shorten(t.uploader, 40));

function controls(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${YT_PREFIX}prev`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}pause`).setEmoji('⏯️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}next`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}stop`).setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${YT_PREFIX}shuffle`).setEmoji('🔀').setLabel('Mélanger').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}loop`).setEmoji('🔁').setLabel('Boucle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}voldown`).setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}volup`).setEmoji('🔊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${YT_PREFIX}queue`).setEmoji('📜').setLabel('À suivre').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Le lecteur : piste en cours, barre de progression, infos, file, et les boutons. */
export function buildPlayerMessage(p: GuildPlayer, state?: 'disconnected') {
  if (state === 'disconnected') {
    const c = card(COLOR_DONE);
    c.addTextDisplayComponents(text('⏹️ **Lecteur arrêté.** Relance avec `/youtube play`.'));
    return { ...screen(c), allowedMentions: { parse: [] as [] } };
  }
  const t = p.current;
  if (!t) {
    const c = card(COLOR_IDLE);
    c.addTextDisplayComponents(text(`## 💤 Lecteur en attente\nAucune piste en lecture. Ajoute de la musique avec \`/youtube play\` (je quitte le vocal après ${IDLE_TIMEOUT_MS / 60_000} min d’inactivité).${p.lastAdded ? `\n\n**➕ Dernier ajout**\n${p.lastAdded}` : ''}`));
    return { ...screen(c, controls()), allowedMentions: { parse: [] as [] } };
  }
  const c = card(p.paused ? COLOR_PAUSED : COLOR_PLAYING);
  c.addTextDisplayComponents(text(`## ${p.paused ? '⏸️ En pause' : '🎶 Lecture en cours'}\n**[${shorten(t.title, 90)}](${t.webpageUrl})**\n${progressBar(p.elapsed(), t.duration)}`));
  if (t.thumbnail) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(t.thumbnail).setDescription(t.title)));
  c.addSeparatorComponents(divider());
  const remaining = p.queue.reduce((n, x) => n + (x.duration ?? 0), 0);
  const next = p.queue[0];
  c.addTextDisplayComponents(text(
    `📺 **Chaîne** · ${channelLabel(t)} · ⏱️ \`${fmtDuration(t.duration)}\` · 👁️ ${fmtViews(t.viewCount)}\n` +
    `🔊 **Volume** · ${Math.round(p.volume * 100)} % · 🔁 **Boucle** · ${LOOP_LABEL[p.loopMode]} · 📜 **File** · ${p.queue.length} piste${p.queue.length > 1 ? 's' : ''} · \`${fmtDuration(remaining)}\`\n` +
    `⏭️ **Suivant** · ${next ? label(next) : '_Fin de la file_'}` +
    (p.lastAdded ? `\n➕ **Dernier ajout** · ${p.lastAdded}` : ''),
  ));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# Demandé par ${t.requester}`));
  return { ...screen(c, controls()), allowedMentions: { parse: [] as [] } };
}

export function queuePages(p: GuildPlayer): number {
  return Math.max(1, Math.ceil(p.queue.length / PER_PAGE));
}

/** La file d'attente, paginée, avec le menu « Lire maintenant… » et les boutons de page. */
export function buildQueueMessage(p: GuildPlayer, page = 1) {
  const pages = queuePages(p);
  page = Math.max(1, Math.min(page, pages));
  const start = (page - 1) * PER_PAGE;
  const items = p.queue.slice(start, start + PER_PAGE);
  const lines = items.map((t, i) => `\`${String(start + i + 1).padStart(2)}.\` ${label(t, 45)} · _${shorten(t.requester, 20)}_`);
  const total = p.queue.reduce((n, x) => n + (x.duration ?? 0), 0);
  const c = card(COLOR_IDLE);
  if (p.current) c.addTextDisplayComponents(text(`## 🎶 En cours\n${label(p.current)}\n${progressBar(p.elapsed(), p.current.duration, 14)}`));
  c.addTextDisplayComponents(text(`## 📜 À suivre (${p.queue.length})\n${lines.join('\n') || '_Rien en attente_'}`));
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(text(`-# Page ${page}/${pages} · ${p.queue.length} piste(s) · ${fmtDuration(total)} restantes · boucle ${LOOP_LABEL[p.loopMode]}`));
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (items.length) {
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(YT_JUMP_ID).setPlaceholder('▶️  Lire maintenant…').addOptions(
        items.map((t, i) => new StringSelectMenuOptionBuilder().setLabel(shorten(`${start + i + 1}. ${t.title}`, 100)).setDescription(shorten(`${fmtDuration(t.duration)} · ${t.requester}`, 100)).setValue(String(start + i + 1))),
      ),
    ));
  }
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${YT_PAGE_PREFIX}1`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`${YT_PAGE_PREFIX}${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`${YT_PAGE_PREFIX}same`).setLabel(`Page ${page}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`${YT_PAGE_PREFIX}${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(page >= pages),
    new ButtonBuilder().setCustomId(`${YT_PAGE_PREFIX}${pages}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages),
  ));
  return { ...screen(c, rows), allowedMentions: { parse: [] as [] } };
}
