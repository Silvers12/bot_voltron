import sharp from 'sharp';
import { BANNER_W as W, esc, FONT } from './image.js';

/** Ligne d'une liste : libellé, valeur à droite (colorée), sous-ligne, numéro, grisée. */
export interface ListRow {
  label: string;
  value?: string;
  valueColor?: string;
  sub?: string;
  index?: number | string;
  muted?: boolean;
}
export interface ListGroup { group: string }
export type ListLine = ListRow | ListGroup;

export interface ListCard {
  title: string;
  subtitle?: string;
  /** Couleur d'accent (hex CSS) */
  color: string;
  lines: ListLine[];
  /** Texte affiché quand la liste est vide */
  empty?: string;
  footer?: string;
}

const PAD = 50, HEADER = 150, ROW = 50, SUB = 28, GROUP = 64, FOOTER = 60;
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Carte-liste 1200 × (hauteur selon le contenu) : bandeau titre, groupes, lignes alternées, pied. */
export async function renderListCard({ title, subtitle, color, lines, empty, footer }: ListCard): Promise<Buffer> {
  const rowHeight = (l: ListLine) => ('group' in l ? GROUP : ROW + (l.sub ? SUB : 0));
  const bodyH = lines.length ? lines.reduce((n, l) => n + rowHeight(l), 0) : ROW + 10;
  const H = HEADER + bodyH + (footer ? FOOTER : 0) + PAD / 2;

  let y = HEADER;
  let stripe = 0;
  const body: string[] = [];
  if (!lines.length) body.push(`<text x="${PAD + 20}" y="${y + 34}" font-family="${FONT}" font-size="26" fill="#dfe6ee">${esc(empty ?? 'Rien à afficher.')}</text>`);
  for (const l of lines) {
    if ('group' in l) {
      y += 18;
      body.push(`<rect x="${PAD}" y="${y + 8}" width="8" height="30" rx="4" fill="${color}"/>`);
      body.push(`<text x="${PAD + 24}" y="${y + 32}" font-family="${FONT}" font-size="28" font-weight="bold" fill="#fff">${esc(cut(l.group, 60))}</text>`);
      y += GROUP - 18;
      stripe = 0;
      continue;
    }
    const h = rowHeight(l);
    if (stripe % 2 === 0) body.push(`<rect x="${PAD - 10}" y="${y}" width="${W - 2 * PAD + 20}" height="${h}" rx="14" fill="#fff" opacity="0.06"/>`);
    stripe++;
    const fill = l.muted ? '#9aa7b2' : '#f4f7fa';
    let x = PAD + 10;
    if (l.index !== undefined) {
      body.push(`<circle cx="${x + 18}" cy="${y + 26}" r="18" fill="${color}"/>`);
      body.push(`<text x="${x + 18}" y="${y + 33}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="bold" fill="#fff">${esc(String(l.index))}</text>`);
      x += 52;
    }
    body.push(`<text x="${x}" y="${y + 34}" font-family="${FONT}" font-size="26" ${l.muted ? '' : 'font-weight="bold"'} fill="${fill}">${esc(cut(l.label, l.value ? 52 : 70))}</text>`);
    if (l.value) body.push(`<text x="${W - PAD - 10}" y="${y + 34}" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="bold" fill="${l.valueColor ?? '#f1c40f'}">${esc(cut(l.value, 28))}</text>`);
    if (l.sub) body.push(`<text x="${x}" y="${y + 34 + SUB}" font-family="${FONT}" font-size="20" fill="${l.muted ? '#8a97a3' : '#c9d3dc'}">${esc(cut(l.sub, 100))}</text>`);
    y += h;
  }
  if (footer) body.push(`<text x="${PAD + 10}" y="${H - PAD / 2 - 14}" font-family="${FONT}" font-size="22" fill="#dfe6ee">${esc(cut(footer, 100))}</text>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.85"/><stop offset="${Math.min(1, 220 / H)}" stop-color="#1b2838"/><stop offset="1" stop-color="#1b2838"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${W - 120}" cy="60" r="130" fill="#fff" opacity="0.06"/>
    <text x="${PAD + 10}" y="${subtitle ? 74 : 92}" font-family="${FONT}" font-size="50" font-weight="bold" fill="#fff">${esc(cut(title, 40))}</text>
    ${subtitle ? `<text x="${PAD + 12}" y="${116}" font-family="${FONT}" font-size="26" fill="#eef3f7">${esc(cut(subtitle, 80))}</text>` : ''}
    ${body.join('\n')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
