import { TYRE_COLOR, TYRE_LABEL, cx } from '@/lib/format';
import type { TyreCompound } from '@/types';

interface TyreBadgeProps {
  compound: TyreCompound;
  /** 0-100 — drawn as a wear ring around the badge. */
  wearPct?: number;
  ageLaps?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZES = {
  xs: { box: 18, stroke: 2, font: 'text-[9px]' },
  sm: { box: 24, stroke: 2.5, font: 'text-[10px]' },
  md: { box: 34, stroke: 3, font: 'text-xs' },
} as const;

export function TyreBadge({
  compound,
  wearPct,
  ageLaps,
  size = 'sm',
  className,
}: TyreBadgeProps) {
  const { box, stroke, font } = SIZES[size];
  const color = TYRE_COLOR[compound];
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = wearPct == null ? 1 : Math.max(0, 1 - wearPct / 100);

  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: box, height: box }}
      title={
        wearPct == null
          ? compound
          : `${compound} · ${Math.round(wearPct)}% worn${ageLaps != null ? ` · ${ageLaps} laps` : ''}`
      }
    >
      <svg width={box} height={box} className="absolute inset-0 -rotate-90">
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="var(--color-carbon-600)"
          strokeWidth={stroke}
        />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - remaining)}
          style={{ transition: 'stroke-dashoffset 240ms linear' }}
        />
      </svg>
      <span
        className={cx('relative font-mono font-bold', font)}
        style={{ color }}
      >
        {TYRE_LABEL[compound]}
      </span>
    </span>
  );
}
