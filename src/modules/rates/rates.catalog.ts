/** Taux testables avec /taux. L'icône PNG `content/taux/<key>.png` (fond transparent) remplace l'icône vectorielle de secours. */
export interface Rate {
  key: string;
  label: string;
  /** Nom du taux dans une phrase : « taux de … » */
  of: string;
  emoji: string;
  color: string;
  /** Icône de secours : contenu SVG dans un carré 100×100, dessiné en `fill="currentColor"` */
  icon: string;
  /** Commentaires par tranche : 0-20, 21-40, 41-60, 61-80, 81-100 */
  comments: [string, string, string, string, string];
}

export const RATES: Rate[] = [
  {
    key: 'chance', label: 'Chance', of: 'chance', emoji: '🍀', color: '#2ecc71',
    icon: '<circle cx="38" cy="36" r="17"/><circle cx="62" cy="36" r="17"/><circle cx="38" cy="60" r="17"/><circle cx="62" cy="60" r="17"/><path d="M50 60 L50 92 Q52 98 58 96" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>',
    comments: ['Évite les escaliers et les tombolas aujourd’hui.', 'Un peu de poisse, rien de grave. Ne pariez pas la maison.', 'Pile ou face, vraiment.', 'La rivière est de votre côté. Un ticket de tombola, peut-être ?', 'Trèfle à quatre feuilles sur pattes. Voltron veut la même chose.'],
  },
  {
    key: 'choupitude', label: 'Choupitude', of: 'choupitude', emoji: '🧸', color: '#ff6b9d',
    icon: '<circle cx="28" cy="26" r="13"/><circle cx="72" cy="26" r="13"/><circle cx="50" cy="42" r="28"/><ellipse cx="50" cy="76" rx="30" ry="22"/><circle cx="40" cy="38" r="3.5" fill="#fff"/><circle cx="60" cy="38" r="3.5" fill="#fff"/><ellipse cx="50" cy="50" rx="6" ry="4" fill="#fff"/>',
    comments: ['Plus hérisson que nounours. On vous aime quand même.', 'Mignon à petites doses, comme un chat qui griffe.', 'Choupi standard, certifié par Voltron.', 'Les cœurs fondent sur votre passage.', 'Alerte choupitude maximale. Les loutres applaudissent.'],
  },
  {
    key: 'suspicion', label: 'Suspicion', of: 'suspicion', emoji: '🕵️', color: '#8e44ad',
    icon: '<circle cx="42" cy="42" r="28" stroke="currentColor" stroke-width="10" fill="none"/><path d="M62 62 L90 90" stroke="currentColor" stroke-width="14" stroke-linecap="round"/><circle cx="42" cy="42" r="12"/>',
    comments: ['Rien à signaler. Trop propre, peut-être ?', 'Un petit quelque chose… mais Voltron ferme les yeux.', 'Le dossier est ouvert. On observe.', 'Voltron vous surveille du coin de la moustache.', 'Tous les indices mènent à vous. Expliquez-vous.'],
  },
  {
    key: 'criminalite', label: 'Criminalité', of: 'criminalité', emoji: '🚔', color: '#e74c3c',
    icon: '<circle cx="30" cy="60" r="18" stroke="currentColor" stroke-width="10" fill="none"/><circle cx="70" cy="60" r="18" stroke="currentColor" stroke-width="10" fill="none"/><rect x="44" y="52" width="12" height="10" rx="3"/><rect x="22" y="22" width="16" height="22" rx="6"/><rect x="62" y="22" width="16" height="22" rx="6"/>',
    comments: ['Un ange. Suspect, mais un ange.', 'Jaywalking occasionnel. Voltron note.', 'Petits larcins de biscuits au fond du sac.', 'Recherché dans trois rivières.', 'Ennemi public numéro un. Le bouclier de Voltron est levé.'],
  },
  {
    key: 'loutritude', label: 'Loutritude', of: 'loutritude', emoji: '🦦', color: '#2e86c1',
    icon: '<ellipse cx="50" cy="66" rx="30" ry="26"/><circle cx="50" cy="32" r="22"/><circle cx="34" cy="18" r="7"/><circle cx="66" cy="18" r="7"/><circle cx="42" cy="30" r="3" fill="#fff"/><circle cx="58" cy="30" r="3" fill="#fff"/><ellipse cx="50" cy="40" rx="7" ry="5" fill="#fff"/>',
    comments: ['Plus castor que loutre. Il y a du travail.', 'Vous flottez, mais sur le dos seulement les jours pairs.', 'Loutre honoraire. Le permis de rivière est en cours.', 'Vous vous tenez la patte en dormant. Voltron est fier.', 'Loutre absolue. Voltron vous reconnaît comme membre de la famille.'],
  },
  {
    key: 'flemme', label: 'Flemme', of: 'flemme', emoji: '🛋️', color: '#f39c12',
    icon: '<rect x="10" y="44" width="80" height="30" rx="10"/><rect x="18" y="30" width="64" height="20" rx="8"/><rect x="6" y="56" width="14" height="30" rx="5"/><rect x="80" y="56" width="14" height="30" rx="5"/>',
    comments: ['Machine de guerre. Vous avez déjà fait trois trucs ce matin.', 'Une petite pause, puis on s’y met. Promis.', 'La procrastination raisonnable, un art.', 'Le canapé a pris votre forme.', 'Niveau légendaire. Même lire ce message vous a fatigué.'],
  },
  {
    key: 'sagesse', label: 'Sagesse', of: 'sagesse', emoji: '🦉', color: '#95a5a6',
    icon: '<ellipse cx="50" cy="58" rx="32" ry="36"/><circle cx="36" cy="44" r="12" fill="#fff"/><circle cx="64" cy="44" r="12" fill="#fff"/><circle cx="36" cy="44" r="5"/><circle cx="64" cy="44" r="5"/><path d="M44 60 L50 70 L56 60 Z" fill="#fff"/><path d="M22 24 L34 36 M78 24 L66 36" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    comments: ['Vous avez mis les doigts dans la prise. Deux fois.', 'Des éclairs de génie, vite oubliés.', 'Bon sens ordinaire, ni plus ni moins.', 'On vient vous demander conseil. Avec raison.', 'Hibou ancestral. Voltron s’assoit à vos pattes pour écouter.'],
  },
  {
    key: 'chaos', label: 'Chaos', of: 'chaos', emoji: '🌪️', color: '#34495e',
    icon: '<path d="M20 20 H80 M26 36 H74 M34 52 H66 M40 68 H60 M46 84 H54" stroke="currentColor" stroke-width="11" stroke-linecap="round" fill="none"/>',
    comments: ['Un lac à l’aube. Calme absolu.', 'Quelques vaguelettes, rien de grave.', 'Le désordre créatif, assumé.', 'Les objets disparaissent à votre approche.', 'Tornade incarnée. Voltron cache la vaisselle.'],
  },
];

