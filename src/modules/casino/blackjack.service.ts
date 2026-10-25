import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import type { BlackjackGame, BlackjackState } from '../../generated/prisma/client.js';
import { credit, debit, InsufficientFundsError } from '../economy/economy.service.js';
import { getSettings } from '../settings/settings.service.js';
import { handValue, isBlackjack, isBust, newDeck, type Card } from './cards.js';

const log = createLogger('blackjack');

export class BlackjackError extends Error {
  constructor(public readonly code: 'bet_out_of_range' | 'already_playing' | 'not_playing' | 'cannot_double', message: string) {
    super(message);
  }
}

export interface Hand {
  cards: Card[];
  total: number;
  soft: boolean;
}

export interface GameView {
  game: BlackjackGame;
  player: Hand;
  dealer: Hand;
  /** Carte cachée de la banque tant que la partie est en cours */
  dealerHidden: boolean;
  canDouble: boolean;
  finished: boolean;
}

const cards = (json: unknown) => json as Card[];
const hand = (c: Card[]): Hand => ({ cards: c, ...handValue(c) });

export function toView(game: BlackjackGame, { canDouble = false } = {}): GameView {
  const player = hand(cards(game.playerCards));
  const dealerCards = cards(game.dealerCards);
  const finished = game.state !== 'PLAYING';
  return {
    game,
    player,
    dealer: finished ? hand(dealerCards) : hand(dealerCards.slice(0, 1)),
    dealerHidden: !finished,
    canDouble,
    finished,
  };
}

export async function getActiveGame(memberId: string): Promise<BlackjackGame | null> {
  return prisma.blackjackGame.findUnique({ where: { activeMemberId: memberId } });
}

/** Gain total rendu au joueur selon l'issue, pour une mise totale `stake`. */
export function payoutFor(state: BlackjackState, stake: number): number {
  switch (state) {
    case 'BLACKJACK': return stake + Math.floor(stake * 1.5);
    case 'WON': return stake * 2;
    case 'PUSH': return stake;
    default: return 0;
  }
}

/** Compare les mains une fois la banque servie. */
function outcome(player: Card[], dealer: Card[]): BlackjackState {
  if (isBust(player)) return 'LOST';
  if (isBlackjack(player) && !isBlackjack(dealer)) return 'BLACKJACK';
  if (isBust(dealer)) return 'WON';
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > d) return 'WON';
  if (p < d) return 'LOST';
  return 'PUSH';
}

/** Débite la mise et distribue. Un blackjack naturel (ou celui de la banque) termine la partie immédiatement. */
export async function startGame(member: { id: string; guildId: string; discordUserId: string }, bet: number): Promise<GameView> {
  const settings = await getSettings(member.guildId);
  if (!Number.isInteger(bet) || bet < settings.blackjackMinBet || bet > settings.blackjackMaxBet) {
    throw new BlackjackError('bet_out_of_range', `La mise doit être comprise entre ${settings.blackjackMinBet} et ${settings.blackjackMaxBet}.`);
  }
  if (await getActiveGame(member.id)) throw new BlackjackError('already_playing', 'Tu as déjà une partie en cours. Termine-la d’abord.');

  // Mise débitée avant la distribution ; InsufficientFundsError remonte telle quelle.
  await debit({ memberId: member.id, amount: bet, type: 'BET', actorDiscordId: member.discordUserId, reason: 'Blackjack : mise' });

  const deck = newDeck();
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];

  let game: BlackjackGame;
  try {
    game = await prisma.blackjackGame.create({
      data: { memberId: member.id, activeMemberId: member.id, bet, deck, playerCards: player, dealerCards: dealer },
    });
  } catch (err) {
    // Création concurrente : on rend la mise.
    await credit({ memberId: member.id, amount: bet, type: 'BET_WIN', actorDiscordId: 'voltron', reason: 'Blackjack : mise rendue' });
    throw err;
  }

  if (isBlackjack(player) || isBlackjack(dealer)) return settle(game, member.discordUserId);
  return toView(game, { canDouble: true });
}

