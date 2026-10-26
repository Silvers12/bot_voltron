/** Instantané des statistiques d'un membre, calculé à partir de la base. */
export interface MemberStats {
  messages: number;
  voiceHours: number;
  level: number;
  balance: number;
  maxStreak: number;
  weeklyClaims: number;
  hugsSent: number;
  hugsSentTotal: number;
  hugsReceived: number;
  purchases: number;
  blackjackGames: number;
  blackjackWins: number;
  blackjackNaturals: number;
  slotSpins: number;
  jackpots: number;
  duelsPlayed: number;
  duelWins: number;
  groupHugs: number;
  lotteryTickets: number;
  lotteryWins: number;
  /** Succès déjà débloqués (hors méta) */
  unlocked: number;
}

export type Tier = 'bronze' | 'argent' | 'or';

export interface Achievement {
  key: string;
  name: string;
  emoji: string;
  /** Phrase affichée au déblocage */
  description: string;
  /** Indice affiché tant que le succès est verrouillé */
  hint: string;
  tier: Tier;
  category: 'Compagnie' | 'Économie' | 'Jeux' | 'Collection';
  check(st: MemberStats): boolean;
}

export const TIER_REWARD: Record<Tier, number> = { bronze: 100, argent: 300, or: 1000 };
export const TIER_LABEL: Record<Tier, string> = { bronze: '🥉 bronze', argent: '🥈 argent', or: '🥇 or' };

export const MESSAGE_THRESHOLDS = [100, 1000, 5000];
export const VOICE_HOUR_THRESHOLDS = [10, 100];

