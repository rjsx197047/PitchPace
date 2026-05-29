import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn helper: merges class names and resolves Tailwind conflicts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators and optional unit. */
export function fmt(n: number, unit = ''): string {
  const v = Number.isInteger(n) ? n.toString() : n.toFixed(1);
  return unit ? `${v} ${unit}` : v;
}

/** ISO date (YYYY-MM-DD) for today, in local time. */
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** "May 24" style short label from an ISO date string. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Sat, May 24" style label. */
export function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
