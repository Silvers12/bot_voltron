import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { contentDir } from '../../core/paths.js';

export type CoinSide = 'pile' | 'face';

/** Lance un dé à six faces (aléa cryptographique). */
export const rollDie = (): number => randomInt(1, 7);

export const flipCoin = (): CoinSide => (randomInt(2) === 0 ? 'pile' : 'face');

/** Visuel PNG fourni dans content/jeux/<nom>.png, ou null s'il manque (la commande répond alors en texte). */
export async function loadVisual(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(contentDir, 'jeux', `${name}.png`));
  } catch {
    return null;
  }
}