export const ACHIEVEMENTS: Achievement[] = [
  // Compagnie
  { key: 'bavard', name: 'Bavard', emoji: '💬', tier: 'bronze', category: 'Compagnie', description: 'a écrit 100 messages dans la compagnie.', hint: 'Écrire 100 messages', check: (s) => s.messages >= 100 },
  { key: 'pipelette', name: 'Pipelette', emoji: '🗣️', tier: 'argent', category: 'Compagnie', description: 'a écrit 1 000 messages. La rivière n’a plus de secrets.', hint: 'Écrire 1 000 messages', check: (s) => s.messages >= 1000 },
  { key: 'orateur', name: 'Voix de la rivière', emoji: '📣', tier: 'or', category: 'Compagnie', description: 'a écrit 5 000 messages. Voltron prend des notes.', hint: 'Écrire 5 000 messages', check: (s) => s.messages >= 5000 },
  { key: 'casque', name: 'Casque vissé', emoji: '🎧', tier: 'bronze', category: 'Compagnie', description: 'a passé 10 heures en vocal.', hint: 'Passer 10 h en vocal', check: (s) => s.voiceHours >= 10 },
  { key: 'micro', name: 'Micro d’or', emoji: '🎙️', tier: 'or', category: 'Compagnie', description: 'a passé 100 heures en vocal. Des cordes vocales de paladin.', hint: 'Passer 100 h en vocal', check: (s) => s.voiceHours >= 100 },
  { key: 'recrue', name: 'Recrue', emoji: '⭐', tier: 'bronze', category: 'Compagnie', description: 'atteint le niveau 5.', hint: 'Atteindre le niveau 5', check: (s) => s.level >= 5 },
  { key: 'veteran', name: 'Vétéran', emoji: '🌟', tier: 'argent', category: 'Compagnie', description: 'atteint le niveau 10.', hint: 'Atteindre le niveau 10', check: (s) => s.level >= 10 },
  { key: 'legende', name: 'Légende de la rivière', emoji: '💫', tier: 'or', category: 'Compagnie', description: 'atteint le niveau 25. On racontera ça aux loutrons.', hint: 'Atteindre le niveau 25', check: (s) => s.level >= 25 },
  // Économie
  { key: 'assidu', name: 'Assidu', emoji: '🌅', tier: 'bronze', category: 'Économie', description: 'a récupéré sa récompense 7 jours d’affilée.', hint: 'Série de 7 jours', check: (s) => s.maxStreak >= 7 },
  { key: 'flamme', name: 'Flamme éternelle', emoji: '🔥', tier: 'argent', category: 'Économie', description: 'tient une série de 30 jours sans oubli.', hint: 'Série de 30 jours', check: (s) => s.maxStreak >= 30 },
  { key: 'soleil', name: 'Soleil levant', emoji: '☀️', tier: 'or', category: 'Économie', description: 'tient une série de 100 jours. Même Voltron n’y croyait pas.', hint: 'Série de 100 jours', check: (s) => s.maxStreak >= 100 },
  { key: 'genereux', name: 'Généreux', emoji: '🤗', tier: 'bronze', category: 'Économie', description: 'a fait 10 câlins à ses camarades.', hint: 'Faire 10 câlins', check: (s) => s.hugsSent >= 10 },
  { key: 'mecene', name: 'Mécène', emoji: '💝', tier: 'argent', category: 'Économie', description: 'a offert 5 000 cœurs en câlins au total.', hint: 'Offrir 5 000 cœurs en câlins', check: (s) => s.hugsSentTotal >= 5000 },
  { key: 'aime', name: 'Aimé de tous', emoji: '🫶', tier: 'bronze', category: 'Économie', description: 'a reçu 10 câlins.', hint: 'Recevoir 10 câlins', check: (s) => s.hugsReceived >= 10 },
  { key: 'bourse', name: 'Bourse bien garnie', emoji: '💰', tier: 'argent', category: 'Économie', description: 'possède 20 000 cœurs d’un coup.', hint: 'Avoir 20 000 cœurs en bourse', check: (s) => s.balance >= 20000 },
  { key: 'dragon', name: 'Trésor de dragon', emoji: '👑', tier: 'or', category: 'Économie', description: 'possède 100 000 cœurs. Voltron surveille la grotte.', hint: 'Avoir 100 000 cœurs en bourse', check: (s) => s.balance >= 100000 },
  { key: 'client', name: 'Premier achat', emoji: '🛒', tier: 'bronze', category: 'Économie', description: 'a fait son premier achat à la boutique.', hint: 'Acheter un article', check: (s) => s.purchases >= 1 },
  { key: 'collectionneur', name: 'Sac à dos plein', emoji: '🎒', tier: 'argent', category: 'Économie', description: 'a fait 10 achats à la boutique.', hint: 'Acheter 10 articles', check: (s) => s.purchases >= 10 },
  // Jeux
  { key: 'naturel', name: 'Main de maître', emoji: '🃏', tier: 'bronze', category: 'Jeux', description: 'a fait un blackjack naturel.', hint: 'Faire un blackjack (21 en deux cartes)', check: (s) => s.blackjackNaturals >= 1 },
  { key: 'habitue', name: 'Habitué des tables', emoji: '🎴', tier: 'argent', category: 'Jeux', description: 'a joué 50 parties de blackjack.', hint: 'Jouer 50 parties de blackjack', check: (s) => s.blackjackGames >= 50 },
  { key: 'croupier', name: 'Terreur du croupier', emoji: '🏆', tier: 'or', category: 'Jeux', description: 'a gagné 50 parties de blackjack.', hint: 'Gagner 50 parties de blackjack', check: (s) => s.blackjackWins >= 50 },
  { key: 'manivelle', name: 'Bras de manivelle', emoji: '🎰', tier: 'bronze', category: 'Jeux', description: 'a lancé la machine 100 fois.', hint: 'Lancer la machine 100 fois', check: (s) => s.slotSpins >= 100 },
  { key: 'jackpot', name: 'Trois loutres', emoji: '🦦', tier: 'or', category: 'Jeux', description: 'a décroché le jackpot de la machine à sous.', hint: 'Aligner trois loutres', check: (s) => s.jackpots >= 1 },
  { key: 'duelliste', name: 'Duelliste', emoji: '⚔️', tier: 'bronze', category: 'Jeux', description: 'a remporté son premier duel.', hint: 'Gagner un duel', check: (s) => s.duelWins >= 1 },
  { key: 'champion', name: 'Champion d’arène', emoji: '🛡️', tier: 'argent', category: 'Jeux', description: 'a remporté 10 duels.', hint: 'Gagner 10 duels', check: (s) => s.duelWins >= 10 },
  { key: 'calineur', name: 'Câlineur de la première heure', emoji: '🫂', tier: 'bronze', category: 'Jeux', description: 'a participé à 5 câlins collectifs.', hint: 'Participer à 5 câlins collectifs', check: (s) => s.groupHugs >= 5 },
  { key: 'tombolier', name: 'Joueur de tombola', emoji: '🎟️', tier: 'bronze', category: 'Jeux', description: 'a acheté 50 tickets de tombola.', hint: 'Acheter 50 tickets de tombola', check: (s) => s.lotteryTickets >= 50 },
  { key: 'chanceux', name: 'Patte chanceuse', emoji: '🍀', tier: 'or', category: 'Jeux', description: 'a gagné la tombola.', hint: 'Gagner la tombola', check: (s) => s.lotteryWins >= 1 },
  // Collection (méta)
  { key: 'collection', name: 'Collectionneur', emoji: '🏅', tier: 'argent', category: 'Collection', description: 'a débloqué 10 succès.', hint: 'Débloquer 10 succès', check: (s) => s.unlocked >= 10 },
  { key: 'encyclopedie', name: 'Encyclopédie vivante', emoji: '🎖️', tier: 'or', category: 'Collection', description: 'a débloqué tous les autres succès. Voltron s’incline.', hint: 'Débloquer tous les autres succès', check: (s) => s.unlocked >= ACHIEVEMENTS.length - 1 },
];

export function achievementByKey(key: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}
