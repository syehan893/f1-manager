import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

interface PanelProps {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Removes body padding — for tables and maps that bleed to the edge. */
  flush?: boolean;
}

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: PanelProps) {
  return (
    <section
      className={cx(
        'flex min-h-0 flex-col overflow-hidden rounded-panel border border-carbon-600/70',
        'bg-carbon-850/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_18px_40px_-24px_rgba(0,0,0,0.9)]',
        'backdrop-blur-sm',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-carbon-600/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="text-neon-cyan">{icon}</span>}
            <h2 className="eyebrow truncate">{title}</h2>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', flush ? '' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
