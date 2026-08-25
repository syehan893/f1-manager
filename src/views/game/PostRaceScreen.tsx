import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronRight, Flag, Minus, Timer, Trophy } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { ChampionshipTables } from '@/components/game/ChampionshipTables';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { GRID_2026_DRIVERS, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatLapTime } from '@/lib/format';
import { useGame } from '@/state/gameContext';

const DRIVER_BY_ID = new Map(GRID_2026_DRIVERS.map((driver) => [driver.id, driver]));

function PositionDelta({ gained }: { gained: number }) {
  if (gained === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-chrome-500">
        <Minus className="size-3" />
      </span>
    );
  }
  const Icon = gained > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 font-mono text-[10px] font-bold',
        gained > 0 ? 'text-neon-lime' : 'text-neon-red',
      )}
    >
      <Icon className="size-3" />
      {Math.abs(gained)}
    </span>
  );
}

/** Phase: POST_RACE — classification, points and updated championships. */
export function PostRaceScreen() {
  const { state, dispatch, currentTrack, playerTeam } = useGame();
  if (!state || !state.lastRace) return null;

  const result = state.lastRace;
  const winner = result.finishers[0];
  const winnerDriver = winner ? DRIVER_BY_ID.get(winner.driverId) : undefined;

  const ourFinishes = result.finishers.filter((finish) => finish.teamId === playerTeam?.id);
  const ourPoints = ourFinishes.reduce((sum, finish) => sum + finish.points, 0);
  const seasonComplete = state.round >= state.settings.seasonLength;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neon-amber uppercase">
            Round {result.round} · Result
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-chrome-100">
            <span className="text-2xl leading-none">
              {currentTrack ? flagEmoji(currentTrack.countryCode) : '🏁'}
            </span>
            <span className="truncate">{currentTrack?.name ?? result.trackId}</span>
          </h1>
          <p className="mt-1 text-[12px] text-chrome-500">
            {result.totalLaps} laps completed · {result.finishers.length} classified
          </p>
        </div>

        <GameButton
          size="lg"
          onClick={() => dispatch({ type: 'CONTINUE_TO_NEXT_WEEK' })}
          icon={<ChevronRight className="size-4" />}
        >
          {seasonComplete ? 'Close the books on the season' : 'Continue to Next Week'}
        </GameButton>
      </header>

      {/* Winner + your race */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-panel border border-neon-amber/40 bg-neon-amber/8 px-4 py-3"
        >
          <Trophy className="size-6 shrink-0 text-neon-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-widest text-chrome-500 uppercase">Race winner</p>
            <p className="truncate text-[15px] font-bold text-chrome-100">
              {winnerDriver
                ? `${winnerDriver.firstName} ${winnerDriver.lastName}`
                : winner?.driverId}
            </p>
            <p className="truncate font-mono text-[10px] text-chrome-500">
              {winner ? gridTeamOf(winner.teamId).name : ''}
            </p>
          </div>
          <span className="shrink-0 font-mono text-2xl font-bold text-neon-amber">
            +{winner?.points ?? 0}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="flex items-center gap-3 rounded-panel border border-neon-cyan/35 bg-neon-cyan/8 px-4 py-3"
        >
          <Flag className="size-6 shrink-0 text-neon-cyan" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-widest text-chrome-500 uppercase">Your race</p>
            <p className="truncate text-[15px] font-bold text-chrome-100">
              {ourFinishes.map((finish) => `P${finish.position}`).join(' · ') || 'No finishers'}
            </p>
            <p className="truncate font-mono text-[10px] text-chrome-500">
              Manager rating now {Math.round(state.managerPerformanceScore)}
            </p>
          </div>
          <span className="shrink-0 font-mono text-2xl font-bold text-neon-cyan">
            +{ourPoints}
          </span>
        </motion.div>
      </div>

      {/* Classification */}
      <Panel
        title="Race Classification"
        icon={<Timer className="size-3.5" />}
        flush
        className="mb-4"
        actions={<Badge tone="neutral" mono>Points: 25-18-15-12-10-8-6-4-2-1</Badge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-carbon-600/60 bg-carbon-900/60">
                {['Pos', 'Driver', 'Grid', '+/-', 'Best lap', 'Gap', 'Pts'].map((label, index) => (
                  <th
                    key={label}
                    className={cx(
                      'px-3 py-2 text-[9px] font-bold tracking-[0.16em] text-chrome-500 uppercase',
                      index === 1 ? 'text-left' : index === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.finishers.map((finish, index) => {
                const driver = DRIVER_BY_ID.get(finish.driverId);
                const team = gridTeamOf(finish.teamId);
                const isPlayer = finish.teamId === playerTeam?.id;

                return (
                  <motion.tr
                    key={finish.driverId}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.4) }}
                    className={cx(
                      'border-b border-carbon-700/50',
                      isPlayer ? 'bg-neon-cyan/8' : 'hover:bg-carbon-800/50',
                    )}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={cx(
                          'font-mono text-[13px] font-bold',
                          finish.position === 1
                            ? 'text-neon-amber'
                            : finish.position <= 3
                              ? 'text-chrome-100'
                              : 'text-chrome-400',
                        )}
                      >
                        {finish.status === 'DNF' ? 'DNF' : `P${finish.position}`}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-5 w-1 shrink-0 rounded-full"
                          style={{ background: team.color }}
                        />
                        <span className="text-[11px] leading-none">
                          {driver ? flagEmoji(driver.countryCode) : '🏁'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-chrome-100">
                            {driver ? `${driver.firstName} ${driver.lastName}` : finish.driverId}
                          </p>
                          <p
                            className="truncate font-mono text-[9px]"
                            style={{ color: team.color }}
                          >
                            {team.shortName}
                          </p>
                        </div>
                        {finish.fastestLap && (
                          <Badge tone="violet" className="ml-1 shrink-0 !px-1.5">
                            FL
                          </Badge>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-400">
                      P{finish.gridPosition}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PositionDelta gained={finish.positionsGained} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                      {formatLapTime(finish.bestLapMs)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-400">
                      {finish.position === 1
                        ? '—'
                        : finish.status === 'DNF'
                          ? '—'
                          : `+${(finish.gapToWinnerMs / 1000).toFixed(1)}s`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cx(
                          'font-mono text-[13px] font-bold',
                          finish.points > 0 ? 'text-neon-lime' : 'text-chrome-500',
                        )}
                      >
                        {finish.points > 0 ? `+${finish.points}` : '0'}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Championships */}
      <ChampionshipTables
        standings={state.standings}
        playerTeamId={playerTeam?.id ?? null}
        driverLimit={20}
        icon={<Trophy className="size-3.5" />}
      />

      {seasonComplete && (
        <div className="mt-4 rounded-panel border border-neon-amber/40 bg-neon-amber/8 px-4 py-3">
          <p className="text-[12px] font-semibold text-neon-amber">
            Final round of the {state.season} season.
          </p>
          <p className="mt-1 text-[11px] text-chrome-400">
            Continuing rolls into {state.season + 1}: the championship resets, your manager
            rating and team carry over.
          </p>
        </div>
      )}
    </div>
  );
}
