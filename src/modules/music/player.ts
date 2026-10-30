import { spawn, type ChildProcess } from 'node:child_process';
import {
  AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, NoSubscriberBehavior, StreamType,
  VoiceConnectionStatus, type AudioPlayer, type VoiceConnection,
} from '@discordjs/voice';
import type { Guild, GuildTextBasedChannel, Message, RepliableInteraction, VoiceBasedChannel } from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { LOOP_NEXT, type LoopMode } from './format.js';
import { resolveStream, type Track } from './ytdlp.js';
import { buildPlayerMessage } from './music.view.js';
import { renderIdleBanner, renderTrackBanner } from './music.image.js';

const log = createLogger('musique');

export const IDLE_TIMEOUT_MS = 5 * 60_000;
const HISTORY_SIZE = 50;
const PROGRESS_REFRESH_MS = 15_000;
const OPUS_BITRATE = '192k';

/** Lecteur d'un serveur : file, historique, connexion vocale, ffmpeg et message « contrôleur » à boutons. */
export class GuildPlayer {
  queue: Track[] = [];
  history: Track[] = [];
  current: Track | null = null;
  loopMode: LoopMode = 'off';
  volume = 1;
  lastAdded: string | null = null;
  controller: Message | null = null;
  private connection: VoiceConnection | null = null;
  private readonly audio: AudioPlayer;
  private ffmpeg: ChildProcess | null = null;
  private skipped = false;
  private back = false;
  private restartAt: number | null = null;
  private seek = 0;
  private startedAt = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private stopped = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private advancing = false;
  /** Bannière de la piste affichée : rendu mis en cache, et URL du fichier déjà envoyé pour les rafraîchissements. */
  private banner: { track: Track | null; file: Buffer | null; url: string | null } = { track: null, file: null, url: null };

  constructor(readonly guild: Guild, public textChannel: GuildTextBasedChannel, private readonly onStop: () => void) {
    this.audio = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.audio.on('error', (err) => log.warn(`Erreur de lecture sur ${guild.name}`, err));
    this.audio.on('debug', (m) => log.debug(`lecteur : ${m}`));
    this.audio.on('stateChange', (before, after) => {
      log.debug(`Lecteur ${guild.name} : ${before.status} → ${after.status}`);
      if (after.status === AudioPlayerStatus.Idle && before.status !== AudioPlayerStatus.Idle) void this.onTrackEnd();
    });
  }

  // ---- état ----

  get connected(): boolean {
    return !!this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed && this.connection.state.status !== VoiceConnectionStatus.Disconnected;
  }

  get voiceChannelId(): string | null {
    return this.connection?.joinConfig.channelId ?? null;
  }

  get paused(): boolean {
    return this.audio.state.status === AudioPlayerStatus.Paused || this.audio.state.status === AudioPlayerStatus.AutoPaused;
  }

  get playing(): boolean {
    return this.current !== null && (this.audio.state.status === AudioPlayerStatus.Playing || this.paused || this.audio.state.status === AudioPlayerStatus.Buffering);
  }

  elapsed(): number {
    if (!this.current) return 0;
    const end = this.pausedAt ?? Date.now();
    return Math.max(0, this.seek + (end - this.startedAt) / 1000 - this.pausedTotal);
  }

  // ---- connexion ----

