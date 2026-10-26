/** Utilitaires de jour et de semaine civils dans un fuseau donné (sans dépendance externe). */

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

const pad = (n: number) => String(n).padStart(2, '0');

/** Clé du jour civil, ex. `2026-10-25`, dans le fuseau donné. */
export function dayKey(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Jour civil précédent d'une clé `AAAA-MM-JJ` (arithmétique de dates pure). */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

/** Jour de la semaine ISO (1 = lundi … 7 = dimanche) du jour civil courant dans le fuseau. */
function isoWeekday(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const utcDay = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = dimanche
  return utcDay === 0 ? 7 : utcDay;
}

/** Clé de la semaine ISO, ex. `2026-W43`, dans le fuseau donné. */
export function weekKey(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  // Algorithme ISO 8601 : la semaine contenant le jeudi
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** Instant (UTC) du minuit local situé `daysAhead` jours après le jour civil courant. Tient compte des changements d'heure. */
function localMidnightAfter(date: Date, timeZone: string, daysAhead: number): Date {
  const p = partsIn(date, timeZone);
  const naive = Date.UTC(p.year, p.month - 1, p.day + daysAhead, 0, 0, 0);
  let guess = new Date(naive - offsetMs(date, timeZone));
  guess = new Date(naive - offsetMs(guess, timeZone));
  return guess;
}

/** Prochain minuit dans le fuseau donné. */
export function nextMidnight(date: Date, timeZone: string): Date {
  return localMidnightAfter(date, timeZone, 1);
}

/** Prochain lundi à minuit dans le fuseau donné. */
export function nextMonday(date: Date, timeZone: string): Date {
  return localMidnightAfter(date, timeZone, 8 - isoWeekday(date, timeZone));
}

/**
 * Prochaine occurrence (strictement future) d'un jour ISO et d'une heure locale dans le fuseau.
 * Ex. nextLocalWeekdayTime(now, 'Europe/Paris', 7, 20) = dimanche prochain 20 h 00 heure de Paris.
 */
export function nextLocalWeekdayTime(date: Date, timeZone: string, isoWeekdayWanted: number, hour: number, minute = 0): Date {
  const today = isoWeekday(date, timeZone);
  let daysAhead = (isoWeekdayWanted - today + 7) % 7;
  const candidate = () => {
    const p = partsIn(date, timeZone);
    const naive = Date.UTC(p.year, p.month - 1, p.day + daysAhead, hour, minute, 0);
    let guess = new Date(naive - offsetMs(date, timeZone));
    guess = new Date(naive - offsetMs(guess, timeZone));
    return guess;
  };
  let next = candidate();
  if (next.getTime() <= date.getTime()) { daysAhead += 7; next = candidate(); }
  return next;
}
