import { execFile } from 'node:child_process';
import { createLogger } from '../../core/logger.js';

const log = createLogger('yt-dlp');
export const YTDLP_BIN = process.env['YTDLP_BIN'] ?? 'yt-dlp';
const MAX_PLAYLIST = 500;
/** Audio seul, flux http continu de préférence (plus stable pour ffmpeg que le DASH). */
const FORMAT = 'bestaudio[acodec=opus][protocol^=http]/bestaudio[protocol^=http]/bestaudio/best';

function baseArgs(): string[] {
  const args = ['--no-warnings', '--ignore-errors', '--no-cache-dir', '--default-search', 'ytsearch1', '--source-address', '0.0.0.0', '-f', FORMAT];
  const cookies = process.env['YTDLP_COOKIES'];
  if (cookies) args.push('--cookies', cookies);
  return args;
}

function run(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(YTDLP_BIN, [...baseArgs(), ...args], { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err && !stdout.trim()) {
        const detail = stderr.toString().split('\n').filter((l) => l.startsWith('ERROR')).pop()?.replace(/^ERROR:\s*(\[[^\]]+\]\s*\S+:\s*)?/, '') ?? err.message;
        reject(new Error(detail.length > 200 ? `${detail.slice(0, 199)}…` : detail));
        return;
      }
      resolve(stdout.toString());
    });
  });
}

export interface Track {
  title: string;
  webpageUrl: string;
  duration: number | null;
  requester: string;
  requesterId: string;
  requesterAvatar: string | null;
  thumbnail: string | null;
  uploader: string | null;
  uploaderUrl: string | null;
  viewCount: number | null;
}

export interface ExtractResult {
  tracks: Track[];
  playlistTitle: string | null;
}

type Info = Record<string, unknown> & { entries?: Array<Info | null> };

function trackFrom(e: Info, url: string, requester: string, requesterId: string, requesterAvatar: string | null): Track {
  const thumbs = e['thumbnails'] as Array<{ url?: string }> | undefined;
  return {
    title: (e['title'] as string) || 'Titre inconnu',
    webpageUrl: url,
    duration: typeof e['duration'] === 'number' ? e['duration'] : null,
    requester, requesterId, requesterAvatar,
    thumbnail: (e['thumbnail'] as string) ?? thumbs?.at(-1)?.url ?? null,
    uploader: (e['uploader'] as string) ?? (e['channel'] as string) ?? null,
    uploaderUrl: (e['uploader_url'] as string) ?? (e['channel_url'] as string) ?? null,
    viewCount: typeof e['view_count'] === 'number' ? e['view_count'] : null,
  };
}

/** Transforme une URL (vidéo ou playlist) ou une recherche en liste de pistes. */
export async function extract(query: string, requester: string, requesterId: string, requesterAvatar: string | null = null): Promise<ExtractResult> {
  const out = await run(['-J', '--flat-playlist', query]);
  const info = JSON.parse(out) as Info;
  if (!info) throw new Error('Impossible de récupérer cette vidéo ou playlist.');
  if (Array.isArray(info.entries)) {
    let entries = info.entries.filter((e): e is Info => !!e);
    if (String(info['extractor_key'] ?? '').toLowerCase().startsWith('youtubesearch')) entries = entries.slice(0, 1);
    const tracks: Track[] = [];
    for (const e of entries.slice(0, MAX_PLAYLIST)) {
      let url = (e['url'] as string) || (e['webpage_url'] as string);
      if (!url) continue;
      if (!url.startsWith('http')) url = `https://www.youtube.com/watch?v=${(e['id'] as string) ?? url}`;
      tracks.push(trackFrom(e, url, requester, requesterId, requesterAvatar));
    }
    if (!tracks.length) throw new Error('Playlist vide ou vidéos indisponibles.');
    return { tracks, playlistTitle: tracks.length === 1 ? null : ((info['title'] as string) ?? null) };
  }
  return { tracks: [trackFrom(info, (info['webpage_url'] as string) || query, requester, requesterId, requesterAvatar)], playlistTitle: null };
}

/** Résout l'URL du flux audio juste avant la lecture (les URLs expirent) et complète la fiche de la piste. */
export async function resolveStream(track: Track): Promise<string> {
  const out = await run(['-j', '--no-playlist', track.webpageUrl]);
  const info = JSON.parse(out) as Info;
  if (!info) throw new Error('Vidéo indisponible.');
  track.title = (info['title'] as string) || track.title;
  track.duration = typeof info['duration'] === 'number' ? info['duration'] : track.duration;
  track.thumbnail = (info['thumbnail'] as string) ?? track.thumbnail;
  track.uploader = (info['uploader'] as string) ?? (info['channel'] as string) ?? track.uploader;
  track.uploaderUrl = (info['uploader_url'] as string) ?? (info['channel_url'] as string) ?? track.uploaderUrl;
  track.viewCount = typeof info['view_count'] === 'number' ? info['view_count'] : track.viewCount;
  const formats = info['formats'] as Array<{ url?: string }> | undefined;
  const url = (info['url'] as string) ?? formats?.at(-1)?.url;
  if (!url) throw new Error('Aucun flux audio trouvé.');
  return url;
}

/** Mise à jour de yt-dlp (le binaire se remplace lui-même). Retourne la sortie utile. */
export function updateYtdlp(): Promise<string> {
  return new Promise((resolve) => {
    execFile(YTDLP_BIN, ['-U'], { timeout: 120_000 }, (err, stdout, stderr) => {
      const text = `${stdout}${stderr}`.trim().split('\n').pop() ?? '';
      if (err) log.warn(`Mise à jour de yt-dlp échouée : ${err.message}`);
      resolve(text);
    });
  });
}

export function ytdlpVersion(): Promise<string | null> {
  return new Promise((resolve) => execFile(YTDLP_BIN, ['--version'], { timeout: 15_000 }, (err, stdout) => resolve(err ? null : stdout.toString().trim())));
}
