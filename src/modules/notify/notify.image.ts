import sharp from 'sharp';
import { BANNER_H as H, BANNER_W as W, esc, FONT } from '../../core/image.js';
import { loadIllustration } from '../../core/duo-card.js';
import { botName } from '../../core/identity.js';

const ICON = 330, PAD = 60;

/** Bannière 1200 × 400 de la page des notifications : titre, explication, loutre à la cloche à droite. */
export async function renderNotifyBanner(): Promise<Buffer> {
  const lines = [
    `${botName()} ne mentionne que celles et ceux qui l’ont demandé.`,
    'Deux menus : les annonces générales (rôles)',
    'et les mentions qui te concernent personnellement.',
    'Coche ce qui t’intéresse, décoche pour arrêter.',
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2b45"/><stop offset="1" stop-color="#2e86c1"/></linearGradient>
      <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="2" fill="#fff" opacity="0.08"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <rect width="${W}" height="${H}" rx="36" fill="url(#dots)"/>
    <text x="${PAD}" y="${PAD + 60}" font-family="${FONT}" font-size="64" font-weight="bold" fill="#fff">Notifications</text>
    <rect x="${PAD}" y="${PAD + 92}" width="260" height="36" rx="18" fill="#fff" opacity="0.15"/>
    <text x="${PAD + 18}" y="${PAD + 117}" font-family="${FONT}" font-size="22" font-weight="bold" fill="#fff">Choisis ce que tu reçois</text>
    ${lines.map((l, i) => `<text x="${PAD}" y="${PAD + 178 + i * 36}" font-family="${FONT}" font-size="26" fill="#d6eaf8">${esc(l)}</text>`).join('')}
  </svg>`;
  const icon = await loadIllustration('notify', 'cloche');
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (icon) layers.push({ input: await sharp(icon).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer(), left: W - PAD - ICON + 20, top: Math.round((H - ICON) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
