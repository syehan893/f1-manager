import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, CalendarRange, History, Medal, TrendingUp, Trophy } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { gridTeamOf } from '@/data/grid2026';
import { effectiveDriver } from '@/game/driverDevelopment';
import { currentSeasonRecord } from '@/game/seasonArchive';
import { trackOf } from '@/lib/trackLookup';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { SeasonRecord } from '@/game/types';

/* =====================================================================
 * Career history.
 *
 * The season in progress and every one before it, rendered through the
 * same component so the current year reads as part of the story rather
 * than as a different kind of thing.
 *
 * The point of the screen is the arc: where the team finished each year,
 * what it was paid, and how the manager's own reputation moved. A career
 * that only shows the current standings has no memory, and without a
 * memory none of the long decisions — a young signing, a three-year
 * sponsor deal, a facility that pays back over seasons — have anything
 * to be judged against.
 * ===================================================================== */

/** Podium colouring for the top three, muted for everyone else. */
function positionTone(position: number): string {
  if (position === 1) return 'var(--color-neon-amber)';
  if (position === 2) return 'var(--color-chrome-300)';
  if (position === 3) return 'var(--color-neon-red)';
  return 'var(--color-chrome-500)';
}

/* ---------------------------- the career arc --------------------------- */

function CareerArc({
  seasons,
  selected,
  onSelect,
}: {
  seasons: SeasonRecord[];
  selected: number;
  onSelect: (season: number) => void;
}) {
  const teamCount = 11;

  return (
    <Panel title="Career" icon={<TrendingUp className="size-3.5" />}>
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        Where the team finished in the constructors' championship each year. Lower is better —
        the line is the whole story.
      </p>

      <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
        {seasons.map((record) => {
          // Invert so a good season is a tall bar rather than a short one.
          const height = ((teamCount - record.playerPosition + 1) / teamCount) * 100;
          const active = record.season === selected;

          return (
            <button
              key={record.season}
              type="button"
              onClick={() => onSelect(record.season)}
              title={`${record.season} — P${record.playerPosition}, ${record.playerPoints} points`}
              className="group flex min-w-[42px] flex-1 flex-col items-center gap-1"
            >
              <span
                className="font-mono text-[10px] font-bold"
                style={{ color: positionTone(record.playerPosition) }}
              >
                P{record.playerPosition}
              </span>
              <span className="flex h-24 w-full items-end">
                <motion.span
                  layout
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, height)}%` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                  className={cx(
                    'w-full rounded-t-md transition-colors',
                    active ? 'ring-1 ring-neon-cyan' : 'group-hover:brightness-125',
                  )}
                  style={{
                    background: active
                      ? 'var(--color-neon-cyan)'
                      : positionTone(record.playerPosition),
                    opacity: active ? 1 : 0.55,
                  }}
                />
              </span>
              <span
                className={cx(
                  'font-mono text-[9px]',
                  active ? 'font-bold text-neon-cyan' : 'text-chrome-500',
                )}
              >
                '{String(record.season).slice(-2)}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------ one season ----------------------------- */

function SeasonDetail({ record, live }: { record: SeasonRecord; live: boolean }) {
  const { state } = useGame();
  const [table, setTable] = useState<'DRIVERS' | 'CONSTRUCTORS' | 'ROUNDS'>('CONSTRUCTORS');

  const champTeam = record.championTeamId ? gridTeamOf(record.championTeamId) : null;
  const champDriver = record.championDriverId
    ? effectiveDriver(state, record.championDriverId)
    : null;

  return (
    <Panel
      title={`${record.season} Season`}
      icon={<CalendarRange className="size-3.5" />}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <Badge tone="cyan" mono>
              In progress
            </Badge>
          )}
          <SegmentedControl
            name="history-table"
            size="sm"
            value={table}
            onChange={setTable}
            options={[
              { value: 'CONSTRUCTORS', label: 'Teams' },
              { value: 'DRIVERS', label: 'Drivers' },
              { value: 'ROUNDS', label: 'Rounds' },
            ]}
          />
        </div>
      }
    >
      {/* Headline: how the year went for the player, and who won it. */}
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
          <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Your finish</p>
          <p
            className="mt-1 font-mono text-[18px] font-bold"
            style={{ color: positionTone(record.playerPosition) }}
          >
            P{record.playerPosition}
          </p>
          <p className="text-[10px] text-chrome-500">{record.playerPoints} points</p>
        </div>
        <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
          <p className="text-[9px] tracking-widest text-chrome-600 uppercase">
            {live ? 'Leading' : 'Champions'}
          </p>
          <p className="mt-1 truncate text-[12px] font-bold text-chrome-100">
            {champTeam?.shortName ?? '—'}
          </p>
          <p className="truncate text-[10px] text-chrome-500">
            {champDriver ? `${champDriver.firstName} ${champDriver.lastName}` : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
          <p className="text-[9px] tracking-widest text-chrome-600 uppercase">
            {live ? 'Reputation' : 'Prize money'}
          </p>
          <p className="mt-1 font-mono text-[14px] font-bold text-neon-lime">
            {live ? record.managerScore : formatCurrency(record.prizeMoney, true)}
          </p>
          <p className="text-[10px] text-chrome-500">
            {live ? 'manager rating' : `reputation ${record.managerScore}`}
          </p>
        </div>
      </div>

      {table === 'ROUNDS' ? (
        record.rounds.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-chrome-500">
            No rounds contested yet this season.
          </p>
        ) : (
          <ul className="space-y-1">
            {record.rounds.map((round) => {
              const track = trackOf(round.trackId);
              return (
                <li
                  key={`${round.season}-${round.round}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-carbon-800/60"
                >
                  <span className="w-8 shrink-0 font-mono text-[10px] text-chrome-600">
                    R{round.round}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-chrome-300">
                    {track ? `${flagEmoji(track.countryCode)} ${track.name}` : round.trackId}
                  </span>
                  <span
                    className="w-10 shrink-0 text-right font-mono text-[11px] font-bold"
                    style={{
                      color: round.bestFinish
                        ? positionTone(round.bestFinish)
                        : 'var(--color-chrome-600)',
                    }}
                  >
                    {round.bestFinish ? `P${round.bestFinish}` : 'DNF'}
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-neon-lime">
                    {round.pointsScored > 0 ? `+${round.pointsScored}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <ul className="space-y-1">
          {(table === 'CONSTRUCTORS' ? record.constructors : record.drivers)
            .slice(0, table === 'CONSTRUCTORS' ? 11 : 22)
            .map((row) => {
              const isPlayer = row.teamId === record.playerTeamId;
              const team = gridTeamOf(row.teamId);
              const driver =
                table === 'DRIVERS' ? effectiveDriver(state, row.id) : undefined;

              return (
                <li
                  key={`${table}-${row.id}`}
                  className={cx(
                    'flex items-center gap-2 rounded-md px-2 py-1.5',
                    isPlayer ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/60',
                  )}
                >
                  <span
                    className="w-6 shrink-0 font-mono text-[11px] font-bold"
                    style={{ color: positionTone(row.position) }}
                  >
                    {row.position}
                  </span>
                  <span
                    className="h-4 w-[3px] shrink-0 rounded-full"
                    style={{ background: team.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-chrome-200">
                    {table === 'DRIVERS'
                      ? driver
                        ? `${flagEmoji(driver.countryCode)} ${driver.firstName} ${driver.lastName}`
                        : row.id
                      : team.name}
                  </span>
                  {row.wins > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neon-amber">
                      <Trophy className="size-2.5" />
                      {row.wins}
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] font-bold text-chrome-100">
                    {row.points}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ honours ------------------------------- */

function Honours({ seasons }: { seasons: SeasonRecord[] }) {
  const finished = seasons.filter((record) => record.prizeMoney > 0);

  const titles = finished.filter((r) => r.playerPosition === 1).length;
  const podiums = finished.filter((r) => r.playerPosition <= 3).length;
  const prize = finished.reduce((sum, r) => sum + r.prizeMoney, 0);
  const best = finished.reduce(
    (lowest, r) => Math.min(lowest, r.playerPosition),
    finished.length > 0 ? 99 : 0,
  );

  return (
    <Panel title="Honours" icon={<Medal className="size-3.5" />}>
      {finished.length === 0 ? (
        <p className="py-6 text-center text-[11px] leading-relaxed text-chrome-500">
          No completed seasons yet. Once a championship finishes it is recorded here for good.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Championships',
                value: String(titles),
                tone: 'var(--color-neon-amber)',
                icon: Trophy,
              },
              {
                label: 'Top-three years',
                value: String(podiums),
                tone: 'var(--color-neon-cyan)',
                icon: Award,
              },
              {
                label: 'Best finish',
                value: `P${best}`,
                tone: positionTone(best),
                icon: Medal,
              },
              {
                label: 'Prize money',
                value: formatCurrency(prize, true),
                tone: 'var(--color-neon-lime)',
                icon: TrendingUp,
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5"
                >
                  <p className="flex items-center gap-1 text-[9px] tracking-widest text-chrome-600 uppercase">
                    <Icon className="size-2.5" style={{ color: stat.tone }} />
                    {stat.label}
                  </p>
                  <p className="mt-1 font-mono text-[15px] font-bold" style={{ color: stat.tone }}>
                    {stat.value}
                  </p>
                </div>
              );
            })}
          </div>

          <ul className="mt-3 space-y-1">
            {[...finished].reverse().map((record) => (
              <li
                key={record.season}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-carbon-800/60"
              >
                <span className="w-9 shrink-0 font-mono text-[11px] text-chrome-500">
                  {record.season}
                </span>
                <span
                  className="w-7 shrink-0 font-mono text-[11px] font-bold"
                  style={{ color: positionTone(record.playerPosition) }}
                >
                  P{record.playerPosition}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-chrome-500">
                  {record.playerPoints} pts · {gridTeamOf(record.championTeamId ?? '').shortName}{' '}
                  champions
                </span>
                <span className="shrink-0 font-mono text-[10px] text-neon-lime">
                  {formatCurrency(record.prizeMoney, true)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------- screen -------------------------------- */

export function HistoryView() {
  const { state } = useGame();

  /* Past seasons plus the one being run, so the current year is browsable
   * the same way as the finished ones. */
  const seasons = useMemo(() => {
    if (!state) return [];
    return [...state.seasonArchive, currentSeasonRecord(state)];
  }, [state]);

  const [selected, setSelected] = useState<number | null>(null);
  if (!state) return null;

  const active =
    seasons.find((record) => record.season === selected) ?? seasons[seasons.length - 1];
  if (!active) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <CareerArc
          seasons={seasons}
          selected={active.season}
          onSelect={setSelected}
        />
        <SeasonDetail record={active} live={active.season === state.season} />
      </div>

      <div className="grid content-start gap-4">
        <Honours seasons={seasons} />

        <Panel title="About this record" icon={<History className="size-3.5" />}>
          <p className="text-[11px] leading-relaxed text-chrome-500">
            A championship is written down the moment its final round is settled, and nothing
            edits it afterwards. The season in progress is shown alongside them from live
            standings, so the table you are looking at now is the one that will be archived.
          </p>
        </Panel>
      </div>
    </div>
  );
}
