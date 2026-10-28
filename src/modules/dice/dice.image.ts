import sharp from 'sharp';
import { AVATAR, BANNER_H as H, BANNER_W as W, circleAvatar, esc, FONT, wrap } from '../../core/image.js';
import { loadVisual, type CoinSide } from './dice.service.js';

const esc16 = (n: string) => esc(n.length > 16 ? `${n.slice(0, 15)}…` : n);

/** Fond commun : dégradé sombre vers la couleur du jeu, halo derrière l'avatar. */
function background(color: string, name: string, subtitle: string, headline: string, lines: string[]): Buffer {
  const x = 320;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${color}" stop-opacity="0.75"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${40 + AVATAR / 2}" cy="${H / 2}" r="${AVATAR / 2 + 8}" fill="${color}" opacity="0.9"/>
    <text x="${x}" y="110" font-family="${FONT}" font-size="54" font-weight="bold" fill="#fff">${esc16(name)}</text>
    <text x="${x}" y="170" font-family="${FONT}" font-size="34" fill="#dfe6ee">${esc(subtitle)}</text>
    <text x="${x}" y="262" font-family="${FONT}" font-size="76" font-weight="bold" fill="#fff">${esc(headline)}</text>
    ${lines.map((l, i) => `<text x="${x}" y="${322 + i * 32}" font-family="${FONT}" font-size="24" fill="#eef3f7">${esc(l)}</text>`).join('')}
  </svg>`);
}

const fit = (png: Buffer, size: number) => sharp(png).resize(size, size, { fit: 'inside' }).png().toBuffer();

/** Bannière du lancer de dés : avatar, total, et les dés à droite (une ligne jusqu'à 3, deux lignes au-delà). */
export async function renderDiceCard(name: string, avatarPng: Buffer, rolls: number[]): Promise<Buffer> {
  const total = rolls.reduce((a, b) => a + b, 0);
  const single = rolls.length === 1;
  const subtitle = single ? 'lance le dé' : `lance ${rolls.length} dés`;
  const lines = single ? [] : wrap(`${rolls.join(' + ')} = ${total}`, 44).slice(0, 1);
  const bg = background('#e74c3c', name, subtitle, `${total}`, lines);

  const visuals = (await Promise.all(rolls.map((v) => loadVisual(`de_${v}`)))).filter((b): b is Buffer => b !== null);
  const areaLeft = 620, areaW = W - areaLeft - 40;
  const perRow = visuals.length <= 3 ? visuals.length : Math.ceil(visuals.length / 2);
  const rows = visuals.length <= 3 ? 1 : 2;
  const size = Math.min(300, Math.floor(areaW / Math.max(1, perRow)) - 10, Math.floor((H - 40) / rows) - 10);
  const tiles = await Promise.all(visuals.map((b) => fit(b, size)));
  const composites = tiles.map((input, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = row === rows - 1 ? tiles.length - perRow * (rows - 1) : perRow;
    const rowW = inRow * (size + 10) - 10;
    const left = areaLeft + Math.round((areaW - rowW) / 2) + col * (size + 10);
    const top = Math.round((H - (rows * (size + 10) - 10)) / 2) + row * (size + 10);
    return { input, left, top };
  });
  const avatar = await circleAvatar(avatarPng);
  return sharp(bg).composite([{ input: avatar, left: 40, top: (H - AVATAR) / 2 }, ...composites]).png().toBuffer();
}

/** Bannière du pile ou face : avatar, résultat, pièce à droite. */
export async function renderCoinCard(name: string, avatarPng: Buffer, side: CoinSide, bet: CoinSide | null): Promise<Buffer> {
  const label = side === 'pile' ? 'Pile' : 'Face';
  const verdict = bet ? (bet === side ? 'Pari gagné, bien vu !' : `Pari perdu, tu avais dit ${bet}.`) : 'Aucun pari, juste le destin.';
  const bg = background('#f1c40f', name, 'lance la pièce…', `${label} !`, [verdict]);
  const [avatar, coin] = await Promise.all([circleAvatar(avatarPng), loadVisual(side)]);
  const layers = [{ input: avatar, left: 40, top: (H - AVATAR) / 2 }];
  if (coin) layers.push({ input: await fit(coin, 300), left: W - 300 - 60, top: (H - 300) / 2 });
  return sharp(bg).composite(layers).png().toBuffer();
}
