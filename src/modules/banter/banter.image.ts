import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BANNER_W as W, circleAvatar, esc, FONT, wrap } from '../../core/image.js';
import { contentDir } from '../../core/paths.js';
import type { BanterKind, Rarity } from './banter.service.js';

const AVATAR = 150, ICON = 230, PAD = 50;
const LINE = 34, TEXT_SIZE = 25, TEXT_TOP = 300;

export const BANTER_STYLE: Record<Rarity, { label: string; color: string; accent: number }> = {
  classique: { label: 'Classique', color: '#7f8c8d', accent: 0x95a5a6 },
  rare: { label: 'Rare', color: '#2e86c1', accent: 0x3498db },
  epique: { label: 'Épique', color: '#d4a017', accent: 0xf1c40f },
};

/** Illustration fournie dans content/banter/<kind>.png, ou null si absente. */
async function loadVisual(kind: BanterKind): Promise<Buffer | null> {
  try {
    return await sharp(await readFile(path.join(contentDir, 'banter', `${kind}.png`))).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer();
  } catch {
    return null;
  }
}

export interface BanterCard {
  kind: BanterKind;
  rarity: Rarity;
  authorName: string;
  authorAvatarPng: Buffer;
  targetName: string;
  text: string;
}

/** Bannière 1200 × (hauteur selon le texte) : avatar et titre en haut, illustration à droite, texte entier en dessous. */
export async function renderBanterCard({ kind, rarity, authorName, authorAvatarPng, targetName, text: body }: BanterCard): Promise<Buffer> {
  const style = BANTER_STYLE[rarity];
  const short = (n: string) => esc(n.length > 20 ? `${n.slice(0, 19)}…` : n);
  const lines = wrap(body, 80);
  const H = Math.max(400, TEXT_TOP + lines.length * LINE + PAD);
  const title = kind === 'compliment' ? 'Compliment' : 'Insulte (avec amour)';
  const verb = kind === 'compliment' ? 'offre un compliment à' : 'lance une pique à';
  const x = PAD + AVATAR + 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${style.color}" stop-opacity="0.8"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${PAD + AVATAR / 2}" cy="${PAD + AVATAR / 2}" r="${AVATAR / 2 + 7}" fill="${style.color}" opacity="0.9"/>
    <text x="${x}" y="${PAD + 48}" font-family="${FONT}" font-size="44" font-weight="bold" fill="#fff">${title}</text>
    <rect x="${x}" y="${PAD + 70}" width="${style.label.length * 16 + 30}" height="34" rx="17" fill="${style.color}"/>
    <text x="${x + 15}" y="${PAD + 94}" font-family="${FONT}" font-size="22" font-weight="bold" fill="#fff">${style.label}</text>
    <text x="${x}" y="${PAD + 150}" font-family="${FONT}" font-size="28" fill="#dfe6ee">${short(authorName)} ${verb} ${short(targetName)}</text>
    <rect x="${PAD}" y="${TEXT_TOP - 36}" width="${W - 2 * PAD}" height="${lines.length * LINE + 30}" rx="20" fill="#000" opacity="0.22"/>
    ${lines.map((l, i) => `<text x="${PAD + 24}" y="${TEXT_TOP + i * LINE}" font-family="${FONT}" font-size="${TEXT_SIZE}" fill="#f4f7fa">${esc(l)}</text>`).join('')}
  </svg>`;
  const [avatar, icon] = await Promise.all([sharp(await circleAvatar(authorAvatarPng)).resize(AVATAR, AVATAR).png().toBuffer(), loadVisual(kind)]);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [{ input: avatar, left: PAD, top: PAD }];
  if (icon) layers.push({ input: icon, left: W - PAD - ICON, top: 0 });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