export function rateByKey(key: string): Rate | undefined {
  return RATES.find((r) => r.key === key);
}

export function commentFor(rate: Rate, value: number): string {
  return rate.comments[Math.min(4, Math.floor(value / 20.01))]!;
}

/** Taux entre deux membres (/duo). Icône PNG optionnelle : content/taux/<key>.png */
export const DUO_RATES: Rate[] = [
  {
    key: 'amour', label: 'Amour', of: 'amour', emoji: '❤️', color: '#e74c3c',
    icon: '<path d="M50 88 C20 66 6 50 10 32 C14 16 34 12 50 30 C66 12 86 16 90 32 C94 50 80 66 50 88 Z"/>',
    comments: ['Deux icebergs qui se croisent. Poliment.', 'Un frisson, vite réprimé.', 'Ça pourrait. Ou pas. Le suspense est total.', 'Les regards s’attardent. Voltron détourne les moustaches.', 'Grand amour de rivière. Voltron sort les mouchoirs.'],
  },
  {
    key: 'amitie', label: 'Amitié', of: 'amitié', emoji: '🤝', color: '#f1c40f',
    icon: '<circle cx="32" cy="34" r="16"/><circle cx="68" cy="34" r="16"/><path d="M8 92 C8 60 32 56 32 56 C32 56 50 66 50 66 C50 66 68 56 68 56 C68 56 92 60 92 92 Z"/>',
    comments: ['Vous vous saluez d’un signe de tête. Parfois.', 'Camarades de salon, sans plus.', 'Une bonne entente, à entretenir.', 'Vous finissez les phrases de l’autre.', 'Amitié inoxydable. Voltron veut rejoindre la bande.'],
  },
  {
    key: 'complicite', label: 'Complicité', of: 'complicité', emoji: '😏', color: '#9b59b6',
    icon: '<circle cx="50" cy="50" r="42"/><circle cx="34" cy="40" r="6" fill="#fff"/><path d="M58 36 L74 42" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M28 64 Q50 84 72 60" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>',
    comments: ['Aucun regard échangé. Même pas un clin d’œil.', 'Une blague privée, une seule.', 'Vous riez parfois des mêmes bêtises.', 'Un regard suffit, et c’est le fou rire.', 'Duo de malfaiteurs. Voltron compte les biscuits.'],
  },
  {
    key: 'rivalite', label: 'Rivalité', of: 'rivalité', emoji: '⚔️', color: '#c0392b',
    icon: '<path d="M14 86 L70 30 M86 86 L30 30" stroke="currentColor" stroke-width="12" stroke-linecap="round"/><path d="M6 78 L22 94 M94 78 L78 94" stroke="currentColor" stroke-width="12" stroke-linecap="round"/><circle cx="70" cy="30" r="10"/><circle cx="30" cy="30" r="10"/>',
    comments: ['Paix totale. Suspect, mais paisible.', 'Un petit esprit de compétition au blackjack.', 'Rivaux honnêtes : le meilleur gagne.', 'Duel en vue. Voltron prépare les dés.', 'Némésis. Voltron tient le bouclier entre vous deux.'],
  },
  {
    key: 'equipe', label: 'Esprit d’équipe', of: 'synergie', emoji: '🧩', color: '#1abc9c',
    icon: '<path d="M12 36 h24 a10 10 0 1 1 20 0 h24 v24 a10 10 0 1 1 0 20 v24 h-24 a10 10 0 1 1 -20 0 h-24 v-24 a10 10 0 1 1 0 -20 Z" transform="translate(-4 -14) scale(1.04)"/>',
    comments: ['Vous tirez chacun de votre côté. La corde souffre.', 'Ça avance, en zigzag.', 'Une équipe correcte, un jour sur deux.', 'Vous vous complétez comme pain et beurre.', 'Machine de guerre à deux têtes. Voltron recrute.'],
  },
  {
    key: 'chaos_duo', label: 'Chaos à deux', of: 'chaos combiné', emoji: '💥', color: '#e67e22',
    icon: '<path d="M50 6 L58 36 L90 30 L66 52 L84 84 L52 66 L30 92 L34 58 L6 46 L36 40 Z"/>',
    comments: ['Ensemble, vous rangez des bibliothèques.', 'Quelques étincelles, vite éteintes.', 'Le désordre créatif, à deux.', 'Voltron vérifie que les meubles sont vissés.', 'Réaction en chaîne. Évacuez la rivière.'],
  },
];

export function duoRateByKey(key: string): Rate | undefined {
  return DUO_RATES.find((r) => r.key === key);
}
