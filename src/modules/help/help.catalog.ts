import type { GuildSettings } from '../../generated/prisma/client.js';
import { formatAmount } from '../settings/settings.service.js';
import type { FeatureKey } from '../features/features.js';

import { botName } from '../../core/identity.js';
/** Une commande (ou sous-commande) du guide, avec sa description calculée d'après les réglages du serveur. */
export interface HelpEntry {
  command: string;
  sub?: string;
  /** Options affichées après la commande, ex. `membre montant [message]` */
  args?: string;
  feature?: FeatureKey;
  describe: (s: GuildSettings) => string;
  /** Condition supplémentaire (salon configuré, etc.) */
  show?: (s: GuildSettings) => boolean;
}

export interface HelpCategory {
  key: string;
  label: string;
  emoji: string;
  /** Résumé affiché dans le menu */
  blurb: string;
  /** Texte d'introduction de l'écran de la catégorie */
  intro: (s: GuildSettings) => string;
  entries: HelpEntry[];
}

const fmt = (n: number, s: GuildSettings) => formatAmount(n, s);

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: 'bourse', label: 'Bourse et récompenses', emoji: '💰', blurb: 'Gagner et offrir des cœurs',
    intro: (s) => `Chaque membre a une bourse ouverte avec **${fmt(s.startingBalance, s)}**. Elle se remplit avec les récompenses, les jeux et les câlins reçus.`,
    entries: [
      { command: 'profil', describe: (s) => `Ton tableau de bord privé : bourse, niveau, badges, et le bouton de la **récompense du jour** (**${fmt(s.dailyAmount, s)}**, +${s.dailyStreakBonusPercent} % par jour de série, sans plafond). Le menu *Explorer* mène à tout le reste. Avec \`membre\`, affiche la fiche publique de quelqu’un : titre, ancienneté, niveau et badges.` },
      { command: 'hebdo', feature: 'hebdo', describe: (s) => `Récupère la récompense de la semaine : **${fmt(s.weeklyAmount, s)}**, une fois par semaine civile (aussi depuis le profil).` },
      { command: 'calin', args: 'membre montant [message]', feature: 'calin', describe: (s) => `Offre des ${s.currencyPlural} de ta bourse à un membre, avec un petit mot si tu veux. C'est un don, pas un prêt.` },
    ],
  },
  {
    key: 'boutique', label: 'Boutique et inventaire', emoji: '🛒', blurb: 'Objets, rôles, titres et dons',
    intro: () => 'La boutique vend des objets de collection, des rôles et des **titres** à porter sur ton profil. Tout s’ouvre depuis le menu *Explorer* du profil.',
    entries: [
      { command: 'profil', sub: 'Explorer → Boutique', feature: 'boutique', describe: () => 'Catalogue trié par prix, 10 articles par page, bouton d’achat sur chaque ligne.' },
      { command: 'profil', sub: 'Explorer → Inventaire', feature: 'boutique', describe: () => 'Ce que tu possèdes, et le choix du titre affiché sous ton nom.' },
      { command: 'don', args: 'membre article [quantite] [message]', feature: 'boutique', describe: () => 'Donne un objet de collection de ton inventaire à un membre. Les rôles et les titres ne se donnent pas.' },
    ],
  },
  {
    key: 'jeux', label: 'Jeux et paris', emoji: '🎰', blurb: 'Blackjack, machine, duels, vols, tombola',
    intro: () => `Tout se joue avec des cœurs de ta bourse. ${botName()} ne fait pas crédit.`,
    entries: [
      { command: 'blackjack', args: 'mise', feature: 'blackjack', describe: (s) => `Partie privée contre la banque, mise de **${fmt(s.blackjackMinBet, s)}** à **${fmt(s.blackjackMaxBet, s)}**. Tirer, rester, doubler.` },
      { command: 'machine', feature: 'machine', describe: (s) => `Pose la machine à sous dans le salon : **${fmt(s.slotBet, s)}** le tour, seuls les triples gagnent. Trois loutres raflent toute la cagnotte, un autre triple en prend ${s.slotTriplePercent} %.` },
      { command: 'duel', args: 'membre mise', feature: 'duel', describe: (s) => `Défie un membre pour une mise de **${fmt(s.duelMinStake, s)}** à **${fmt(s.duelMaxStake, s)}** chacun. L’adversaire accepte ou refuse, le vainqueur empoche tout.` },
      { command: 'vol', args: 'membre', feature: 'vol', describe: (s) => `${s.theftSuccessPercent} % de chances de dérober jusqu’à ${s.theftMaxPercent} % de la bourse de la cible. En cas d’échec, tu paies une amende du même ordre à la victime. Une tentative toutes les ${s.theftCooldownHours} h.` },
      { command: 'tombola', feature: 'tombola', describe: (s) => `Tombola de la semaine : tickets à **${fmt(s.lotteryTicketPrice, s)}**, ${s.lotteryMaxTickets} au plus par membre. Un seul gagnant au tirage, qui remporte la cagnotte.` },
    ],
  },
  {
    key: 'fun', label: 'Pour rigoler', emoji: '🎲', blurb: 'Dés, pièce, taux, compliments, insultes',
    intro: () => 'Rien à gagner ni à perdre ici, juste de quoi animer le salon.',
    entries: [
      { command: 'de', args: '[nombre]', feature: 'des', describe: () => 'Lance de 1 à 5 dés à six faces, avec une bannière et le total.' },
      { command: 'pileouface', args: '[choix]', feature: 'des', describe: () => `Lance une pièce. Si tu annonces pile ou face, ${botName()} dit si tu as vu juste.` },
      { command: 'taux', args: 'type [membre]', feature: 'taux', describe: () => 'Ton taux du jour de chance, choupitude, suspicion, criminalité, loutritude, flemme, sagesse ou chaos. Fixe pour la journée, nouveau tirage à minuit.' },
      { command: 'duo', args: 'type membre [avec]', feature: 'taux', describe: () => 'Taux entre deux membres : amour, amitié, complicité, rivalité, esprit d’équipe, chaos à deux. Le même pour les deux, toute la journée.' },
      { command: 'compliment', args: 'membre', feature: 'compliments', describe: () => 'Un compliment tiré au sort, parfois rare, parfois épique.' },
      { command: 'insulte', args: 'membre', feature: 'insultes', describe: () => 'Une pique bienveillante, second degré garanti.' },
    ],
  },
  {
    key: 'progression', label: 'Progression', emoji: '⭐', blurb: 'XP, niveaux, classement, succès, stats',
    intro: (s) => `Tu gagnes de l’XP en discutant (${s.xpPerMessage} par message) et en vocal (${s.xpPerVoiceInterval} toutes les ${s.voiceIntervalMinutes} min). Les niveaux débloquent des rôles de palier.`,
    entries: [
      { command: 'classement', feature: 'xp', describe: () => 'Classement d’XP de la compagnie, page par page, visible de toi seul.' },
      { command: 'succes', args: '[membre]', feature: 'succes', describe: () => 'Les badges d’un membre, et ceux qui restent à débloquer.' },
      { command: 'stats', args: '[membre]', describe: () => 'Statistiques de jeu : blackjack, machine, duels, vols, câlins, tombola.' },
    ],
  },
  {
    key: 'communaute', label: 'Ensemble', emoji: '🤗', blurb: 'Câlins collectifs, comptage, notifications',
    intro: () => 'Ce qui se passe sans commande, au fil de la vie du serveur.',
    entries: [
      { command: 'Câlin collectif', feature: 'calin_collectif', show: (s) => s.groupHugChannelIds.length > 0, describe: (s) => `${botName()} surgit à l’improviste (toutes les ${s.groupHugMinIntervalMinutes} à ${s.groupHugMaxIntervalMinutes} min) : cliquez **CÂLIN** pendant ${s.groupHugDurationSeconds} s, chacun reçoit ${fmt(s.groupHugReward, s)} par participant.` },
      { command: 'Salon de comptage', feature: 'comptage', show: (s) => !!s.countingChannelId, describe: (s) => `Dans <#${s.countingChannelId}>, on compte à la suite (les petites formules sont acceptées), jamais deux fois d’affilée. Une erreur coûte ${fmt(s.countingFine, s)} ou le double, à pile ou face.${s.countingRewardEvery > 0 && s.countingRewardMax > 0 ? ` De temps en temps (environ tous les ${s.countingRewardEvery} nombres, jamais deux de suite), un bon nombre cache une surprise de ${fmt(s.countingRewardMin, s)} à ${fmt(s.countingRewardMax, s)}.` : ''} Modifier son message après coup envoie en prison : rôle Prison et plus aucun jeu pendant ${s.prisonMinutes} min.` },
      { command: 'Notifications', show: (s) => !!(s.notifyChannelId ?? s.welcomeChannelId), describe: (s) => `Dans <#${s.notifyChannelId ?? s.welcomeChannelId}>, choisis les notifications que tu veux recevoir (câlins collectifs, tombola, duels).` },
    ],
  },
];