  async connect(channel: VoiceBasedChannel): Promise<void> {
    if (this.connection && this.voiceChannelId === channel.id && this.connected) return;
    if (this.connection) this.connection.destroy();
    const connection = joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: true });
    this.connection = connection;
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      // Coupure réseau ou changement de salon : on laisse 5 s à la reconnexion, sinon on arrête tout.
      try {
        await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5_000), entersState(connection, VoiceConnectionStatus.Connecting, 5_000)]);
      } catch {
        if (this.connection === connection) await this.stop();
      }
    });
    connection.on('error', (err) => log.warn(`Connexion vocale sur ${channel.guild.name}`, err));
    connection.on('stateChange', (before, after) => log.debug(`Connexion ${channel.guild.name} : ${before.status} → ${after.status}`));
    connection.on('debug', (m) => log.debug(`connexion : ${m.slice(0, 300)}`));
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (err) {
      log.warn(`Connexion vocale impossible sur ${channel.guild.name} (#${channel.name}, état ${connection.state.status})`, err);
      connection.destroy();
      this.connection = null;
      throw new Error('Connexion au salon vocal impossible (délai dépassé). Vérifie mes permissions sur ce salon.');
    }
    connection.subscribe(this.audio);
  }

  // ---- actions ----

  enqueue(tracks: Track[]): void {
    this.queue.push(...tracks);
    this.stopped = false;
    this.clearIdle();
    if (!this.current) void this.next();
  }

  skip(): void {
    if (!this.current) return;
    this.skipped = true;
    this.audio.stop(true);
  }

  previous(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    if (this.current) this.queue.unshift(this.current);
    this.queue.unshift(prev);
    this.back = true;
    this.skipped = true;
    if (this.current) this.audio.stop(true);
    else void this.next();
    return true;
  }

  pause(): boolean {
    if (!this.current || this.paused) return false;
    if (!this.audio.pause(true)) return false;
    this.pausedAt = Date.now();
    return true;
  }

  resume(): boolean {
    if (!this.paused) return false;
    if (!this.audio.unpause()) return false;
    if (this.pausedAt !== null) { this.pausedTotal += (Date.now() - this.pausedAt) / 1000; this.pausedAt = null; }
    return true;
  }

  togglePause(): 'paused' | 'resumed' | null {
    if (this.pause()) return 'paused';
    if (this.resume()) return 'resumed';
    return null;
  }

  /** ffmpeg encode en Opus avec le volume appliqué : on relance la piste à la même position. */
  setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(2, level));
    if (this.current) { this.restartAt = this.elapsed(); this.audio.stop(true); }
  }

  jumpTo(index: number): Track | null {
    if (index < 1 || index > this.queue.length) return null;
    const [track] = this.queue.splice(index - 1, 1);
    this.queue.unshift(track!);
    if (this.current) this.skip(); else void this.next();
    return track!;
  }

  shuffle(): number {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j]!, this.queue[i]!];
    }
    return this.queue.length;
  }

  cycleLoop(): LoopMode {
    this.loopMode = LOOP_NEXT[this.loopMode];
    return this.loopMode;
  }

  remove(index: number): Track | null {
    if (index < 1 || index > this.queue.length) return null;
    return this.queue.splice(index - 1, 1)[0] ?? null;
  }

  clear(): number {
    const n = this.queue.length;
    this.queue = [];
    return n;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearIdle();
    this.stopRefresh();
    this.queue = [];
    this.history = [];
    this.loopMode = 'off';
    this.current = null;
    this.audio.stop(true);
    this.killFfmpeg();
    if (this.connection) { this.connection.destroy(); this.connection = null; }
    await this.editController('disconnected');
    this.onStop();
  }

  // ---- boucle de lecture ----

  private async next(): Promise<void> {
    if (this.advancing || this.stopped) return;
    this.advancing = true;
    try {
      while (!this.stopped) {
        const track = this.queue.shift();
        if (!track) {
          this.current = null;
          await this.showController();
          this.armIdle();
          return;
        }
        this.current = track;
        this.skipped = false;
        this.back = false;
        this.seek = this.restartAt ?? 0;
        this.restartAt = null;
        let stream: string;
        try {
          stream = await resolveStream(track);
        } catch (err) {
          log.warn(`Piste ignorée ${track.webpageUrl} : ${(err as Error).message}`);
          await this.safeSend(`⚠️ Piste ignorée : **${track.title}** (${(err as Error).message})`);
          this.current = null;
          continue;
        }
        if (this.stopped || !this.connected) { this.current = null; return; }
        this.startFfmpeg(stream);
        this.startedAt = Date.now();
        this.pausedAt = null;
        this.pausedTotal = 0;
        if (this.seek === 0) await this.showController(); else await this.editController();
        this.startRefresh();
        return;
      }
    } catch (err) {
      log.error(`Boucle de lecture plantée sur ${this.guild.name}`, err);
      this.current = null;
      await this.safeSend('❌ Erreur interne du lecteur, relance avec `/youtube play`.');
    } finally {
      this.advancing = false;
    }
  }

  private startFfmpeg(stream: string): void {
    this.killFfmpeg();
    const args = [
      '-nostdin', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '5',
      '-rw_timeout', '15000000', '-analyzeduration', '0',
      ...(this.seek > 0 ? ['-ss', this.seek.toFixed(2)] : []),
      '-i', stream, '-vn', '-af', `volume=${this.volume.toFixed(2)}`,
      '-c:a', 'libopus', '-b:a', OPUS_BITRATE, '-application', 'audio', '-vbr', 'on', '-compression_level', '10', '-frame_duration', '20', '-packet_loss', '2',
      '-f', 'ogg', 'pipe:1',
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr?.on('data', (d: Buffer) => { const line = d.toString().trim(); if (line) log.warn(`ffmpeg : ${line.slice(0, 200)}`); });
    child.on('error', (err) => log.error('ffmpeg introuvable ou impossible à lancer', err));
    let bytes = 0;
    child.stdout?.on('data', (d: Buffer) => { if (bytes === 0) log.debug(`ffmpeg : premier bloc audio (${d.length} o)`); bytes += d.length; });
    child.on('close', (code) => log.debug(`ffmpeg terminé (code ${code}), ${Math.round(bytes / 1024)} Ko produits`));
    this.ffmpeg = child;
    const resource = createAudioResource(child.stdout!, { inputType: StreamType.OggOpus });
    this.audio.play(resource);
  }

  private killFfmpeg(): void {
    if (this.ffmpeg && this.ffmpeg.exitCode === null) this.ffmpeg.kill('SIGKILL');
    this.ffmpeg = null;
  }

  private async onTrackEnd(): Promise<void> {
    this.killFfmpeg();
    this.stopRefresh();
    const track = this.current;
    if (!track || this.stopped) return;
    if (this.restartAt !== null) this.queue.unshift(track); // changement de volume : même piste, même position
    else if (this.back) { /* previous() a déjà remis les pistes en file */ }
    else if (this.loopMode === 'track' && !this.skipped) this.queue.unshift(track);
    else {
      this.history.push(track);
      if (this.history.length > HISTORY_SIZE) this.history.shift();
      if (this.loopMode === 'queue') this.queue.push(track);
    }
    this.current = null;
    await this.next();
  }

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => { void this.stop(); }, IDLE_TIMEOUT_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private startRefresh(): void {
    this.stopRefresh();
    this.refreshTimer = setInterval(() => { if (this.current && !this.paused) void this.editController(); }, PROGRESS_REFRESH_MS);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  // ---- messages ----

  private async safeSend(content: string): Promise<void> {
    await this.textChannel.send({ content, allowedMentions: { parse: [] } }).catch((err) => log.warn(`Envoi impossible dans #${this.textChannel.name}`, err));
  }

  /** Bannière à joindre pour l'état courant (rendue une fois par piste), ou URL déjà en ligne. */
  private async bannerFor(): Promise<{ file?: Buffer; url?: string }> {
    const track = this.current;
    if (this.banner.track !== track || !this.banner.file) {
      const file = await (track ? renderTrackBanner(track) : renderIdleBanner()).catch((err) => { log.warn('Bannière du lecteur impossible', err); return null; });
      this.banner = { track, file, url: null };
    }
    if (this.banner.url) return { url: this.banner.url };
    return this.banner.file ? { file: this.banner.file } : {};
  }

  /** Après envoi, retient l'URL du fichier joint pour les rafraîchissements suivants. */
  private rememberBannerUrl(message: Message | null): void {
    if (!message) return;
    const m = /"url":"(https:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/[^"]*lecteur\.png[^"]*)"/.exec(JSON.stringify(message.components));
    this.banner.url = m?.[1]?.replace(/\\\//g, '/') ?? null;
  }

  /** Publie (ou republie en bas du salon) le lecteur ; l'ancien message est supprimé. Avec une interaction, elle sert de réponse. */
  async showController(interaction?: RepliableInteraction): Promise<void> {
    this.banner.url = null;
    const payload = buildPlayerMessage(this, await this.bannerFor());
    const old = this.controller;
    let sent: Message | null = null;
    try {
      if (interaction) sent = interaction.deferred || interaction.replied ? await interaction.editReply(payload) : await interaction.reply({ ...payload, withResponse: true }).then((r) => r.resource?.message ?? null);
      else sent = await this.textChannel.send(payload);
    } catch (err) {
      log.warn(`Lecteur impossible à afficher dans #${this.textChannel.name}`, err);
      return;
    }
    this.controller = sent;
    this.rememberBannerUrl(sent);
    if (old && sent && old.id !== sent.id) await old.delete().catch(() => undefined);
  }

  async editController(state?: 'disconnected'): Promise<void> {
    if (!this.controller) return;
    const banner = state ? {} : await this.bannerFor();
    const payload = buildPlayerMessage(this, banner, state);
    try {
      const edited = await this.controller.edit(payload);
      if (banner.file) this.rememberBannerUrl(edited);
    } catch (err) {
      if ((err as { code?: number }).code === 10008) this.controller = null;
      else log.warn('Mise à jour du lecteur impossible', err);
    }
  }
}
