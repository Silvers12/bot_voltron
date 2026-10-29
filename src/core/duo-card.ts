import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BANNER_W as W, circleAvatar, esc, FONT, wrap } from './image.js';
import { contentDir } from './paths.js';

const AVATAR = 150, ICON = 230, PAD = 50, LINE = 33, TEXT_SIZE = 25, TEXT_TOP = 300;

/** Charge une illustration de `content/<dir>/<name>.png` redimensionnée pour la carte, ou null si absente. */
export async function loadIllustration(dir: string, name: string): Promise<Buffer | null> {
  try {
    return await sharp(await readFile(path.join(contentDir, dir, `${name}.png`))).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer();
  } catch {
    return null;
  }
}

export interface DuoCard {
  title: string;
  /** Pastille sous le titre (montant, verdict…). */
  badge: string;
  badgeColor: string;
  /** Couleurs du dégradé de fond. */
  from: string;
  to: string;
  /** Avatar et nom de l'acteur (à gauche) et de la cible (à droite), symbole entre les deux. */
  left: { name: string; avatarPng: Buffer };
  right: { name: string; avatarPng: Buffer };
  link: string;
  /** Récit, coupé automatiquement en lignes. */
  text: string;
  illustration: Buffer | null;
}

/** Bannière 1200 × (selon le texte) à deux personnages : acteur et cible, titre, pastille, récit, illustration à droite. */
export async function renderDuoCard(c: DuoCard): Promise<Buffer> {
  const short = (n: string) => esc(n.length > 16 ? `${n.slice(0, 15)}…` : n);
  const lines = wrap(c.text, 78);
  const H = Math.max(400, TEXT_TOP + lines.length * LINE + PAD);
  const x = PAD + AVATAR * 2 + 90;
  const ax = PAD, bx = PAD + AVATAR + 70, ay = PAD + 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${ax + AVATAR / 2}" cy="${ay + AVATAR / 2}" r="${AVATAR / 2 + 6}" fill="#fff" opacity="0.85"/>
    <circle cx="${bx + AVATAR / 2}" cy="${ay + AVATAR / 2}" r="${AVATAR / 2 + 6}" fill="#fff" opacity="0.85"/>
    <text x="${(ax + bx + AVATAR) / 2}" y="${ay + AVATAR / 2 + 16}" font-family="${FONT}" font-size="44" text-anchor="middle" fill="#fff">${esc(c.link)}</text>
    <text x="${ax + AVATAR / 2}" y="${ay + AVATAR + 34}" font-family="${FONT}" font-size="22" font-weight="bold" text-anchor="middle" fill="#fff">${short(c.left.name)}</text>
    <text x="${bx + AVATAR / 2}" y="${ay + AVATAR + 34}" font-family="${FONT}" font-size="22" font-weight="bold" text-anchor="middle" fill="#fff">${short(c.right.name)}</text>
    <text x="${x}" y="${PAD + 58}" font-family="${FONT}" font-size="50" font-weight="bold" fill="#fff">${esc(c.title)}</text>
    <rect x="${x}" y="${PAD + 84}" width="${[...c.badge].length * 16 + 44}" height="44" rx="22" fill="${c.badgeColor}"/>
    <text x="${x + 22}" y="${PAD + 115}" font-family="${FONT}" font-size="27" font-weight="bold" fill="#fff">${esc(c.badge)}</text>
    <rect x="${PAD}" y="${TEXT_TOP - 36}" width="${W - 2 * PAD}" height="${lines.length * LINE + 30}" rx="20" fill="#000" opacity="0.25"/>
    ${lines.map((l, i) => `<text x="${PAD + 24}" y="${TEXT_TOP + i * LINE}" font-family="${FONT}" font-size="${TEXT_SIZE}" fill="#f4f7fa">${esc(l)}</text>`).join('')}
  </svg>`;
  const [a, b] = await Promise.all([c.left.avatarPng, c.right.avatarPng].map(async (p) => sharp(await circleAvatar(p)).resize(AVATAR, AVATAR).png().toBuffer()));
  const layers: Array<{ input: Buffer; left: number; top: number }> = [{ input: a!, left: ax, top: ay }, { input: b!, left: bx, top: ay }];
  if (c.illustration) layers.push({ input: c.illustration, left: W - PAD - ICON + 20, top: TEXT_TOP - 36 - ICON - 12 });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}

export async function fetchAvatarPng(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}
