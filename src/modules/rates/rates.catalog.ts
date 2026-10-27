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
    icon: '<g transform="translate(50 46)"><path d="M0 -6 C-6 -30 -34 -30 -30 -10 C-34 10 -10 10 0 -6 Z" transform="rotate(0)"/><path d="M0 -6 C-6 -30 -34 -30 -30 -10 C-34 10 -10 10 0 -6 Z" transform="rotate(90)"/><path d="M0 -6 C-6 -30 -34 -30 -30 -10 C-34 10 -10 10 0 -6 Z" transform="rotate(180)"/><path d="M0 -6 C-6 -30 -34 -30 -30 -10 C-34 10 -10 10 0 -6 Z" transform="rotate(270)"/><circle r="5" fill="#fff" stroke="none"/></g><path d="M50 52 C52 70 46 80 56 94" fill="none" stroke-width="7" stroke-linecap="round"/>',
    comments: ['Évite les escaliers et les tombolas aujourd’hui.', 'Un peu de poisse, rien de grave. Ne pariez pas la maison.', 'Pile ou face, vraiment.', 'La rivière est de votre côté. Un ticket de tombola, peut-être ?', 'Trèfle à quatre feuilles sur pattes. Voltron veut la même chose.'],
  },
  {
    key: 'choupitude', label: 'Choupitude', of: 'choupitude', emoji: '🧸', color: '#ff6b9d',
    icon: '<circle cx="24" cy="26" r="11"/><circle cx="76" cy="26" r="11"/><circle cx="24" cy="26" r="5" fill="#fff" stroke="none"/><circle cx="76" cy="26" r="5" fill="#fff" stroke="none"/><ellipse cx="50" cy="74" rx="26" ry="22"/><circle cx="26" cy="68" r="10"/><circle cx="74" cy="68" r="10"/><circle cx="34" cy="92" r="9"/><circle cx="66" cy="92" r="9"/><circle cx="50" cy="40" r="26"/><ellipse cx="50" cy="50" rx="11" ry="8" fill="#fff" stroke="none"/><circle cx="40" cy="36" r="3.5" fill="#1b2838" stroke="none"/><circle cx="60" cy="36" r="3.5" fill="#1b2838" stroke="none"/><ellipse cx="50" cy="47" rx="4" ry="3" fill="#1b2838" stroke="none"/><ellipse cx="50" cy="74" rx="12" ry="9" fill="#fff" stroke="none" opacity="0.8"/>',
    comments: ['Plus hérisson que nounours. On vous aime quand même.', 'Mignon à petites doses, comme un chat qui griffe.', 'Choupi standard, certifié par Voltron.', 'Les cœurs fondent sur votre passage.', 'Alerte choupitude maximale. Les loutres applaudissent.'],
  },
  {
    key: 'suspicion', label: 'Suspicion', of: 'suspicion', emoji: '🕵️', color: '#8e44ad',
    icon: '<circle cx="42" cy="42" r="28" fill="#fff" fill-opacity="0.35" stroke-width="9"/><path d="M63 63 L88 88" stroke-width="15" stroke-linecap="round"/><path d="M63 63 L88 88" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><path d="M26 44 Q42 24 58 44 Q42 64 26 44 Z" fill="#fff" stroke="none"/><circle cx="42" cy="44" r="7" fill="#1b2838" stroke="none"/><circle cx="44" cy="42" r="2.5" fill="#fff" stroke="none"/>',
    comments: ['Rien à signaler. Trop propre, peut-être ?', 'Un petit quelque chose… mais Voltron ferme les yeux.', 'Le dossier est ouvert. On observe.', 'Voltron vous surveille du coin de la moustache.', 'Tous les indices mènent à vous. Expliquez-vous.'],
  },
  {
    key: 'criminalite', label: 'Criminalité', of: 'criminalité', emoji: '🚔', color: '#e74c3c',
    icon: '<circle cx="28" cy="62" r="19" fill="none" stroke-width="13"/><circle cx="28" cy="62" r="19" fill="none" stroke="currentColor" stroke-width="7"/><circle cx="72" cy="62" r="19" fill="none" stroke-width="13"/><circle cx="72" cy="62" r="19" fill="none" stroke="currentColor" stroke-width="7"/><rect x="18" y="20" width="20" height="26" rx="8"/><rect x="62" y="20" width="20" height="26" rx="8"/><rect x="40" y="56" width="20" height="12" rx="5"/><circle cx="28" cy="62" r="4" fill="#fff" stroke="none"/><circle cx="72" cy="62" r="4" fill="#fff" stroke="none"/>',
    comments: ['Un ange. Suspect, mais un ange.', 'Jaywalking occasionnel. Voltron note.', 'Petits larcins de biscuits au fond du sac.', 'Recherché dans trois rivières.', 'Ennemi public numéro un. Le bouclier de Voltron est levé.'],
  },
  {
    key: 'loutritude', label: 'Loutritude', of: 'loutritude', emoji: '🦦', color: '#2e86c1',
    icon: '<ellipse cx="50" cy="68" rx="30" ry="26"/><ellipse cx="50" cy="72" rx="16" ry="18" fill="#fff" stroke="none" opacity="0.85"/><circle cx="28" cy="22" r="9"/><circle cx="72" cy="22" r="9"/><circle cx="50" cy="36" r="25"/><ellipse cx="50" cy="44" rx="14" ry="10" fill="#fff" stroke="none"/><circle cx="40" cy="32" r="3.5" fill="#1b2838" stroke="none"/><circle cx="60" cy="32" r="3.5" fill="#1b2838" stroke="none"/><ellipse cx="50" cy="41" rx="5" ry="3.5" fill="#1b2838" stroke="none"/><path d="M22 42 L36 44 M22 50 L36 47 M78 42 L64 44 M78 50 L64 47" stroke="#1b2838" stroke-width="2.5" stroke-linecap="round" fill="none"/>',
    comments: ['Plus castor que loutre. Il y a du travail.', 'Vous flottez, mais sur le dos seulement les jours pairs.', 'Loutre honoraire. Le permis de rivière est en cours.', 'Vous vous tenez la patte en dormant. Voltron est fier.', 'Loutre absolue. Voltron vous reconnaît comme membre de la famille.'],
  },
  {
    key: 'flemme', label: 'Flemme', of: 'flemme', emoji: '🛋️', color: '#f39c12',
    icon: '<rect x="8" y="46" width="84" height="30" rx="10"/><rect x="18" y="30" width="30" height="22" rx="7"/><rect x="52" y="30" width="30" height="22" rx="7"/><rect x="4" y="54" width="16" height="36" rx="6"/><rect x="80" y="54" width="16" height="36" rx="6"/><rect x="22" y="80" width="10" height="12" rx="3"/><rect x="68" y="80" width="10" height="12" rx="3"/><ellipse cx="50" cy="60" rx="20" ry="6" fill="#fff" stroke="none" opacity="0.5"/>',
    comments: ['Machine de guerre. Vous avez déjà fait trois trucs ce matin.', 'Une petite pause, puis on s’y met. Promis.', 'La procrastination raisonnable, un art.', 'Le canapé a pris votre forme.', 'Niveau légendaire. Même lire ce message vous a fatigué.'],
  },
  {
    key: 'sagesse', label: 'Sagesse', of: 'sagesse', emoji: '🦉', color: '#a0714f',
    icon: '<path d="M50 10 C72 10 86 28 86 54 C86 78 72 92 50 92 C28 92 14 78 14 54 C14 28 28 10 50 10 Z"/><path d="M22 28 L14 8 L36 18 Z"/><path d="M78 28 L86 8 L64 18 Z"/><path d="M14 54 C8 62 10 80 20 88 C24 74 24 62 14 54 Z" fill="#7d5538" stroke="none"/><path d="M86 54 C92 62 90 80 80 88 C76 74 76 62 86 54 Z" fill="#7d5538" stroke="none"/><path d="M14 54 C8 62 10 80 20 88" fill="none"/><path d="M86 54 C92 62 90 80 80 88" fill="none"/><circle cx="35" cy="42" r="16" fill="#f6e7c8" stroke="none"/><circle cx="65" cy="42" r="16" fill="#f6e7c8" stroke="none"/><circle cx="35" cy="42" r="16" fill="none"/><circle cx="65" cy="42" r="16" fill="none"/><circle cx="36" cy="43" r="8" fill="#1b2838" stroke="none"/><circle cx="66" cy="43" r="8" fill="#1b2838" stroke="none"/><circle cx="39" cy="40" r="3" fill="#fff" stroke="none"/><circle cx="69" cy="40" r="3" fill="#fff" stroke="none"/><path d="M44 56 L50 68 L56 56 Z" fill="#f39c12"/><path d="M36 72 Q43 80 50 72 Q57 80 64 72" fill="none" stroke="#f6e7c8" stroke-width="3" stroke-linecap="round"/><path d="M40 82 Q45 88 50 82 Q55 88 60 82" fill="none" stroke="#f6e7c8" stroke-width="3" stroke-linecap="round"/><path d="M37 91 L40 97 M44 91 L44 97 M56 91 L56 97 M63 91 L60 97" stroke="#f39c12" stroke-width="4" stroke-linecap="round" fill="none"/>',
    comments: ['Vous avez mis les doigts dans la prise. Deux fois.', 'Des éclairs de génie, vite oubliés.', 'Bon sens ordinaire, ni plus ni moins.', 'On vient vous demander conseil. Avec raison.', 'Hibou ancestral. Voltron s’assoit à vos pattes pour écouter.'],
  },
  {
    key: 'chaos', label: 'Chaos', of: 'chaos', emoji: '🌪️', color: '#4a69bd',
    icon: '<ellipse cx="50" cy="20" rx="36" ry="10"/><ellipse cx="48" cy="38" rx="28" ry="8"/><ellipse cx="46" cy="54" rx="21" ry="7"/><ellipse cx="44" cy="68" rx="14" ry="6"/><ellipse cx="42" cy="80" rx="8" ry="4.5"/><circle cx="40" cy="92" r="4"/><path d="M26 20 Q50 14 74 20" fill="none" stroke="#fff" stroke-width="3" opacity="0.7"/>',
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
    icon: '<path d="M50 90 C22 70 6 54 10 34 C14 18 34 12 50 30 C66 12 86 18 90 34 C94 54 78 70 50 90 Z"/><path d="M24 30 Q30 22 38 24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.8"/>',
    comments: ['Deux icebergs qui se croisent. Poliment.', 'Un frisson, vite réprimé.', 'Ça pourrait. Ou pas. Le suspense est total.', 'Les regards s’attardent. Voltron détourne les moustaches.', 'Grand amour de rivière. Voltron sort les mouchoirs.'],
  },
  {
    key: 'amitie', label: 'Amitié', of: 'amitié', emoji: '🤝', color: '#f1c40f',
    icon: '<circle cx="30" cy="30" r="15"/><circle cx="70" cy="30" r="15"/><path d="M6 92 C6 60 28 54 30 54 C34 54 44 62 50 66 C56 62 66 54 70 54 C72 54 94 60 94 92 Z"/><path d="M50 66 L50 92" stroke-width="5" fill="none"/><path d="M36 76 C44 70 56 70 64 76" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>',
    comments: ['Vous vous saluez d’un signe de tête. Parfois.', 'Camarades de salon, sans plus.', 'Une bonne entente, à entretenir.', 'Vous finissez les phrases de l’autre.', 'Amitié inoxydable. Voltron veut rejoindre la bande.'],
  },
  {
    key: 'complicite', label: 'Complicité', of: 'complicité', emoji: '😏', color: '#9b59b6',
    icon: '<circle cx="50" cy="50" r="42"/><circle cx="34" cy="42" r="7" fill="#1b2838" stroke="none"/><path d="M56 38 Q66 32 76 40" fill="none" stroke="#1b2838" stroke-width="6" stroke-linecap="round"/><path d="M28 62 Q50 86 74 60" fill="none" stroke="#1b2838" stroke-width="7" stroke-linecap="round"/><circle cx="24" cy="60" r="6" fill="#fff" stroke="none" opacity="0.6"/><circle cx="78" cy="58" r="6" fill="#fff" stroke="none" opacity="0.6"/>',
    comments: ['Aucun regard échangé. Même pas un clin d’œil.', 'Une blague privée, une seule.', 'Vous riez parfois des mêmes bêtises.', 'Un regard suffit, et c’est le fou rire.', 'Duo de malfaiteurs. Voltron compte les biscuits.'],
  },
  {
    key: 'rivalite', label: 'Rivalité', of: 'rivalité', emoji: '⚔️', color: '#c0392b',
    icon: '<path d="M22 78 L72 28 L84 16 L82 32 L30 84 Z"/><path d="M78 78 L28 28 L16 16 L18 32 L70 84 Z"/><path d="M12 72 L28 88 M88 72 L72 88" stroke-width="13" stroke-linecap="round"/><path d="M12 72 L28 88 M88 72 L72 88" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="20" cy="80" r="6"/><circle cx="80" cy="80" r="6"/>',
    comments: ['Paix totale. Suspect, mais paisible.', 'Un petit esprit de compétition au blackjack.', 'Rivaux honnêtes : le meilleur gagne.', 'Duel en vue. Voltron prépare les dés.', 'Némésis. Voltron tient le bouclier entre vous deux.'],
  },
  {
    key: 'equipe', label: 'Esprit d’équipe', of: 'synergie', emoji: '🧩', color: '#1abc9c',
    icon: '<path d="M14 32 H34 A11 11 0 1 1 56 32 H76 A4 4 0 0 1 80 36 V54 A11 11 0 1 0 80 76 V88 A4 4 0 0 1 76 92 H58 A11 11 0 1 1 36 92 H18 A4 4 0 0 1 14 88 V76 A11 11 0 1 1 14 54 V36 A4 4 0 0 1 18 32 Z" transform="translate(3 -6)"/><path d="M30 46 L46 46" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>',
    comments: ['Vous tirez chacun de votre côté. La corde souffre.', 'Ça avance, en zigzag.', 'Une équipe correcte, un jour sur deux.', 'Vous vous complétez comme pain et beurre.', 'Machine de guerre à deux têtes. Voltron recrute.'],
  },
  {
    key: 'chaos_duo', label: 'Chaos à deux', of: 'chaos combiné', emoji: '💥', color: '#e67e22',
    icon: '<path d="M50 4 L59 34 L92 26 L68 50 L90 80 L56 66 L38 96 L36 62 L4 56 L34 42 Z"/><circle cx="48" cy="52" r="10" fill="#fff" stroke="none" opacity="0.85"/><circle cx="48" cy="52" r="4" fill="currentColor" stroke="none"/>',
    comments: ['Ensemble, vous rangez des bibliothèques.', 'Quelques étincelles, vite éteintes.', 'Le désordre créatif, à deux.', 'Voltron vérifie que les meubles sont vissés.', 'Réaction en chaîne. Évacuez la rivière.'],
  },
];

export function duoRateByKey(key: string): Rate | undefined {
  return DUO_RATES.find((r) => r.key === key);
}
