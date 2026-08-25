import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Overrides the active accent for this segment. */
  color?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentOption<T>>;
  /** null selects nothing — used where a choice has not been made yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Shared layoutId namespace — must be unique per control on screen. */
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cx(
        'inline-flex items-center gap-1 rounded-lg border border-carbon-600/70 bg-carbon-900/70 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const accent = option.color ?? 'var(--color-neon-cyan)';

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative rounded-md font-semibold tracking-wider uppercase transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-35',
              size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]',
              active ? 'text-carbon-950' : 'text-chrome-400 hover:text-chrome-100',
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-${name}`}
                className="absolute inset-0 rounded-md"
                style={{
                  background: accent,
                  boxShadow: `0 0 16px color-mix(in srgb, ${accent} 45%, transparent)`,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
