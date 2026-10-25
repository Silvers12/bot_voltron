import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../../core/logger.js';

const log = createLogger('banter');

export type Rarity = 'classique' | 'rare' | 'epique';
export const RARITIES: Rarity[] = ['classique', 'rare', 'epique'];

interface Catalog {
  weights: Record<Rarity, number>;
  classique: string[];
  rare: string[];
  epique: string[];
}

export type BanterKind = 'compliment' | 'insulte';

const catalogs = new Map<BanterKind, Catalog>();

/** Dossier `content/` à la racine du projet (fonctionne depuis src/ et dist/). */
const contentDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../content');

function validate(kind: BanterKind, data: unknown): Catalog {
  const c = data as Catalog;
  for (const r of RARITIES) {
    if (!Array.isArray(c[r]) || c[r].length === 0) throw new Error(`${kind}.json : la catégorie « ${r} » doit contenir au moins un texte`);
    if (typeof c.weights?.[r] !== 'number' || c.weights[r] < 0) throw new Error(`${kind}.json : poids manquant ou invalide pour « ${r} »`);
  }
  return c;
}

/** Charge (ou recharge) les catalogues depuis content/compliments.json et content/insultes.json. */
export async function loadBanter() {
  for (const kind of ['compliment', 'insulte'] as BanterKind[]) {
    const file = path.join(contentDir, kind === 'compliment' ? 'compliments.json' : 'insultes.json');
    const catalog = validate(kind, JSON.parse(await readFile(file, 'utf8')));
    catalogs.set(kind, catalog);
    log.info(`${kind}s chargés : ${RARITIES.map((r) => `${catalog[r].length} ${r}`).join(', ')}`);
  }
}

/** Tirage pondéré d'une rareté selon les poids du catalogue. */
export function pickRarity(weights: Record<Rarity, number>, random = Math.random()): Rarity {
  const total = RARITIES.reduce((n, r) => n + weights[r], 0);
  let cursor = random * total;
  for (const r of RARITIES) {
    cursor -= weights[r];
    if (cursor < 0) return r;
  }
  return 'classique';
}

export interface BanterDraw {
  rarity: Rarity;
  text: string;
}

export function drawBanter(kind: BanterKind, target: string, author: string): BanterDraw {
  const catalog = catalogs.get(kind);
  if (!catalog) throw new Error(`Catalogue ${kind} non chargé`);
  const rarity = pickRarity(catalog.weights);
  const pool = catalog[rarity];
  const template = pool[Math.floor(Math.random() * pool.length)] ?? '';
  return { rarity, text: template.replaceAll('{cible}', target).replaceAll('{auteur}', author) };
}
