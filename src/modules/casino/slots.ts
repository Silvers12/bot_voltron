import { randomInt } from 'node:crypto';

export const SYMBOLS = ['🦦', '❤️', '🛡️', '🐟', '🌊', '🪨'] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** Poids de chaque symbole sur un rouleau (identiques sur les trois). */
const WEIGHTS: Record<Symbol, number> = { '🦦': 1, '❤️': 2, '🛡️': 3, '🐟': 4, '🌊': 5, '🪨': 5 };

/** Multiplicateur de la mise pour trois symboles identiques. */
const TRIPLE: Record<Symbol, number> = { '🦦': 100, '❤️': 30, '🛡️': 15, '🐟': 10, '🌊': 7, '🪨': 6 };

const reel: Symbol[] = SYMBOLS.flatMap((s) => Array<Symbol>(WEIGHTS[s]).fill(s));

export function spinReels(random: () => number = () => randomInt(reel.length)): [Symbol, Symbol, Symbol] {
  return [reel[random()]!, reel[random()]!, reel[random()]!];
}

export interface SpinOutcome {
  reels: [Symbol, Symbol, Symbol];
  /** Multiplicateur de la mise (0 = perdu, 1 = mise rendue) */
  multiplier: number;
  label: string;
}

/** Table des gains, par priorité décroissante. */
export function evaluate(reels: [Symbol, Symbol, Symbol]): SpinOutcome {
  const [a, b, c] = reels;
  const otters = reels.filter((s) => s === '🦦').length;

  if (a === b && b === c) return { reels, multiplier: TRIPLE[a], label: a === '🦦' ? 'JACKPOT : trois loutres !' : `Trois ${a} !` };
  if (otters === 2) return { reels, multiplier: 6, label: 'Deux loutres !' };

  const others = reels.filter((s) => s !== '🦦');
  const pair = others.length >= 2 && others[0] === others[1] ? others[0] : null;
  if (otters === 1 && pair) return { reels, multiplier: 4, label: `Une loutre et une paire de ${pair}` };
  if (otters === 1) return { reels, multiplier: 1, label: 'Une loutre : elle te rend ta mise.' };
  if (pair) return { reels, multiplier: 2, label: `Une paire de ${pair}` };
  return { reels, multiplier: 0, label: 'Rien cette fois. La rivière garde ta mise.' };
}
