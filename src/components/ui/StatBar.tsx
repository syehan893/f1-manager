import { motion } from 'framer-motion';
import { cx } from '@/lib/format';

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  /** Any CSS colour — usually a theme token. */
  color?: string;
  /** Shows the numeric value on the right of the label row. */
  suffix?: string;
  /** Replaces the numeric readout entirely — for currency or ratios. */
  valueLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Renders the track in segments, like a pit-wall readout. */
  segmented?: boolean;
}

export function StatBar({
  label,
  value,
  max = 100,
  color = 'var(--color-neon-cyan)',
  suffix,
  valueLabel,
  size = 'md',
  className,
  segmented = false,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={cx('w-full', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className={cx(
            'font-medium tracking-wide text-chrome-400 uppercase',
            size === 'sm' ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          {label}
        </span>
        <span
          className={cx(
            'font-mono font-semibold text-chrome-100',
            size === 'sm' ? 'text-[11px]' : 'text-xs',
          )}
        >
          {valueLabel ?? `${Math.round(value)}${suffix ?? ''}`}
        </span>
      </div>

      <div
        className={cx(
          'relative w-full overflow-hidden rounded-full bg-carbon-700',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
            boxShadow: `0 0 12px color-mix(in srgb, ${color} 45%, transparent)`,
          }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        />
        {segmented && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 7px, var(--color-carbon-850) 7px 9px)',
            }}
          />
        )}
      </div>
    </div>
  );
}
