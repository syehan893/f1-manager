import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

type Tone = 'neutral' | 'cyan' | 'red' | 'amber' | 'lime' | 'violet' | 'blue';

const TONES: Record<Tone, string> = {
  neutral: 'border-carbon-500 bg-carbon-700/60 text-chrome-300',
  cyan: 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan',
  red: 'border-neon-red/45 bg-neon-red/12 text-neon-red',
  amber: 'border-neon-amber/40 bg-neon-amber/10 text-neon-amber',
  lime: 'border-neon-lime/40 bg-neon-lime/10 text-neon-lime',
  violet: 'border-neon-violet/40 bg-neon-violet/10 text-neon-violet',
  blue: 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue',
};

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  mono?: boolean;
}

export function Badge({ children, tone = 'neutral', icon, className, mono }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5',
        'text-[10px] font-semibold tracking-wider uppercase',
        mono && 'font-mono',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

interface StatusDotProps {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}

const DOT_COLORS: Record<Tone, string> = {
  neutral: 'bg-chrome-500',
  cyan: 'bg-neon-cyan',
  red: 'bg-neon-red',
  amber: 'bg-neon-amber',
  lime: 'bg-neon-lime',
  violet: 'bg-neon-violet',
  blue: 'bg-neon-blue',
};

export function StatusDot({ tone = 'lime', pulse = true, className }: StatusDotProps) {
  return (
    <span className={cx('relative flex size-2', className)}>
      {pulse && (
        <span
          className={cx(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            DOT_COLORS[tone],
          )}
        />
      )}
      <span className={cx('relative inline-flex size-2 rounded-full', DOT_COLORS[tone])} />
    </span>
  );
}
