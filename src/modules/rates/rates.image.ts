import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { contentDir } from '../../core/paths.js';
import type { Rate } from './rates.catalog.js';

const W = 1200, H = 400;
const AVATAR = 260, ICON = 260;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const FONT = 'DejaVu Sans, Noto Sans, Arial, sans-serif';

/** Icône du taux : PNG fourni dans content/taux/<key>.png, sinon l'icône vectorielle de secours. */
async function loadIcon(rate: Rate): Promise<Buffer> {
  try {
    return await sharp(await readFile(path.join(contentDir, 'taux', `${rate.key}.png`))).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer();
  } catch {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${ICON}" height="${ICON}"><g fill="${rate.color}" color="${rate.color}">${rate.icon}</g></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}

/** L'icône « remplie » à `percent` : silhouette grisée, recouverte du bas par la version colorée. */
async function filledIcon(rate: Rate, percent: number): Promise<Buffer> {
  const icon = sharp(await loadIcon(rate)).ensureAlpha();
  const { width = ICON, height = ICON } = await icon.metadata();
  const grey = await icon.clone().greyscale().linear(0.35, 150).png().toBuffer();
  const fillHeight = Math.round((height * percent) / 100);
  if (fillHeight === 0) return grey;
  const colored = await icon.clone().extract({ left: 0, top: height - fillHeight, width, height: fillHeight }).png().toBuffer();
  return sharp(grey).composite([{ input: colored, top: height - fillHeight, left: 0 }]).png().toBuffer();
}

async function circleAvatar(avatarPng: Buffer): Promise<Buffer> {
  const mask = Buffer.from(`<svg width="${AVATAR}" height="${AVATAR}"><circle cx="${AVATAR / 2}" cy="${AVATAR / 2}" r="${AVATAR / 2}" fill="#fff"/></svg>`);
  return sharp(avatarPng).resize(AVATAR, AVATAR).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Coupe un texte en lignes d'au plus `max` caractères, sur les espaces. */
function wrap(textToWrap: string, max: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of textToWrap.split(' ')) {
    if ((current + ' ' + word).trim().length > max && current) { lines.push(current); current = word; }
    else current = (current + ' ' + word).trim();
  }
  if (current) lines.push(current);
  return lines;
}

export interface RateCard {
  displayName: string;
  avatarPng: Buffer;
  rate: Rate;
  percent: number;
  comment: string;
}

/** Bannière 1200×400 : avatar à gauche, texte au centre, icône remplie à droite. */
export async function renderRateCard({ displayName, avatarPng, rate, percent, comment }: RateCard): Promise<Buffer> {
  const barW = 520, barX = 320, barY = 262;
  const name = esc(displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName);
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${rate.color}" stop-opacity="0.75"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${40 + AVATAR / 2}" cy="${H / 2}" r="${AVATAR / 2 + 8}" fill="${rate.color}" opacity="0.9"/>
    <text x="${barX}" y="110" font-family="${FONT}" font-size="54" font-weight="bold" fill="#fff">${name}</text>
    <text x="${barX}" y="170" font-family="${FONT}" font-size="34" fill="#dfe6ee">Taux de ${esc(rate.of)}</text>
    <text x="${barX}" y="245" font-family="${FONT}" font-size="76" font-weight="bold" fill="#fff">${percent} %</text>
    <rect x="${barX}" y="${barY}" width="${barW}" height="28" rx="14" fill="#ffffff" opacity="0.22"/>
    <rect x="${barX}" y="${barY}" width="${Math.max(28, Math.round((barW * percent) / 100))}" height="28" rx="14" fill="${rate.color}"/>
    ${wrap(comment, 44).slice(0, 2).map((line, i) => `<text x="${barX}" y="${332 + i * 32}" font-family="${FONT}" font-size="24" fill="#eef3f7">${esc(line)}</text>`).join('')}
  </svg>`;
  const [avatar, icon] = await Promise.all([circleAvatar(avatarPng), filledIcon(rate, percent)]);
  return sharp(Buffer.from(bg))
    .composite([
      { input: avatar, left: 40, top: (H - AVATAR) / 2 },
      { input: icon, left: W - ICON - 60, top: (H - ICON) / 2 },
    ])
    .png()
    .toBuffer();
}

export interface DuoCard {
  leftName: string;
  leftAvatarPng: Buffer;
  rightName: string;
  rightAvatarPng: Buffer;
  rate: Rate;
  percent: number;
  comment: string;
}

/** Bannière à deux : avatar gauche, icône remplie et taux au centre, avatar droite, commentaire en bas. */
export async function renderDuoCard({ leftName, leftAvatarPng, rightName, rightAvatarPng, rate, percent, comment }: DuoCard): Promise<Buffer> {
  const short = (n: string) => esc(n.length > 12 ? `${n.slice(0, 11)}…` : n);
  const cx = W / 2, cy = 150, iconSize = 168, iconTop = 60;
  const lx = 60 + AVATAR / 2, rx = W - 60 - AVATAR / 2;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2838"/><stop offset="0.5" stop-color="${rate.color}" stop-opacity="0.8"/><stop offset="1" stop-color="#1b2838"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${lx}" cy="${cy}" r="${AVATAR / 2 + 8}" fill="${rate.color}" opacity="0.9"/>
    <circle cx="${rx}" cy="${cy}" r="${AVATAR / 2 + 8}" fill="${rate.color}" opacity="0.9"/>
    <text x="${lx}" y="330" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="bold" fill="#fff">${short(leftName)}</text>
    <text x="${rx}" y="330" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="bold" fill="#fff">${short(rightName)}</text>
    <text x="${cx}" y="46" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#dfe6ee">Taux ${/^[aeiouy]/i.test(rate.of) ? 'd’' : 'de '}${esc(rate.of)}</text>
    <text x="${cx}" y="292" text-anchor="middle" font-family="${FONT}" font-size="60" font-weight="bold" fill="#fff">${percent} %</text>
    ${wrap(comment, 36).slice(0, 2).map((line, i) => `<text x="${cx}" y="${338 + i * 28}" text-anchor="middle" font-family="${FONT}" font-size="22" fill="#eef3f7">${esc(line)}</text>`).join('')}
  </svg>`;
  const [left, right, icon] = await Promise.all([circleAvatar(leftAvatarPng), circleAvatar(rightAvatarPng), filledIcon(rate, percent)]);
  const iconResized = await sharp(icon).resize(iconSize, iconSize, { fit: 'inside' }).png().toBuffer();
  return sharp(Buffer.from(bg))
    .composite([
      { input: left, left: 60, top: cy - AVATAR / 2 },
      { input: right, left: W - 60 - AVATAR, top: cy - AVATAR / 2 },
      { input: iconResized, left: Math.round(cx - iconSize / 2), top: iconTop },
    ])
    .png()
    .toBuffer();
}
