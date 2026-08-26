import { motion } from 'framer-motion';
import { ClipboardCheck, Flag, Route } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { BriefingRoom } from '@/components/game/BriefingRoom';
import { Badge } from '@/components/ui/Badge';
import { GameButton } from '@/components/game/GameButton';
import { unconfirmedDrivers } from '@/game/machine';
import { preRaceBriefing } from '@/game/briefing';
import { scaledLaps } from '@/game/trackAdapter';
import { cx, flagEmoji } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';

/* =====================================================================
 * Strategy briefing.
 *
 * The gate between qualifying and the grid. The player is sent to the
 * Race Strategy screen to choose a starting compound for each car; this
 * screen is what they see if they come back to the season view before
 * that is done, so the outstanding decision is never hidden.
 * ===================================================================== */

export function StrategyBriefingScreen({
  onNavigate,
}: {
  onNavigate?: (view: ViewId) => void;
}) {
  const { state, currentTrack, playerDrivers, dispatch } = useGame();
  if (!state) return null;

  const outstanding = unconfirmedDrivers(state);
  const ready = outstanding.length === 0;
  const raceLaps = currentTrack ? scaledLaps(currentTrack, state.settings.raceLengthPct) : 0;
  const briefing = preRaceBriefing(state, playerDrivers);

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-4 p-1">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-4 rounded-xl border border-carbon-600 bg-carbon-900/60 p-4"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-neon-amber/12 text-neon-amber">
          <ClipboardCheck className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Round {state.round} — Strategy Briefing</p>
          <h1 className="text-lg font-bold text-chrome-100">
            {currentTrack
              ? `${flagEmoji(currentTrack.countryCode)} ${currentTrack.name}`
              : 'Race weekend'}
          </h1>
          <p className="mt-0.5 text-[11px] text-chrome-500">
            Qualifying is done. {raceLaps} laps to run — decide what each car starts on before
            the grid forms.
          </p>
        </div>
        <GameButton
          size="lg"
          disabled={!ready}
          onClick={() => dispatch({ type: 'CONFIRM_STRATEGY' })}
          icon={<Flag className="size-4" />}
        >
          {ready ? 'Go to the grid' : 'Tyres not chosen'}
        </GameButton>
      </motion.div>

      <Panel
        title="Cars Awaiting a Call"
        icon={<Route className="size-3.5" />}
        actions={
          <GameButton size="sm" variant="secondary" onClick={() => onNavigate?.('race-strategy')}>
            Open the strategy room
          </GameButton>
        }
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {playerDrivers.map((driver) => {
            const plan = state.strategies[driver.id];
            const confirmed = plan?.confirmedForRound === state.round;
            const grid = state.qualifying?.entries.find(
              (entry) => entry.driverId === driver.id,
            );

            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => onNavigate?.('race-strategy')}
                className={cx(
                  'rounded-lg border p-3 text-left transition-colors',
                  confirmed
                    ? 'border-neon-lime/40 bg-neon-lime/[0.05] hover:border-neon-lime/60'
                    : 'border-neon-amber/50 bg-neon-amber/[0.05] hover:border-neon-amber/70',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-chrome-500">
                    #{driver.carNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-chrome-100">
                    {driver.firstName} {driver.lastName}
                  </span>
                  {grid && (
                    <Badge tone="cyan" mono>
                      P{grid.position}
                    </Badge>
                  )}
                </div>
                <p
                  className={cx(
                    'mt-1.5 text-[11px] font-bold',
                    confirmed ? 'text-neon-lime' : 'text-neon-amber',
                  )}
                >
                  {confirmed
                    ? `Starting on ${plan?.startingCompound.toLowerCase()}`
                    : 'No starting compound chosen'}
                </p>
              </button>
            );
          })}
        </div>
      </Panel>

      <BriefingRoom
        title="The Briefing Room"
        lines={briefing}
        onNavigate={onNavigate}
        emptyText="Quiet room. Nobody has a concern worth raising before this one."
      />
    </div>
  );
}
