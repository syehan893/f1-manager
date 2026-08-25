import { motion } from 'framer-motion';
import { Flag, Play, RotateCcw, Trash2, Trophy } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { Badge } from '@/components/ui/Badge';
import { gridTeamOf } from '@/data/grid2026';
import { cx } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/** Phase: MAIN_MENU. The only screen that can exist without a save. */
export function MainMenuScreen() {
  const { save, booting, dispatch, continueSave, origin } = useGame();

  const hasSave = Boolean(save);
  const team = save?.teamId ? gridTeamOf(save.teamId) : null;

  const startNew = () => {
    if (hasSave && !window.confirm('Starting a new game overwrites your existing save. Continue?')) {
      return;
    }
    dispatch({ type: 'NEW_GAME' });
  };

  const resume = () => continueSave();

  const reset = () => {
    if (!window.confirm('Delete the save permanently? This cannot be undone.')) return;
    dispatch({ type: 'RESET' });
  };

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-4 py-10">
      {/* Backdrop */}
      <div className="panel-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="scanline pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(46,230,214,0.10),transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-lg"
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-neon-red to-[#8f0d1c] shadow-[0_0_34px_-6px_var(--color-neon-red)]">
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
              <path
                d="M3 18 L8 6 h4 l-2 5 h3 l-6 7 z M13 18 L18 6 h3 l-5 12 z"
                fill="white"
                opacity="0.95"
              />
            </svg>
          </span>
          <h1 className="mt-4 text-3xl leading-none font-extrabold tracking-tight text-chrome-100">
            MOTORSPORT
          </h1>
          <p className="mt-1 flex items-center justify-center gap-2 text-3xl leading-none font-extrabold tracking-tight text-chrome-100">
            MANAGER
            <span className="rounded bg-carbon-600 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] text-neon-cyan">
              CAREER
            </span>
          </p>
          <p className="mt-3 text-[11px] tracking-[0.18em] text-chrome-500 uppercase">
            2026 Championship · Single save slot
          </p>
        </div>

        {/* Save slot */}
        <div
          className={cx(
            'mb-5 rounded-panel border p-4',
            hasSave
              ? 'border-neon-cyan/30 bg-neon-cyan/6'
              : 'border-carbon-600/70 bg-carbon-900/50',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Save Slot 1</span>
            {booting ? (
              <Badge tone="neutral">Checking…</Badge>
            ) : hasSave ? (
              <Badge tone={origin === 'database' ? 'lime' : 'amber'}>
                {origin === 'database' ? 'MongoDB' : 'Local copy'}
              </Badge>
            ) : (
              <Badge tone="neutral">Empty</Badge>
            )}
          </div>

          {hasSave && save ? (
            <div className="flex items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold text-carbon-950"
                style={{ background: team?.color ?? 'var(--color-chrome-400)' }}
              >
                {team?.shortName ?? '—'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-chrome-100">
                  {save.managerName}
                </p>
                <p className="truncate font-mono text-[10px] text-chrome-500">
                  {team?.name ?? 'No team'} · Season {save.season} · Round {save.round} ·{' '}
                  {save.phase.replace('_', ' ')}
                </p>
              </div>
              <Trophy className="size-4 shrink-0 text-neon-amber" />
            </div>
          ) : (
            <p className="text-[11px] text-chrome-500">
              No career in progress. Start a new game to pick a team from the 2026 grid.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="grid gap-2.5">
          <GameButton size="lg" onClick={startNew} icon={<Play className="size-4" />}>
            Start New Game
          </GameButton>

          <GameButton
            size="lg"
            variant="secondary"
            onClick={resume}
            disabled={!hasSave || booting}
            title={hasSave ? undefined : 'No save found in slot 1.'}
            icon={<Flag className="size-4" />}
          >
            Continue Game
          </GameButton>

          <GameButton
            size="md"
            variant="danger"
            onClick={reset}
            disabled={!hasSave}
            icon={<Trash2 className="size-3.5" />}
          >
            Reset Game
          </GameButton>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] text-chrome-500">
          <RotateCcw className="size-3" />
          Progress autosaves after every action.
        </p>

        <p className="mt-4 text-center text-[9px] leading-relaxed text-chrome-500">
          Unofficial fan project, unaffiliated with Formula 1 or the FIA. Team and driver names
          reflect the announced 2026 entries; all ratings, budgets and car statistics are invented.
        </p>
      </motion.div>
    </div>
  );
}
