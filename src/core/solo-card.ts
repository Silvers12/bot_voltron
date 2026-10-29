import sharp from 'sharp';
import { BANNER_H as H, BANNER_W as W, circleAvatar, esc, FONT, wrap } from './image.js';

const AVATAR = 230, ICON = 300, PAD = 50;

export interface SoloCard {
  title: string;
  badge: string;
  badgeColor: string;
  from: string;
  to: string;
  name: string;
  avatarPng: Buffer;
  /** Lignes courtes ; retour automatique, 4 lignes au plus. */
  lines: string[];
  illustration: Buffer | null;
}

/** Bannière 1200 × 400 à un personnage : avatar à gauche, titre, pastille, nom, lignes, illustration à droite. */
export async function renderSoloCard(c: SoloCard): Promise<Buffer> {
  const short = esc(c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name);
  const x = PAD + AVATAR + 40;
  const textW = W - x - (c.illustration ? ICON : 0) - 30;
  const lines = c.lines.flatMap((l) => wrap(l, Math.floor(textW / 14))).slice(0, 4);
  const cy = H / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${PAD + AVATAR / 2}" cy="${cy}" r="${AVATAR / 2 + 8}" fill="#fff" opacity="0.85"/>
    <text x="${x}" y="${PAD + 52}" font-family="${FONT}" font-size="46" font-weight="bold" fill="#fff">${esc(c.title)}</text>
    <rect x="${x}" y="${PAD + 76}" width="${[...c.badge].length * 15 + 44}" height="40" rx="20" fill="${c.badgeColor}"/>
    <text x="${x + 20}" y="${PAD + 104}" font-family="${FONT}" font-size="25" font-weight="bold" fill="#fff">${esc(c.badge)}</text>
    <text x="${x}" y="${PAD + 158}" font-family="${FONT}" font-size="34" font-weight="bold" fill="#f5f5f5">${short}</text>
    ${lines.map((l, i) => `<text x="${x}" y="${PAD + 204 + i * 34}" font-family="${FONT}" font-size="25" fill="#e8eaf6">${esc(l)}</text>`).join('')}
  </svg>`;
  const avatar = await sharp(await circleAvatar(c.avatarPng)).resize(AVATAR, AVATAR).png().toBuffer();
  const layers: Array<{ input: Buffer; left: number; top: number }> = [{ input: avatar, left: PAD, top: Math.round(cy - AVATAR / 2) }];
  if (c.illustration) layers.push({ input: await sharp(c.illustration).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer(), left: W - PAD - ICON + 10, top: Math.round((H - ICON) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
