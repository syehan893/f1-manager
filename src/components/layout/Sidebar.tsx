import { motion } from 'framer-motion';
import { NAV_GROUPS, NAV_GROUP_LABEL, navItemsFor } from './navItems';
import { isRacePhase } from '@/game/phases';
import { unreadCount } from '@/game/mail';
import { cx } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';

interface SidebarProps {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { phase, state, origin } = useGame();
  const racing = isRacePhase(phase);
  /* Unanswered post is the one thing in the sidebar with a deadline on
   * it — a bid for a driver expires at the next round whether or not the
   * player found the screen. */
  const unread = unreadCount(state?.mail ?? []);

  return (
    <aside
      className={cx(
        'z-30 hidden shrink-0 flex-col border-r border-carbon-600/60 bg-carbon-900/95 md:flex',
        'w-[76px] xl:w-[236px]',
      )}
    >
      {/* Brand */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-carbon-600/60 px-4">
        <div className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-neon-red to-[#8f0d1c] shadow-[0_0_18px_-4px_var(--color-neon-red)]">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path
              d="M3 18 L8 6 h4 l-2 5 h3 l-6 7 z M13 18 L18 6 h3 l-5 12 z"
              fill="white"
              opacity="0.95"
            />
          </svg>
        </div>
        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-[13px] leading-tight font-extrabold tracking-tight">
            MOTORSPORT
          </p>
          <p className="flex items-center gap-1.5 text-[13px] leading-tight font-extrabold tracking-tight">
            MANAGER
            <span className="rounded bg-carbon-600 px-1 py-px font-mono text-[8px] font-bold tracking-widest text-neon-cyan">
              SIM
            </span>
          </p>
        </div>
      </div>

      {/* Navigation, grouped by area of the game */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2.5">
        {NAV_GROUPS.map((group) => (
          <div key={group} className="mb-1">
            <p className="mb-1 hidden px-3 pt-2 text-[8.5px] font-bold tracking-[0.18em] text-chrome-500 uppercase xl:block">
              {NAV_GROUP_LABEL[group]}
            </p>
            {/* Narrow rail gets a divider instead of a heading. */}
            <div className="mx-2 mb-1.5 h-px bg-carbon-600/70 xl:hidden" />

            <div className="flex flex-col gap-1">
              {navItemsFor(group).map((item) => {
                const Icon = item.icon;
                const isActive = item.id === active;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.sublabel ? `${item.label} ${item.sublabel}` : item.label}
                    className={cx(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150',
                      'focus-visible:ring-2 focus-visible:ring-neon-cyan/60 focus-visible:outline-none',
                      isActive
                        ? 'text-neon-cyan'
                        : 'text-chrome-400 hover:bg-carbon-800/70 hover:text-chrome-100',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-lg border border-neon-cyan/25 bg-neon-cyan/10"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-rail"
                        className="absolute top-1.5 bottom-1.5 -left-2.5 w-[3px] rounded-r bg-neon-cyan shadow-[0_0_10px_var(--color-neon-cyan)]"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}

                    <span className="relative shrink-0">
                      <Icon
                        className="size-5 transition-transform duration-150 group-hover:scale-110"
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                      {/* Live session marker so the pit wall is findable
                          the moment the lights go out. */}
                      {item.id === 'pitwall' && racing && (
                        <span className="absolute -top-1 -right-1 flex size-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-70" />
                          <span className="relative inline-flex size-2 rounded-full bg-neon-red" />
                        </span>
                      )}
                      {item.id === 'career-mail' && unread > 0 && (
                        <span className="absolute -top-1.5 -right-2 grid min-w-4 place-items-center rounded-full bg-neon-red px-1 font-mono text-[8px] leading-4 font-bold text-carbon-950">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </span>
                    <span className="relative hidden min-w-0 text-[12px] leading-tight font-bold tracking-wider uppercase xl:block">
                      {item.label}
                      {item.sublabel && <br />}
                      {item.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Save status */}
      <div className="shrink-0 border-t border-carbon-600/60 p-3">
        <div
          className={cx(
            'flex items-center gap-2 rounded-lg border px-2.5 py-2',
            racing
              ? 'border-neon-red/30 bg-neon-red/8'
              : origin === 'database'
                ? 'border-neon-lime/25 bg-neon-lime/8'
                : 'border-carbon-600 bg-carbon-800/60',
          )}
        >
          <span className="relative flex size-2 shrink-0">
            <span
              className={cx(
                'absolute inline-flex h-full w-full rounded-full opacity-70',
                racing
                  ? 'animate-ping bg-neon-red'
                  : origin === 'database'
                    ? 'bg-neon-lime'
                    : 'bg-chrome-500',
              )}
            />
            <span
              className={cx(
                'relative inline-flex size-2 rounded-full',
                racing ? 'bg-neon-red' : origin === 'database' ? 'bg-neon-lime' : 'bg-chrome-500',
              )}
            />
          </span>
          <div className="hidden min-w-0 xl:block">
            <p className="font-mono text-[9px] leading-tight font-bold tracking-widest text-chrome-300 uppercase">
              {racing ? 'Race live' : origin === 'database' ? 'Saved' : 'Local save'}
            </p>
            <p className="truncate font-mono text-[9px] leading-tight text-chrome-500">
              {state ? `S${state.season} · R${state.round}` : 'no career'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
