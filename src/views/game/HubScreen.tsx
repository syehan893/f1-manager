import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Gauge,
  Trophy,
  X,
} from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { ChampionshipTables } from '@/components/game/ChampionshipTables';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { TrackThumbnail } from '@/components/career/TrackThumbnail';
import { PROFILE_LABEL } from '@/lib/trackProfile';
import { WEATHER_ICON, WEATHER_LABEL, WEATHER_TONE } from '@/lib/weather';
import { ROLE_LABEL, jobOpenings } from '@/game/jobMarket';
import { scaledLaps } from '@/game/trackAdapter';
import { gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/** Phase: HUB — the screen between races. */
export function HubScreen() {
  const { state, dispatch, playerTeam, currentTrack, calendar } = useGame();

  const openings = useMemo(() => (state ? jobOpenings(state) : []), [state]);

  if (!state || !playerTeam) return null;

  const WeatherIcon = currentTrack ? WEATHER_ICON[currentTrack.forecast.kind] : Gauge;
  const laps = currentTrack ? scaledLaps(currentTrack, state.settings.raceLengthPct) : 0;
  const seasonComplete = state.round > state.settings.seasonLength;

  const latestApplication = state.jobApplications[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neon-cyan uppercase">
            Season {state.season} · Round {state.round} of {state.settings.seasonLength} · Week{' '}
            {state.week}
          </p>
          <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold text-chrome-100">
            <span
              className="grid size-9 place-items-center rounded-lg font-mono text-[11px] font-black text-carbon-950"
              style={{ background: playerTeam.color }}
            >
              {playerTeam.shortName}
            </span>
            Manager Hub
          </h1>
          <p className="mt-1 text-[12px] text-chrome-500">
            {state.managerName} · {playerTeam.name}
          </p>
        </div>

        <GameButton
          size="lg"
          onClick={() => dispatch({ type: 'PROCEED_TO_QUALIFYING' })}
          disabled={seasonComplete}
          icon={<ChevronRight className="size-4" />}
        >
          Proceed to Qualifying
        </GameButton>
      </header>

      {/* Manager standing */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Manager rating',
            value: String(Math.round(state.managerPerformanceScore)),
            tone: 'text-neon-violet',
          },
          {
            label: 'Team budget',
            value: formatCurrency(
              state.teams.find((t) => t.teamId === playerTeam.id)?.budget ?? 0,
              true,
            ),
            tone: 'text-neon-lime',
          },
          {
            label: 'WCC position',
            value: `P${
              state.standings.constructors.find((row) => row.teamId === playerTeam.id)?.position ??
              '—'
            }`,
            tone: 'text-neon-cyan',
          },
          {
            label: 'Points scored',
            value: String(
              state.standings.constructors.find((row) => row.teamId === playerTeam.id)?.points ?? 0,
            ),
            tone: 'text-chrome-100',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-carbon-600/70 bg-carbon-850/70 px-3 py-2.5"
          >
            <p className="text-[9px] tracking-widest text-chrome-500 uppercase">{stat.label}</p>
            <p className={cx('mt-1 font-mono text-lg font-bold', stat.tone)}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        {/* Next race */}
        {currentTrack && (
          <Panel
            title="Next Grand Prix"
            icon={<CalendarDays className="size-3.5" />}
            actions={<Badge tone="red">Round {state.round}</Badge>}
          >
            <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/50 p-2">
                <div className="aspect-[4/3]">
                  <TrackThumbnail track={currentTrack} strokeWidth={26} showStartLine />
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-lg font-bold text-chrome-100">
                  <span className="text-xl leading-none">
                    {flagEmoji(currentTrack.countryCode)}
                  </span>
                  <span className="truncate">{currentTrack.name}</span>
                </h3>
                <p className="mt-0.5 text-[11px] text-chrome-500">
                  {currentTrack.city}, {currentTrack.country}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Race laps', value: `${laps}`, tone: 'text-neon-cyan' },
                    { label: 'Distance', value: `${state.settings.raceLengthPct}%`, tone: 'text-chrome-100' },
                    { label: 'Profile', value: PROFILE_LABEL[currentTrack.profile], tone: 'text-chrome-100' },
                    { label: 'Rain', value: `${currentTrack.forecast.rainChancePct}%`, tone: 'text-neon-blue' },
                  ].map((cell) => (
                    <div
                      key={cell.label}
                      className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2"
                    >
                      <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
                        {cell.label}
                      </p>
                      <p className={cx('mt-0.5 truncate font-mono text-[12px] font-bold', cell.tone)}>
                        {cell.value}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-3 flex items-center gap-2 text-[11px] text-chrome-400">
                  <WeatherIcon
                    className={cx('size-4', WEATHER_TONE[currentTrack.forecast.kind])}
                  />
                  {WEATHER_LABEL[currentTrack.forecast.kind]} · {currentTrack.forecast.airTempC}°C
                  air, {currentTrack.forecast.trackTempC}°C track
                </p>
              </div>
            </div>

            {/* Season strip */}
            <div className="mt-4 flex gap-1.5 overflow-x-auto border-t border-carbon-600/60 pt-3">
              {calendar.map((track, index) => {
                const round = index + 1;
                const done = round < state.round;
                const now = round === state.round;
                return (
                  <div
                    key={track.id}
                    title={`R${round} · ${track.name}`}
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold',
                      now
                        ? 'border-neon-red bg-neon-red/15 text-neon-red'
                        : done
                          ? 'border-carbon-600 bg-carbon-800/60 text-chrome-500'
                          : 'border-carbon-600/70 text-chrome-400',
                    )}
                  >
                    {round}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Standings */}
        <ChampionshipTables
          standings={state.standings}
          playerTeamId={playerTeam.id}
          icon={<Trophy className="size-3.5" />}
        />

        {/* Job market */}
        <Panel
          title="Job Market"
          icon={<Briefcase className="size-3.5" />}
          actions={
            <Badge tone="violet" mono>
              Your rating {Math.round(state.managerPerformanceScore)}
            </Badge>
          }
        >
          <p className="mb-3 text-[11px] text-chrome-500">
            Applications are judged against your manager rating, which moves with how far you
            beat — or fall short of — what your car should deliver.
          </p>

          {latestApplication && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cx(
                'mb-3 flex items-start gap-2 rounded-lg border px-3 py-2',
                latestApplication.accepted
                  ? 'border-neon-lime/40 bg-neon-lime/8'
                  : 'border-neon-red/35 bg-neon-red/8',
              )}
            >
              {latestApplication.accepted ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-neon-lime" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-neon-red" />
              )}
              <p className="text-[11px] leading-relaxed text-chrome-300">
                {latestApplication.message}
              </p>
            </motion.div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-carbon-600/60">
                  {['Team', 'Open role', 'Budget', 'Required', 'Salary', ''].map((label, index) => (
                    <th
                      key={label || index}
                      className={cx(
                        'px-3 py-2 text-[9px] font-bold tracking-[0.16em] text-chrome-500 uppercase',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openings.map((opening) => {
                  const team = gridTeamOf(opening.teamId);
                  const budget =
                    state.teams.find((t) => t.teamId === opening.teamId)?.budget ?? team.budget;
                  const meets = state.managerPerformanceScore >= opening.requiredScore;
                  const appliedThisWeek = state.jobApplications.some(
                    (application) =>
                      application.teamId === opening.teamId &&
                      application.season === state.season &&
                      application.round === state.round,
                  );

                  return (
                    <tr
                      key={opening.teamId}
                      className="border-b border-carbon-700/50 transition-colors hover:bg-carbon-800/50"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-5 w-1 shrink-0 rounded-full"
                            style={{ background: team.color }}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-chrome-100">
                              {team.name}
                            </p>
                            <p className="truncate text-[9px] text-chrome-500">{opening.note}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[11px] text-chrome-300">
                        {ROLE_LABEL[opening.role]}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                        {formatCurrency(budget, true)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cx(
                            'font-mono text-[12px] font-bold',
                            meets ? 'text-neon-lime' : 'text-neon-red',
                          )}
                        >
                          {opening.requiredScore}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                        {formatCurrency(opening.salary, true)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <GameButton
                          size="sm"
                          variant={meets ? 'primary' : 'secondary'}
                          disabled={appliedThisWeek}
                          title={
                            appliedThisWeek
                              ? 'Already applied this week.'
                              : meets
                                ? 'You meet their bar.'
                                : 'Below their bar — a long shot.'
                          }
                          onClick={() =>
                            dispatch({
                              type: 'APPLY_FOR_JOB',
                              teamId: opening.teamId,
                              role: opening.role,
                            })
                          }
                        >
                          {appliedThisWeek ? 'Applied' : 'Apply'}
                        </GameButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 border-t border-carbon-600/60 pt-3">
            <StatBar
              label="Manager performance score"
              value={state.managerPerformanceScore}
              color="var(--color-neon-violet)"
              segmented
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