export const ADMIN_CATEGORY: HelpCategory = {
  key: 'intendance', label: 'Intendance', emoji: '🛡️', blurb: 'Réservé aux administrateurs',
  intro: () => 'Visible uniquement par l’intendance. Le panneau regroupe tous les réglages avec des formulaires.',
  entries: [
    { command: 'admin', sub: 'panneau', describe: () => 'Panneau de contrôle complet : fonctionnalités, montants, salons, paliers, boutique, accueil.' },
    { command: 'admin', sub: 'installer', args: '[categorie]', describe: () => `Installe ou répare ${botName()} : catégorie, salons, rôles, page d’accueil.` },
    { command: 'admin', sub: 'crediter', args: 'membre montant [raison]', describe: () => 'Ajoute des cœurs à un membre. `/admin debiter` pour l’inverse, `/admin solde` pour consulter.' },
    { command: 'admin', sub: 'boutique liste', describe: () => 'La boutique : `ajouter`, `modifier`, `retirer`, `liste`, `importer`.' },
    { command: 'admin', sub: 'message', args: 'texte [salon] [repondre_a]', describe: () => `Fait parler ${botName()}. \`/admin messages\` pour supprimer des messages.` },
    { command: 'admin', sub: 'fonction', args: 'nom active', describe: () => 'Met une fonctionnalité en pause ou la réveille.' },
    { command: 'admin', sub: 'stats', describe: () => 'Vue d’ensemble de l’économie du serveur.' },
    { command: 'admin', sub: 'comptage liberer', args: 'membre', describe: () => 'Libère un détenu avant l’heure. `envoyer` pour enfermer à la main, `detenus` pour voir qui est en prison.' },
  ],
};
