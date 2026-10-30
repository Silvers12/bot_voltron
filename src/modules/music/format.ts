/** Petits formatages partagés par le lecteur et la file. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return 'direct';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function shorten(text: string, n: number): string {
  const clean = text.replace(/\[/g, '(').replace(/\]/g, ')');
  return clean.length <= n ? clean : `${clean.slice(0, n - 1).trimEnd()}…`;
}

export function fmtViews(n: number | null): string {
  if (n === null) return '—';
  for (const [div, suffix] of [[1e9, ' Md'], [1e6, ' M'], [1e3, ' k']] as const) {
    if (n >= div) return `${(n / div).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return String(n);
}

export function progressBar(elapsed: number, total: number | null, width = 18): string {
  if (!total) return '🔴 En direct';
  const ratio = Math.max(0, Math.min(1, elapsed / total));
  const pos = Math.round(ratio * (width - 1));
  return `${'▬'.repeat(pos)}🔘${'▬'.repeat(width - 1 - pos)}\n\`${fmtDuration(elapsed)} / ${fmtDuration(total)}\``;
}

export type LoopMode = 'off' | 'track' | 'queue';
export const LOOP_LABEL: Record<LoopMode, string> = { off: 'Désactivée', track: '🔂 Piste', queue: '🔁 File' };
export const LOOP_NEXT: Record<LoopMode, LoopMode> = { off: 'track', track: 'queue', queue: 'off' };
