import { motion } from 'framer-motion';
import { cx } from '@/lib/format';

interface ToggleProps {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  label,
  description,
  enabled,
  onChange,
  disabled = false,
  className,
}: ToggleProps) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-4 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-chrome-100">{label}</p>
        {description && (
          <p className="mt-0.5 text-[10px] leading-relaxed text-chrome-500">{description}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-40',
          enabled ? 'border-neon-cyan/50 bg-neon-cyan/25' : 'border-carbon-500 bg-carbon-700',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className={cx(
            'absolute top-0.5 size-4.5 rounded-full',
            enabled ? 'right-0.5 bg-neon-cyan' : 'left-0.5 bg-chrome-500',
          )}
          style={enabled ? { boxShadow: '0 0 10px var(--color-neon-cyan)' } : undefined}
        />
      </button>
    </div>
  );
}
