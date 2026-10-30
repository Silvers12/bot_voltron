import sharp from 'sharp';
import { BANNER_H as H, BANNER_W as W, esc, FONT, wrap } from '../../core/image.js';
import { fetchAvatarPng, loadIllustration } from '../../core/duo-card.js';
import { botName } from '../../core/identity.js';
import { fmtDuration, fmtViews } from './format.js';
import type { Track } from './ytdlp.js';

const PAD = 50, THUMB_W = 440, THUMB_H = 248, ICON = 210, AVATAR = 44;

async function fetchImage(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Miniature arrondie 16:9, ou un cadre neutre si elle est indisponible. */
async function thumbnail(buf: Buffer | null): Promise<Buffer> {
  const mask = Buffer.from(`<svg width="${THUMB_W}" height="${THUMB_H}"><rect width="${THUMB_W}" height="${THUMB_H}" rx="22" fill="#fff"/></svg>`);
  const base = buf
    ? sharp(buf).resize(THUMB_W, THUMB_H, { fit: 'cover' })
    : sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 4, background: '#2a2a3a' } });
  return base.png().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Fond : la miniature floutée et assombrie, sinon un dégradé. */
async function background(buf: Buffer | null): Promise<Buffer> {
  if (!buf) return sharp({ create: { width: W, height: H, channels: 4, background: '#1a1030' } }).png().toBuffer();
  return sharp(buf).resize(W, H, { fit: 'cover' }).blur(28).modulate({ brightness: 0.45, saturation: 1.2 }).png().toBuffer();
}

/** Bannière 1200 × 400 du lecteur : miniature à gauche, titre et infos, avatar du demandeur, loutre DJ à droite. */
export async function renderTrackBanner(t: Track): Promise<Buffer> {
  const [thumbBuf, avatarBuf, illustration] = await Promise.all([fetchImage(t.thumbnail), fetchImage(t.requesterAvatar), loadIllustration('musique', 'dj')]);
  const x = PAD + THUMB_W + 40;
  const textW = W - x - (illustration ? ICON - 20 : 0) - PAD;
  const titleLines = wrap(t.title, Math.floor(textW / 15.5)).slice(0, 2);
  if (titleLines.length === 2 && t.title.length > titleLines.join(' ').length) titleLines[1] = `${titleLines[1]!.slice(0, -1)}…`;
  const rounded = (w: number, h: number, r: number) => Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" rx="36" fill="#000" opacity="0.25"/>
    <text x="${x}" y="${PAD + 24}" font-family="${FONT}" font-size="22" font-weight="bold" fill="#ff5c7a">EN LECTURE</text>
    ${titleLines.map((l, i) => `<text x="${x}" y="${PAD + 72 + i * 40}" font-family="${FONT}" font-size="30" font-weight="bold" fill="#fff">${esc(l)}</text>`).join('')}
    <text x="${x}" y="${PAD + 72 + titleLines.length * 40 + 8}" font-family="${FONT}" font-size="24" fill="#d0d4e0">${esc(t.uploader ?? 'Chaîne inconnue')}</text>
    <rect x="${x}" y="${PAD + 72 + titleLines.length * 40 + 34}" width="${fmtDuration(t.duration).length * 15 + 30}" height="36" rx="18" fill="#fff" opacity="0.15"/>
    <text x="${x + 16}" y="${PAD + 72 + titleLines.length * 40 + 59}" font-family="${FONT}" font-size="22" font-weight="bold" fill="#fff">${esc(fmtDuration(t.duration))}</text>
    <text x="${x + fmtDuration(t.duration).length * 15 + 50}" y="${PAD + 72 + titleLines.length * 40 + 59}" font-family="${FONT}" font-size="22" fill="#d0d4e0">${esc(fmtViews(t.viewCount))} vues</text>
    <text x="${x + AVATAR + 14}" y="${H - PAD - 12}" font-family="${FONT}" font-size="22" fill="#d0d4e0">Demandé par ${esc(t.requester.length > 24 ? `${t.requester.slice(0, 23)}…` : t.requester)}</text>
  </svg>`;
  const layers: Array<{ input: Buffer; left: number; top: number }> = [
    { input: await thumbnail(thumbBuf), left: PAD, top: Math.round((H - THUMB_H) / 2) },
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];
  if (avatarBuf) layers.push({ input: await sharp(avatarBuf).resize(AVATAR, AVATAR).composite([{ input: rounded(AVATAR, AVATAR, AVATAR / 2), blend: 'dest-in' }]).png().toBuffer(), left: x, top: H - PAD - 42 });
  if (illustration) layers.push({ input: await sharp(illustration).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer(), left: W - PAD - ICON + 30, top: Math.round((H - ICON) / 2) });
  const mask = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="36" fill="#fff"/></svg>`);
  return sharp(await background(thumbBuf)).composite([...layers, { input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Bannière du lecteur en attente. */
export async function renderIdleBanner(): Promise<Buffer> {
  const illustration = await loadIllustration('musique', 'dj');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1030"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <text x="${PAD}" y="${PAD + 60}" font-family="${FONT}" font-size="60" font-weight="bold" fill="#fff">Lecteur en attente</text>
    <text x="${PAD}" y="${PAD + 120}" font-family="${FONT}" font-size="26" fill="#d6eaf8">${esc(botName())} attend la prochaine piste.</text>
    <text x="${PAD}" y="${PAD + 160}" font-family="${FONT}" font-size="26" fill="#d6eaf8">Ajoute une vidéo, une playlist ou une recherche avec /youtube play.</text>
  </svg>`;
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (illustration) layers.push({ input: await sharp(illustration).resize(300, 300, { fit: 'inside' }).png().toBuffer(), left: W - PAD - 300 + 20, top: Math.round((H - 300) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}

export { fetchAvatarPng };