async function requireActive(memberId: string): Promise<BlackjackGame> {
  const game = await getActiveGame(memberId);
  if (!game) throw new BlackjackError('not_playing', 'Aucune partie en cours. Lance `/blackjack` pour jouer.');
  return game;
}

export async function hit(member: { id: string; discordUserId: string }): Promise<GameView> {
  const game = await requireActive(member.id);
  const deck = cards(game.deck);
  const player = [...cards(game.playerCards), deck.pop()!];
  const updated = await prisma.blackjackGame.update({ where: { id: game.id }, data: { deck, playerCards: player } });
  if (isBust(player) || handValue(player).total === 21) return settle(updated, member.discordUserId);
  return toView(updated);
}

export async function stand(member: { id: string; discordUserId: string }): Promise<GameView> {
  return settle(await requireActive(member.id), member.discordUserId);
}

/** Double : mise supplémentaire égale, une seule carte, puis la banque joue. */
export async function double(member: { id: string; discordUserId: string }): Promise<GameView> {
  const game = await requireActive(member.id);
  if (cards(game.playerCards).length !== 2 || game.doubled) throw new BlackjackError('cannot_double', 'On ne peut doubler que sur les deux premières cartes.');
  await debit({ memberId: member.id, amount: game.bet, type: 'BET', actorDiscordId: member.discordUserId, reason: 'Blackjack : double' });
  const deck = cards(game.deck);
  const player = [...cards(game.playerCards), deck.pop()!];
  const updated = await prisma.blackjackGame.update({ where: { id: game.id }, data: { deck, playerCards: player, doubled: true } });
  return settle(updated, member.discordUserId);
}

/**
 * La banque tire jusqu'à 17 (reste sur 17 souple), puis le résultat est fixé et le gain crédité.
 * La clôture est atomique : une partie ne peut être réglée qu'une fois (activeMemberId passe à null).
 */
export async function settle(game: BlackjackGame, actorDiscordId: string): Promise<GameView> {
  const deck = cards(game.deck);
  const player = cards(game.playerCards);
  const dealer = [...cards(game.dealerCards)];

  if (!isBust(player) && !isBlackjack(player)) {
    while (handValue(dealer).total < 17) dealer.push(deck.pop()!);
  }

  const state = outcome(player, dealer);
  const stake = game.doubled ? game.bet * 2 : game.bet;
  const payout = payoutFor(state, stake);

  const { count } = await prisma.blackjackGame.updateMany({
    where: { id: game.id, activeMemberId: { not: null } },
    data: { deck, dealerCards: dealer, state, payout, activeMemberId: null },
  });
  if (count === 0) {
    // Déjà réglée (double clic, expiration concurrente) : on renvoie l'état final sans re-payer.
    return toView(await prisma.blackjackGame.findUniqueOrThrow({ where: { id: game.id } }));
  }

  if (payout > 0) {
    const label = state === 'BLACKJACK' ? 'blackjack' : state === 'WON' ? 'gagné' : 'égalité';
    await credit({ memberId: game.memberId, amount: payout, type: 'BET_WIN', actorDiscordId, reason: `Blackjack : ${label}` });
  }
  log.info(`Partie ${game.id} : ${state}, mise ${stake}, rendu ${payout}`);
  return toView(await prisma.blackjackGame.findUniqueOrThrow({ where: { id: game.id } }));
}

/** Au démarrage : les parties laissées en cours sont réglées comme si le joueur restait. */
export async function settleAbandonedGames() {
  const games = await prisma.blackjackGame.findMany({ where: { activeMemberId: { not: null } } });
  for (const game of games) await settle(game, 'voltron');
  if (games.length) log.info(`${games.length} partie(s) abandonnée(s) réglée(s) au redémarrage.`);
}

export async function getBlackjackStats(memberId: string) {
  const [played, agg] = await Promise.all([
    prisma.blackjackGame.count({ where: { memberId, state: { not: 'PLAYING' } } }),
    prisma.blackjackGame.aggregate({ where: { memberId, state: { not: 'PLAYING' } }, _sum: { payout: true, bet: true } }),
  ]);
  return { played, totalPayout: agg._sum.payout ?? 0, totalBet: agg._sum.bet ?? 0 };
}

export { InsufficientFundsError };
