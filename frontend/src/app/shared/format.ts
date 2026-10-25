import { Pipe, PipeTransform } from '@angular/core';

const SYMBOL: Record<string, string> = { USD: '$', ZWG: 'ZWG ' };

/** "1234.5" → "$1,234.50"; negative → "−$1,234.50". Non-numeric → "–". */
export function formatMoney(v: unknown, currency = 'USD', decimals = 2): string {
  if (v === null || v === undefined || v === '') return '–';
  const n = Number(v);
  if (!isFinite(n)) return '–';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sym = SYMBOL[currency] ?? currency + ' ';
  return (n < 0 ? '−' : '') + sym + abs;
}

/** Compact money for chart axes: 1200 → "$1.2k". */
export function compactMoney(n: number, currency = 'USD'): string {
  const sym = SYMBOL[currency] ?? '';
  const abs = Math.abs(n);
  const s =
    abs >= 1e6 ? (abs / 1e6).toFixed(1) + 'm' : abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'k' : abs.toFixed(0);
  return (n < 0 ? '−' : '') + sym + s.replace('.0', '');
}

@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(v: unknown, currency: string | null | undefined = 'USD', decimals = 2): string {
    return formatMoney(v, currency || 'USD', decimals);
  }
}

/** snake_case / kebab → "Sentence case": part_paid → "Part paid". */
export function humanize(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

@Pipe({ name: 'label', standalone: true })
export class LabelPipe implements PipeTransform {
  transform(v: unknown): string {
    return humanize(v);
  }
}

/** ISO timestamp → "just now" / "5m ago" / "3h ago" / "2d ago" / "12 Oct". */
@Pipe({ name: 'ago', standalone: true })
export class AgoPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '';
    const t = new Date(v).getTime();
    if (isNaN(t)) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

@Pipe({ name: 'initials', standalone: true })
export class InitialsPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return initials(v);
  }
}

/** Badge colour classes shared across pages. */
export function severityClass(sev: string): string {
  if (sev === 'critical') return 'red';
  if (sev === 'warning') return 'amber';
  return 'teal';
}

export function severityIcon(sev: string): string {
  if (sev === 'critical') return 'alert-circle';
  if (sev === 'warning') return 'alert';
  return 'info';
}

export function scoreTone(score: number | null | undefined): 'good' | 'mid' | 'bad' {
  const s = score ?? 0;
  if (s >= 80) return 'good';
  if (s >= 50) return 'mid';
  return 'bad';
}

export const today = (): string => localDate(new Date());
export const daysAgo = (n: number): string => localDate(new Date(Date.now() - n * 864e5));

/** YYYY-MM-DD in the browser's timezone (toISOString() would use UTC). */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
