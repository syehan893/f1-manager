import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'border-neon-cyan/45 bg-neon-cyan/12 text-neon-cyan hover:bg-neon-cyan/22 hover:shadow-[0_0_22px_-6px_var(--color-neon-cyan)]',
  secondary:
    'border-carbon-500 bg-carbon-800/70 text-chrome-300 hover:border-carbon-400 hover:text-chrome-100',
  danger:
    'border-neon-red/45 bg-neon-red/10 text-neon-red hover:bg-neon-red/20 hover:shadow-[0_0_22px_-6px_var(--color-neon-red)]',
  ghost: 'border-transparent bg-transparent text-chrome-400 hover:text-chrome-100',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[10px]',
  md: 'px-4 py-2.5 text-[11px]',
  lg: 'px-6 py-3.5 text-[13px]',
};

interface GameButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

export function GameButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  title,
  icon,
  className,
  type = 'button',
}: GameButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-bold tracking-widest uppercase',
        'transition-all duration-150 focus-visible:ring-2 focus-visible:ring-neon-cyan/60 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/60 disabled:text-chrome-500 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
