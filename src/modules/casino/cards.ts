import { randomInt } from 'node:crypto';

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** Une carte est une chaîne « rang + couleur », ex. `A♠`, `10♥`. */
export type Card = string;

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  // Fisher-Yates avec aléatoire cryptographique
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function rankOf(card: Card): string {
  return card.slice(0, -1);
}

/** Valeur d'une main : les as valent 11 puis 1 si nécessaire. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = rankOf(card);
    if (rank === 'A') { aces++; total += 11; }
    else if (['J', 'Q', 'K'].includes(rank)) total += 10;
    else total += Number(rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}
