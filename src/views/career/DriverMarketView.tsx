import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightLeft, Search, Sparkles, Users, UsersRound } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { GameButton } from '@/components/game/GameButton';
import { driverRating, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { prospectToDriver, scoutedRange } from '@/game/driverDevelopment';
import { useGame } from '@/state/gameContext';
import type { Driver } from '@/types';

type SortKey = 'rating' | 'age' | 'salary';

/** Ages past this are shown in red — the driver is on the way down. */
const DECAY_AGE = 34;

function ContractCard({
  driver,
  accent,
  onRelease,
  releaseLabel,
}: {
  driver: Driver;
  accent: string;
  onRelease?: () => void;
  releaseLabel?: string;
}) {
  return (
    <motion.div
      layout
      className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
    >
      <div className="flex items-center gap-3">
        <DriverPortrait driver={driver} teamColor={accent} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-chrome-100">
            {driver.firstName} {driver.lastName}
          </p>
          <p className="truncate text-[10px] text-chrome-500">
            {flagEmoji(driver.countryCode)} #{driver.carNumber} · Age{' '}
            <span className={cx(driver.age >= DECAY_AGE && 'font-bold text-neon-red')}>
              {driver.age}
            </span>{' '}
            · {formatCurrency(driver.contract.salaryPerSeason, true)}/yr
          </p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 font-mono text-[14px] font-bold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {driverRating(driver)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['Pace', driver.attributes.pace],
            ['Racecraft', driver.attributes.racecraft],
            ['Consistency', driver.attributes.consistency],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">{label}</p>
            <p className="font-mono text-[13px] font-bold text-chrome-100">{value}</p>
          </div>
        ))}
      </div>

      {onRelease && (
        <GameButton
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          onClick={onRelease}
          icon={<ArrowRightLeft className="size-3" />}
        >
          {releaseLabel ?? 'Swap out'}
        </GameButton>
      )}
    </motion.div>
  );
}


/* ---------------------------------------------------------------------
 * The junior intake.
 *
 * A new class every season, and the one you pass on is gone — an AI team
 * will take them instead. A prospect is signed on their ceiling rather
 * than on what the timing screen says today, which is the whole gamble:
 * cheap, fast, and short on everything that only laps teach.
 * ------------------------------------------------------------------- */

