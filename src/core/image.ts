import sharp from 'sharp';

/** Assistants partagés par les bannières générées (taux, dés, pièce). */
export const BANNER_W = 1200, BANNER_H = 400, AVATAR = 260;
export const FONT = 'DejaVu Sans, Noto Sans, Noto Emoji, Arial, sans-serif';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function circleAvatar(avatarPng: Buffer): Promise<Buffer> {
  const mask = Buffer.from(`<svg width="${AVATAR}" height="${AVATAR}"><circle cx="${AVATAR / 2}" cy="${AVATAR / 2}" r="${AVATAR / 2}" fill="#fff"/></svg>`);
  return sharp(avatarPng).resize(AVATAR, AVATAR).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Coupe un texte en lignes d'au plus `max` caractères, sur les espaces. */
export function wrap(textToWrap: string, max: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of textToWrap.split(' ')) {
    if ((current + ' ' + word).trim().length > max && current) { lines.push(current); current = word; }
    else current = (current + ' ' + word).trim();
  }
  if (current) lines.push(current);
  return lines;
}
