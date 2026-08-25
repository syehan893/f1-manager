import { Bell, CalendarDays, ChevronDown, CircleDollarSign, Database, HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';
import { NAV_ITEMS } from './navItems';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';

interface TopBarProps {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
}

/** Global header: everything here reads from the active save. */
export function TopBar({ active, onNavigate }: TopBarProps) {
  const { state, playerTeam, currentTrack, origin, save } = useGame();

  const budget =
    state && playerTeam
      ? (state.teams.find((team) => team.teamId === playerTeam.id)?.budget ?? 0)
      : 0;

  const inDevelopment = state
    ? Object.values(state.rnd.projects).filter((p) => p.status === 'IN_DEVELOPMENT').length
    : 0;

  const online = origin === 'database';
  const title = NAV_ITEMS.find((item) => item.id === active);

  return (
    <header className="z-20 flex h-[72px] shrink-0 items-center gap-3 border-b border-carbon-600/60 bg-carbon-900/90 px-3 backdrop-blur-md sm:px-5">
      {/* Compact nav for viewports without the sidebar. Every destination is
          reachable here, scrolled horizontally. */}
      <nav className="flex items-center gap-1 overflow-x-auto md:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              className={cx(
                'grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
                isActive
                  ? 'border-neon-cyan/40 bg-neon-cyan/12 text-neon-cyan'
                  : 'border-carbon-600 text-chrome-400 hover:text-chrome-100',
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </nav>

      <div className="hidden min-w-0 flex-1 md:block">
        <h1 className="truncate text-sm font-bold tracking-wide text-chrome-100 uppercase">
          {title?.label ?? 'Season'}
        </h1>
        <p className="truncate text-[11px] text-chrome-500">
          {state && playerTeam
            ? `${playerTeam.name} · Season ${state.season} · Round ${state.round} of ${state.settings.seasonLength}`
            : 'No career loaded'}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Budget */}
        <div className="hidden items-center gap-2 rounded-lg border border-neon-lime/25 bg-neon-lime/8 px-3 py-2 sm:flex">
          <CircleDollarSign className="size-4 shrink-0 text-neon-lime" />
          <div className="leading-none">
            <p className="font-mono text-[13px] font-bold text-neon-lime">
              {formatCurrency(budget)}
            </p>
            <p className="mt-1 text-[9px] font-semibold tracking-widest text-chrome-500 uppercase">
              Budget
            </p>
          </div>
        </div>

        {/* Round + circuit */}
        <div className="flex items-center gap-2.5 rounded-lg border border-carbon-600 bg-carbon-800/70 px-3 py-2">
          <CalendarDays className="hidden size-4 shrink-0 text-chrome-400 sm:block" />
          <div className="leading-none">
            <p className="font-mono text-[13px] font-bold whitespace-nowrap text-chrome-100">
              {state ? `R${state.round}` : '—'}
              <span className="text-chrome-500"> · W{state?.week ?? 0}</span>
            </p>
            <p className="mt-1 text-[9px] font-semibold tracking-widest text-chrome-500 uppercase">
              {state?.rnd.developmentTokens ?? 0} tokens
            </p>
          </div>
          {currentTrack && (
            <>
              <span className="hidden h-6 w-px bg-carbon-600 sm:block" />
              <span className="hidden text-base leading-none sm:block">
                {flagEmoji(currentTrack.countryCode)}
              </span>
              <span className="hidden max-w-[140px] truncate text-[11px] font-bold tracking-widest text-chrome-300 uppercase lg:block">
                {currentTrack.country}
              </span>
            </>
          )}
        </div>

        {/* Save transport */}
        <span
          className={cx(
            'hidden items-center gap-1.5 rounded-lg border px-2.5 py-2 sm:inline-flex',
            'font-mono text-[9px] font-bold tracking-widest uppercase',
            online
              ? 'border-neon-lime/30 bg-neon-lime/8 text-neon-lime'
              : 'border-neon-amber/30 bg-neon-amber/8 text-neon-amber',
          )}
          title={
            online
              ? 'Save is persisted to MongoDB.'
              : 'Database unreachable — running on the local copy.'
          }
        >
          {online ? <Database className="size-3" /> : <HardDrive className="size-3" />}
          {online ? 'DB' : 'Local'}
        </span>

        {/* Projects in build */}
        <button
          type="button"
          onClick={() => onNavigate('career-rnd')}
          className="relative grid size-10 shrink-0 place-items-center rounded-lg border border-carbon-600 bg-carbon-800/70 text-chrome-300 transition-colors hover:border-carbon-500 hover:text-chrome-100"
          aria-label={`${inDevelopment} projects in development`}
        >
          <Bell className="size-[18px]" />
          {inDevelopment > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-full bg-neon-amber px-1 font-mono text-[10px] font-bold text-carbon-950 shadow-[0_0_10px_var(--color-neon-amber)]"
            >
              {inDevelopment}
            </motion.span>
          )}
        </button>

        {/* Manager */}
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-carbon-600 bg-carbon-800/70 py-1.5 pr-2 pl-1.5 transition-colors hover:border-carbon-500"
        >
          <span
            className="grid size-7 place-items-center rounded-md font-mono text-[11px] font-bold text-carbon-950"
            style={{
              background: playerTeam?.color ?? 'var(--color-neon-cyan)',
            }}
          >
            {playerTeam?.shortName ?? '—'}
          </span>
          <div className="hidden text-left leading-none xl:block">
            <p className="max-w-[110px] truncate text-[11px] font-bold text-chrome-100">
              {save?.managerName ?? state?.managerName ?? 'Manager'}
            </p>
            <p className="mt-0.5 text-[9px] tracking-wider text-chrome-500 uppercase">
              Team Principal
            </p>
          </div>
          <ChevronDown className="size-4 text-chrome-500" />
        </button>
      </div>
    </header>
  );
}
