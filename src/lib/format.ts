import type { TyreCompound } from '@/types';

/** 92_431 -> "1:32.431" */
export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--:--.---';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/** Session clock: 3_725_000 -> "1:02:05" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Gap in ms -> "+1.338" (or "--" for the leader). */
export function formatGap(ms: number, isLeader: boolean): string {
  if (isLeader) return '--';
  if (!Number.isFinite(ms)) return '--';
  if (ms >= 60_000) {
    const laps = Math.floor(ms / 60_000);
    return `+${laps}L`;
  }
  return `+${(ms / 1000).toFixed(3)}`;
}

export function formatDelta(seconds: number): string {
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds.toFixed(2)}s`;
}

export function formatCurrency(value: number, compact = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Regional-indicator flag emoji from an ISO-3166-1 alpha-2 code. */
export function flagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🏁';
  const base = 0x1f1e6;
  const chars = countryCode
    .toUpperCase()
    .split('')
    .map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}

export const TYRE_LABEL: Record<TyreCompound, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTER: 'I',
  WET: 'W',
};

export const TYRE_COLOR: Record<TyreCompound, string> = {
  SOFT: 'var(--color-tyre-soft)',
  MEDIUM: 'var(--color-tyre-medium)',
  HARD: 'var(--color-tyre-hard)',
  INTER: 'var(--color-tyre-inter)',
  WET: 'var(--color-tyre-wet)',
};

/** Merge conditional class names without pulling in a dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