function YoungTalent({ outgoingId }: { outgoingId: string | null }) {
  const { state, playerDrivers, dispatch } = useGame();
  if (!state) return null;

  const unsigned = state.prospects.filter((prospect) => !state.driverTeams[prospect.id]);
  const outgoing = outgoingId ?? playerDrivers[0]?.id;

  return (
    <Panel
      title={`Junior Intake — Class of ${state.season}`}
      icon={<Sparkles className="size-3.5" />}
      actions={
        <Badge tone={unsigned.length > 0 ? 'cyan' : 'neutral'} mono>
          {unsigned.length} available
        </Badge>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        A fresh class every season, and it does not carry over — anyone still unsigned at the
        flag can be promoted by a rival instead. You are buying the ceiling, not the current
        rating.
      </p>

      {unsigned.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-chrome-500">
          This year's class has all found seats.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {unsigned.map((prospect) => {
            const driver = prospectToDriver(prospect);
            const now = driverRating(driver);
            /* A ceiling nobody can measure is the whole gamble. Scouts
             * give a range, not a number, and it only narrows once the
             * driver has actually run seasons. */
            const scouted = scoutedRange(state, prospect.id);

            return (
              <div
                key={prospect.id}
                className="flex flex-col rounded-lg border border-carbon-600 bg-carbon-900/50 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-chrome-100">
                      {flagEmoji(prospect.countryCode)} {prospect.firstName} {prospect.lastName}
                    </p>
                    <p className="truncate text-[10px] text-chrome-500">
                      Age {prospect.age} · {formatCurrency(prospect.salary, true)}/yr
                    </p>
                  </div>
                </div>

                {/* Now against ceiling: the gap is the reason to sign them. */}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
                    <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Today</p>
                    <p className="font-mono text-[13px] font-bold text-chrome-300">{now}</p>
                  </div>
                  <div className="rounded-md border border-neon-cyan/25 bg-neon-cyan/[0.06] px-2 py-1.5">
                    <p className="text-[8px] tracking-widest text-chrome-600 uppercase">
                      Scouted ceiling
                    </p>
                    <p className="font-mono text-[13px] font-bold text-neon-cyan">
                      {scouted.low}–{scouted.high}
                      <span className="ml-1 text-[9px] font-normal opacity-70">
                        ({scouted.high - scouted.low > 8 ? 'raw read' : 'confident'})
                      </span>
                    </p>
                  </div>
                </div>

                <GameButton
                  size="sm"
                  className="mt-2.5"
                  disabled={!outgoing}
                  title={
                    outgoing
                      ? `Sign ${prospect.lastName} in place of your selected driver`
                      : 'Select which of your drivers leaves first.'
                  }
                  onClick={() =>
                    outgoing &&
                    dispatch({
                      type: 'SIGN_PROSPECT',
                      prospectId: prospect.id,
                      outgoingDriverId: outgoing,
                    })
                  }
                  icon={<Sparkles className="size-3" />}
                >
                  Promote
                </GameButton>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function DriverMarketView() {
  const { state, roster, playerTeam, playerDrivers, dispatch } = useGame();

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [outgoingId, setOutgoingId] = useState<string | null>(null);

  const market = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster
      .filter((driver) => driver.teamId !== playerTeam?.id)
      .filter(
        (driver) =>
          !needle || `${driver.firstName} ${driver.lastName}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (sortKey === 'age') return a.age - b.age;
        if (sortKey === 'salary') return a.contract.salaryPerSeason - b.contract.salaryPerSeason;
        return driverRating(b) - driverRating(a);
      });
  }, [roster, playerTeam, query, sortKey]);

  if (!state || !playerTeam) return null;

  const swap = (incomingDriverId: string) => {
    const outgoing = outgoingId ?? playerDrivers[0]?.id;
    if (!outgoing) return;
    const ok = dispatch({
      type: 'SWAP_DRIVER',
      incomingDriverId,
      outgoingDriverId: outgoing,
    });
    if (ok) setOutgoingId(null);
  };

  return (
    <div className="grid gap-4">
      {/* Your line-up */}
      <Panel
        title="Your Race Seats"
        icon={<Users className="size-3.5" />}
        actions={<Badge tone="cyan">{playerTeam.name}</Badge>}
      >
        <p className="mb-3 text-[11px] text-chrome-500">
          Pick which of your drivers leaves, then swap in a replacement from the grid below. It is
          a straight exchange — the other team takes your driver in return, and both teams keep two
          cars.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {playerDrivers.map((driver) => (
              <div
                key={driver.id}
                className={cx(
                  'rounded-lg transition-shadow',
                  outgoingId === driver.id && 'ring-2 ring-neon-red/60',
                )}
              >
                <ContractCard
                  driver={driver}
                  accent={playerTeam.color}
                  releaseLabel={outgoingId === driver.id ? 'Selected to leave' : 'Select to swap out'}
                  onRelease={() =>
                    setOutgoingId(outgoingId === driver.id ? null : driver.id)
                  }
                />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </Panel>

      <YoungTalent outgoingId={outgoingId} />

      {/* The rest of the grid */}
      <Panel
        title="Driver Market — 2026 Grid"
        icon={<UsersRound className="size-3.5" />}
        flush
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-chrome-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search drivers"
                aria-label="Search drivers"
                className="w-36 rounded-md border border-carbon-600 bg-carbon-900/70 py-1.5 pr-2 pl-7 text-[11px] text-chrome-100 placeholder:text-chrome-500 focus:border-neon-cyan/50 focus:outline-none"
              />
            </label>
            <SegmentedControl
              name="market-sort"
              size="sm"
              value={sortKey}
              onChange={setSortKey}
              options={[
                { value: 'rating', label: 'Rating' },
                { value: 'age', label: 'Age' },
                { value: 'salary', label: 'Salary' },
              ]}
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-carbon-600/60 bg-carbon-900/60">
                {['Driver', 'Team', 'Age', 'Pace', 'Racecraft', 'Rating', 'Salary', ''].map(
                  (label, index) => (
                    <th
                      key={label || index}
                      className={cx(
                        'px-3 py-2 text-[9px] font-bold tracking-[0.16em] text-chrome-500 uppercase',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {market.map((driver) => {
                const team = gridTeamOf(driver.teamId);
                return (
                  <tr
                    key={driver.id}
                    className="border-b border-carbon-700/50 transition-colors hover:bg-carbon-800/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <DriverPortrait
                          driver={driver}
                          teamColor={team.color}
                          size={28}
                          showNumber={false}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-chrome-100">
                            {driver.firstName} {driver.lastName}
                          </p>
                          <p className="truncate font-mono text-[9px] text-chrome-500">
                            {flagEmoji(driver.countryCode)} #{driver.carNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-mono text-[11px] font-bold"
                        style={{ color: team.color }}
                      >
                        {team.shortName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cx(
                          'font-mono text-[12px] font-bold',
                          driver.age >= DECAY_AGE ? 'text-neon-red' : 'text-chrome-200',
                        )}
                      >
                        {driver.age}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-chrome-200">
                      {driver.attributes.pace}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-chrome-200">
                      {driver.attributes.racecraft}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] font-bold text-neon-cyan">
                      {driverRating(driver)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                      {formatCurrency(driver.contract.salaryPerSeason, true)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <GameButton size="sm" onClick={() => swap(driver.id)}>
                        Swap in
                      </GameButton>
                    </td>
                  </tr>
                );
              })}

              {market.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[11px] text-chrome-500">
                    No drivers match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Line-up strength */}
      <Panel title="Line-up Strength" icon={<Users className="size-3.5" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          {playerDrivers.map((driver) => (
            <div key={driver.id}>
              <StatBar
                label={`${driver.firstName} ${driver.lastName}`}
                value={driverRating(driver)}
                color={playerTeam.color}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-chrome-500">
          Combined line-up rating{' '}
          <span className="font-mono font-bold text-chrome-200">
            {playerDrivers.length
              ? Math.round(
                  playerDrivers.reduce((sum, d) => sum + driverRating(d), 0) /
                    playerDrivers.length,
                )
              : 0}
          </span>
          . Every transfer is written to the save immediately and applies from the next session.
        </p>
      </Panel>
    </div>
  );
}
