import { randomInt } from 'node:crypto';

export const SYMBOLS = ['🦦', '❤️', '🛡️', '🐟', '🌊', '🪨'] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** Poids de chaque symbole sur un rouleau (identiques sur les trois). */
const WEIGHTS: Record<Symbol, number> = { '🦦': 1, '❤️': 2, '🛡️': 3, '🐟': 4, '🌊': 5, '🪨': 5 };

const reel: Symbol[] = SYMBOLS.flatMap((s) => Array<Symbol>(WEIGHTS[s]).fill(s));

export function spinReels(random: () => number = () => randomInt(reel.length)): [Symbol, Symbol, Symbol] {
  return [reel[random()]!, reel[random()]!, reel[random()]!];
}

export type SpinKind = 'jackpot' | 'triple' | 'none';

export interface SpinOutcome {
  reels: [Symbol, Symbol, Symbol];
  kind: SpinKind;
  label: string;
}

/** Seuls trois symboles identiques gagnent : trois loutres = cagnotte entière, trois autres = une part de la cagnotte. */
export function evaluate(reels: [Symbol, Symbol, Symbol]): SpinOutcome {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    return a === '🦦'
      ? { reels, kind: 'jackpot', label: 'JACKPOT : trois loutres !' }
      : { reels, kind: 'triple', label: `Trois ${a} !` };
  }
  return { reels, kind: 'none', label: 'Rien cette fois. Ta mise rejoint la cagnotte.' };
}
