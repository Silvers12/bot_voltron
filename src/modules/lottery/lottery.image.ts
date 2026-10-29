import sharp from 'sharp';
import { BANNER_H as H, BANNER_W as W, esc, FONT } from '../../core/image.js';
import { loadIllustration } from '../../core/duo-card.js';
import type { GuildSettings, Lottery } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';

const ICON = 320, PAD = 60;

/** Bannière 1200 × 400 de la tombola : cagnotte en gros, tickets vendus et prix, illustration à droite. Sans date (affichée en texte, à l'heure de chacun). */
export async function renderLotteryBanner(lottery: Lottery, s: GuildSettings): Promise<Buffer> {
  const pot = formatAmount(lottery.pot, s);
  const sold = `${lottery.totalTickets} ticket${lottery.totalTickets > 1 ? 's' : ''} vendu${lottery.totalTickets > 1 ? 's' : ''}`;
  const price = `Ticket à ${formatAmount(lottery.ticketPrice, s)}`;
  const max = s.lotteryMaxTickets > 0 ? ` · max ${s.lotteryMaxTickets} chacun` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a0845"/><stop offset="1" stop-color="#8e44ad"/></linearGradient>
      <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="2" fill="#fff" opacity="0.08"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <rect width="${W}" height="${H}" rx="36" fill="url(#dots)"/>
    <text x="${PAD}" y="${PAD + 46}" font-family="${FONT}" font-size="48" font-weight="bold" fill="#fff">Tombola de la compagnie</text>
    <text x="${PAD}" y="${PAD + 86}" font-family="${FONT}" font-size="24" fill="#e1bee7">Un seul gagnant rafle toute la cagnotte.</text>
    <text x="${PAD}" y="${PAD + 150}" font-family="${FONT}" font-size="26" fill="#ce93d8">CAGNOTTE</text>
    <text x="${PAD}" y="${PAD + 226}" font-family="${FONT}" font-size="78" font-weight="bold" fill="#ffd54f">${esc(pot)}</text>
    <rect x="${PAD}" y="${PAD + 256}" width="${[...sold].length * 15 + 40}" height="40" rx="20" fill="#fff" opacity="0.15"/>
    <text x="${PAD + 20}" y="${PAD + 284}" font-family="${FONT}" font-size="25" font-weight="bold" fill="#fff">${esc(sold)}</text>
    <text x="${PAD + [...sold].length * 15 + 60}" y="${PAD + 284}" font-family="${FONT}" font-size="22" fill="#e1bee7">${esc(price + max)}</text>
  </svg>`;
  const icon = await loadIllustration('tombola', 'tombola');
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (icon) layers.push({ input: await sharp(icon).resize(ICON, ICON, { fit: 'inside' }).png().toBuffer(), left: W - PAD - ICON + 20, top: Math.round((H - ICON) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
