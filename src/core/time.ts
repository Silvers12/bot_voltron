/** Utilitaires de jour civil dans un fuseau donné (sans dépendance externe). */

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number }

function partsIn(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const get = (type: string) => Number(fmt.formatToParts(date).find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Décalage du fuseau par rapport à UTC, en millisecondes, à l'instant donné. */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Clé du jour civil, ex. `2026-10-25`, dans le fuseau donné. */
export function dayKey(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instant (UTC) du prochain minuit dans le fuseau donné. Tient compte des changements d'heure. */
export function nextMidnight(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const naive = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0);
  // Première estimation avec le décalage courant, puis correction avec le décalage à l'instant estimé.
  let guess = new Date(naive - offsetMs(date, timeZone));
  guess = new Date(naive - offsetMs(guess, timeZone));
  return guess;
}
