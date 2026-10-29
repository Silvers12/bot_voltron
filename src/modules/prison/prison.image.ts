import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BANNER_H as H, BANNER_W as W, circleAvatar, esc, FONT, wrap } from '../../core/image.js';
import { contentDir } from '../../core/paths.js';

const AVATAR = 230, ICON = 340, PAD = 50;

/** Illustration fournie dans content/prison/prison.png, ou null si absente. */
async function loadVisual(): Promise<Buffer | null> {
  try {
    return await sharp(await readFile(path.join(contentDir, 'prison', 'prison.png'))).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer();
  } catch {
    return null;
  }
}

export interface PrisonCard {
  name: string;
  avatarPng: Buffer;
  /** Lignes courtes (motif, vraie valeur, suite de la chaîne) ; au plus 4 lignes après retour automatique. */
  lines: string[];
  minutes: number;
}

/** Bannière 1200 × 400 : avatar derrière les barreaux à gauche, verdict au centre, loutre en prison à droite. */
export async function renderPrisonCard({ name, avatarPng, lines: input, minutes }: PrisonCard): Promise<Buffer> {
  const short = esc(name.length > 22 ? `${name.slice(0, 21)}…` : name);
  const x = PAD + AVATAR + 40;
  const textW = W - x - ICON - 20;
  const lines = input.flatMap((l) => wrap(l, Math.floor(textW / 13))).slice(0, 4);
  const duration = minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60}` : `${minutes / 60} h`;
  const cx = PAD + AVATAR / 2, cy = H / 2;
  const bars = [-80, -40, 0, 40, 80].map((dx) => `<rect x="${cx + dx - 6}" y="${cy - AVATAR / 2 - 14}" width="12" height="${AVATAR + 28}" rx="6" fill="#263238" stroke="#90a4ae" stroke-width="2"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1f26"/><stop offset="1" stop-color="#546e7a"/></linearGradient>
      <pattern id="stripes" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="40" fill="#fff" opacity="0.025"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <rect width="${W}" height="${H}" rx="36" fill="url(#stripes)"/>
    <circle cx="${cx}" cy="${cy}" r="${AVATAR / 2 + 8}" fill="#90a4ae" opacity="0.9"/>
    <text x="${x}" y="${PAD + 52}" font-family="${FONT}" font-size="54" font-weight="bold" fill="#fff">En prison !</text>
    <rect x="${x}" y="${PAD + 76}" width="${duration.length * 17 + 100}" height="38" rx="19" fill="#b71c1c"/>
    <text x="${x + 16}" y="${PAD + 103}" font-family="${FONT}" font-size="24" font-weight="bold" fill="#fff">🔒 ${duration} sans jeux</text>
    <text x="${x}" y="${PAD + 152}" font-family="${FONT}" font-size="34" font-weight="bold" fill="#eceff1">${short}</text>
    ${lines.map((l, i) => `<text x="${x}" y="${PAD + 198 + i * 34}" font-family="${FONT}" font-size="26" fill="#cfd8dc">${esc(l)}</text>`).join('')}
  </svg>`;
  const [avatar, icon] = await Promise.all([sharp(await circleAvatar(avatarPng)).resize(AVATAR, AVATAR).png().toBuffer(), loadVisual()]);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [{ input: avatar, left: PAD, top: Math.round(cy - AVATAR / 2) }, { input: Buffer.from(`<svg width="${W}" height="${H}">${bars}</svg>`), left: 0, top: 0 }];
  if (icon) layers.push({ input: icon, left: W - PAD - ICON, top: Math.round((H - ICON) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
