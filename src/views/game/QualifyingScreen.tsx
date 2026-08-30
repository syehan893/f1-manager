import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Timer, Trophy } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { QUALIFYING_LAPS, simulateQualifying } from '@/game/qualifying';
import { simulatorEdge } from '@/game/facilities';
import { staffQualifyingEdge } from '@/game/staffing';
import { gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatLapTime } from '@/lib/format';
import { statsForDriver } from '@/game/roster';
import { useGame } from '@/state/gameContext';


/** Phase: QUALIFYING — five laps each, best one sets the grid. */
export function QualifyingScreen() {
  const { state, dispatch, currentTrack, roster, gridRoster, playerTeam } = useGame();
  /* Named from the live roster rather than the 2026 data file: a junior who
   * has been promoted into a seat is not in that file, and would otherwise
   * render as a raw driver id. */
  const driverById = new Map(roster.map((driver) => [driver.id, driver]));
  const [expanded, setExpanded] = useState<string | null>(null);
  const simulatedFor = useRef<string | null>(null);

  const result = state?.qualifying ?? null;

  useEffect(() => {
    if (!state || !currentTrack) return;

    // Run the session exactly once per round, even under StrictMode.
    const key = `${state.season}-${state.round}`;
    if (simulatedFor.current === key || state.qualifying) return;
    simulatedFor.current = key;

    const session = simulateQualifying({
      season: state.season,
      round: state.round,
      track: currentTrack,
      /* Two cars per team and no more. A reserve is on the books, not on
       * the entry list, so they do not take a grid slot from anybody. */
      drivers: gridRoster,
      driverTeams: state.driverTeams,
      teams: state.teams,
      difficulty: state.settings.difficulty,
      // Difficulty makes the opposition better, never the player worse;
      // the simulator is the player's own answer to it.
      playerTeamId: state.playerTeamId,
      playerQualifyingEdge: simulatorEdge(state) + staffQualifyingEdge(state),
      /* Each driver is timed in their own car, not the constructor's
       * average of two — by mid-season those are different machines. */
      carStats: Object.fromEntries(
        gridRoster.map((driver) => [driver.id, statsForDriver(state, driver.id)]),
      ),
    });

    dispatch({ type: 'QUALIFYING_COMPLETE', result: session });
  }, [state, currentTrack, gridRoster, dispatch]);

  if (!state || !currentTrack) return null;

  const pole = result?.entries[0];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neon-cyan uppercase">
            Round {state.round} · Qualifying
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-chrome-100">
            <span className="text-2xl leading-none">{flagEmoji(currentTrack.countryCode)}</span>
            <span className="truncate">{currentTrack.name}</span>
          </h1>
          <p className="mt-1 text-[12px] text-chrome-500">
            Every driver runs {QUALIFYING_LAPS} laps. Only the best one counts, and that order
            becomes the starting grid.
          </p>
        </div>

        <GameButton
          size="lg"
          onClick={() => dispatch({ type: 'PROCEED_TO_RACE' })}
          disabled={!result}
          icon={<ChevronRight className="size-4" />}
        >
          Next: Strategy Briefing
        </GameButton>
      </header>

      {pole && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-3 rounded-panel border border-neon-amber/40 bg-neon-amber/8 px-4 py-3"
        >
          <Trophy className="size-5 shrink-0 text-neon-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-widest text-chrome-500 uppercase">Pole position</p>
            <p className="truncate text-[15px] font-bold text-chrome-100">
              {driverById.get(pole.driverId)?.firstName}{' '}
              {driverById.get(pole.driverId)?.lastName}
            </p>
          </div>
          <span className="shrink-0 font-mono text-lg font-bold text-neon-amber">
            {formatLapTime(pole.bestLapMs)}
          </span>
        </motion.div>
      )}

      <Panel
        title="Qualifying Classification"
        icon={<Timer className="size-3.5" />}
        flush
        actions={
          result ? (
            <Badge tone="lime">Session complete</Badge>
          ) : (
            <Badge tone="amber">Running…</Badge>
          )
        }
      >
        {!result ? (
          <p className="px-4 py-12 text-center text-[12px] text-chrome-500">
            Timing the session…
          </p>
        ) : (
          <ul>
            {result.entries.map((entry, index) => {
              const driver = driverById.get(entry.driverId);
              const team = gridTeamOf(entry.teamId);
              const isPlayer = entry.teamId === playerTeam?.id;
              const isOpen = expanded === entry.driverId;

              return (
                <li key={entry.driverId} className="border-b border-carbon-700/50 last:border-0">
                  <motion.button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.driverId)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.5) }}
                    className={cx(
                      'grid w-full grid-cols-[34px_1fr_auto_86px_20px] items-center gap-2 px-3 py-2.5 text-left transition-colors',
                      isPlayer ? 'bg-neon-cyan/8' : 'hover:bg-carbon-800/60',
                    )}
                  >
                    <span
                      className={cx(
                        'font-mono text-[13px] font-bold',
                        entry.position === 1
                          ? 'text-neon-amber'
                          : entry.position <= 3
                            ? 'text-chrome-100'
                            : 'text-chrome-400',
                      )}
                    >
                      P{entry.position}
                    </span>

                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-5 w-1 shrink-0 rounded-full"
                        style={{ background: team.color }}
                      />
                      <span className="text-[11px] leading-none">
                        {driver ? flagEmoji(driver.countryCode) : '🏁'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-chrome-100">
                          {driver ? `${driver.firstName} ${driver.lastName}` : entry.driverId}
                        </p>
                        <p
                          className="truncate font-mono text-[9px] tracking-wider"
                          style={{ color: team.color }}
                        >
                          {team.name}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-[12px] font-semibold text-chrome-100">
                      {formatLapTime(entry.bestLapMs)}
                    </span>

                    <span
                      className={cx(
                        'text-right font-mono text-[11px]',
                        entry.position === 1 ? 'text-neon-amber' : 'text-chrome-500',
                      )}
                    >
                      {entry.position === 1
                        ? 'POLE'
                        : `+${(entry.gapToPoleMs / 1000).toFixed(3)}`}
                    </span>

                    {isOpen ? (
                      <ChevronDown className="size-3.5 text-chrome-500" />
                    ) : (
                      <ChevronRight className="size-3.5 text-chrome-500" />
                    )}
                  </motion.button>

                  {/* The full five-lap run for this driver */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-carbon-900/60"
                      >
                        <div className="flex flex-wrap gap-2 px-4 py-3">
                          {entry.laps.map((lap) => (
                            <div
                              key={lap.lap}
                              className={cx(
                                'rounded-md border px-2.5 py-1.5',
                                lap.isBest
                                  ? 'border-neon-violet/50 bg-neon-violet/12'
                                  : 'border-carbon-600 bg-carbon-800/50',
                              )}
                            >
                              <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
                                Lap {lap.lap}
                              </p>
                              <p
                                className={cx(
                                  'font-mono text-[12px] font-bold',
                                  lap.isBest ? 'text-neon-violet' : 'text-chrome-300',
                                )}
                              >
                                {formatLapTime(lap.timeMs)}
                              </p>
                            </div>
                          ))}
                          <p className="w-full text-[10px] text-chrome-500">
                            Best lap highlighted — that is the only time carried to the grid.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
