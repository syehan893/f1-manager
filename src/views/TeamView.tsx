import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Receipt,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { GameButton } from '@/components/game/GameButton';
import { FACILITY_BY_ID, facilityUpgradeCost } from '@/game/facilities';
import {
  LEDGER_LABEL,
  isIncome,
  projectSeason,
  roundOperatingCost,
  roundRetainer,
  roundWageBill,
} from '@/game/finance';
import { carRating, driverRating, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';



/** Team — your constructor as it stands in the save. */
export function TeamView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, playerTeam, playerDrivers, dispatch } = useGame();

  if (!state || !playerTeam) return null;

  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const wcc = state.standings.constructors.find((row) => row.teamId === playerTeam.id);
  const driverWages = playerDrivers.reduce(
    (sum, driver) => sum + driver.contract.salaryPerSeason,
    0,
  );
  const rating = carRating(team.car);

  /* Finance derivations. These are the same functions the reducer uses to
   * charge the money, so the panel can never disagree with the ledger. */
  const projection = projectSeason(state);
  const retainer = roundRetainer(state);
  const wages = roundWageBill(state);
  const operations = roundOperatingCost(state);
  const contracts = state.finance.contracts.filter((c) => c.seasonsRemaining > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {/* Identity */}
      <Panel title="Team Profile" icon={<Users className="size-3.5" />} className="xl:col-span-2">
        <div className="flex flex-wrap items-start gap-5">
          <div
            className="grid size-16 shrink-0 place-items-center rounded-xl text-xl font-black text-carbon-950"
            style={{ background: playerTeam.color, boxShadow: `0 0 28px -6px ${playerTeam.color}` }}
          >
            {playerTeam.shortName}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-chrome-100">{playerTeam.fullName}</h3>
            <p className="text-[11px] text-chrome-500">
              {flagEmoji(playerTeam.countryCode)} {playerTeam.base} · {playerTeam.principal} ·{' '}
              {playerTeam.engineSupplier}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Budget', value: formatCurrency(team.budget, true), tone: 'text-neon-lime' },
                { label: 'Car rating', value: String(rating), tone: 'text-neon-cyan' },
                { label: 'WCC', value: `P${wcc?.position ?? '—'}`, tone: 'text-neon-amber' },
                { label: 'Points', value: String(wcc?.points ?? 0), tone: 'text-chrome-100' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2"
                >
                  <p className="text-[9px] tracking-widest text-chrome-500 uppercase">
                    {stat.label}
                  </p>
                  <p className={cx('mt-0.5 font-mono text-[13px] font-bold', stat.tone)}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Race drivers */}
        <div className="mt-5 border-t border-carbon-600/60 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Race Drivers</p>
            <button
              type="button"
              onClick={() => onNavigate('drivers')}
              className="text-[10px] font-bold tracking-wider text-neon-cyan uppercase transition-opacity hover:opacity-80"
            >
              Full profiles →
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {playerDrivers.map((driver) => (
              <div
                key={driver.id}
                className="flex items-center gap-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
              >
                <DriverPortrait driver={driver} teamColor={playerTeam.color} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-chrome-100">
                    {driver.firstName} {driver.lastName}
                  </p>
                  <p className="text-[10px] text-chrome-500">
                    {flagEmoji(driver.countryCode)} #{driver.carNumber} · Age {driver.age}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <StatBar
                      label="Overall"
                      value={driverRating(driver)}
                      size="sm"
                      color={playerTeam.color}
                    />
                    <StatBar
                      label="Morale"
                      value={driver.morale}
                      size="sm"
                      color="var(--color-neon-lime)"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Finance */}
      <Panel
        title="Finance"
        icon={<Wallet className="size-3.5" />}
        actions={
          <Badge tone={projection.perRoundNet >= 0 ? 'lime' : 'red'} mono>
            {projection.perRoundNet >= 0 ? '+' : ''}
            {formatCurrency(projection.perRoundNet, true)}/rd
          </Badge>
        }
      >
        <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
          <p className="eyebrow mb-2">Cash at Bank</p>
          <p
            className="font-mono text-2xl font-bold"
            style={{
              color:
                team.budget > 0 ? 'var(--color-neon-lime)' : 'var(--color-neon-red)',
            }}
          >
            {formatCurrency(team.budget)}
          </p>
          {/* The projection is the honest part: it says what happens if the
              player buys nothing else this season. */}
          <p className="mt-1 text-[10px] text-chrome-500">
            {projection.roundsRemaining} round{projection.roundsRemaining === 1 ? '' : 's'} left ·
            on current commitments you finish the season on{' '}
            <span
              className="font-mono font-bold"
              style={{
                color:
                  projection.projectedBalance >= 0
                    ? 'var(--color-chrome-300)'
                    : 'var(--color-neon-red)',
              }}
            >
              {formatCurrency(projection.projectedBalance, true)}
            </span>
          </p>
        </div>

        {/* Per-round cash flow, which is what actually constrains spending. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-neon-lime/25 bg-neon-lime/[0.05] p-2.5">
            <p className="flex items-center gap-1 text-[9px] tracking-wider text-chrome-500 uppercase">
              <ArrowUpRight className="size-3 text-neon-lime" /> In / round
            </p>
            <p className="mt-1 font-mono text-[14px] font-bold text-neon-lime">
              {formatCurrency(retainer, true)}
            </p>
            <p className="mt-0.5 text-[9px] text-chrome-500">
              {contracts.length} partner{contracts.length === 1 ? '' : 's'} + result bonuses
            </p>
          </div>
          <div className="rounded-lg border border-neon-red/25 bg-neon-red/[0.05] p-2.5">
            <p className="flex items-center gap-1 text-[9px] tracking-wider text-chrome-500 uppercase">
              <ArrowDownRight className="size-3 text-neon-red" /> Out / round
            </p>
            <p className="mt-1 font-mono text-[14px] font-bold text-neon-red">
              {formatCurrency(wages + operations, true)}
            </p>
            <p className="mt-0.5 text-[9px] text-chrome-500">
              {formatCurrency(wages, true)} wages + {formatCurrency(operations, true)} ops
            </p>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {[
            { label: 'Season wage bill', value: driverWages, color: 'var(--color-neon-cyan)' },
            {
              label: 'R&D committed',
              value: Object.values(state.rndSpent).reduce((a, b) => a + b, 0),
              color: 'var(--color-neon-violet)',
            },
            {
              label: 'Season income',
              value: state.finance.seasonIncome,
              color: 'var(--color-neon-lime)',
            },
            {
              label: 'Season spend',
              value: state.finance.seasonExpenditure,
              color: 'var(--color-neon-amber)',
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2"
            >
              <span className="text-[10px] tracking-wider text-chrome-500 uppercase">
                {row.label}
              </span>
              <span className="font-mono text-[12px] font-bold" style={{ color: row.color }}>
                {formatCurrency(row.value, true)}
              </span>
            </div>
          ))}
        </div>

        {/* The ledger: every figure in the game, with its reason attached. */}
        <div className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Receipt className="size-3" /> Recent Transactions
          </p>
          {state.finance.ledger.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-chrome-500">
              Nothing has moved through the accounts yet.
            </p>
          ) : (
            <ul className="max-h-[220px] space-y-1 overflow-y-auto">
              {state.finance.ledger.slice(0, 24).map((entry) => {
                const income = isIncome(entry.kind);
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-carbon-800/60"
                  >
                    <span className="w-8 shrink-0 font-mono text-[9px] text-chrome-600">
                      R{entry.round}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] text-chrome-300">
                        {entry.label}
                      </span>
                      <span className="block truncate text-[9px] text-chrome-600">
                        {LEDGER_LABEL[entry.kind]}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-mono text-[11px] font-bold"
                      style={{
                        color: income
                          ? 'var(--color-neon-lime)'
                          : 'var(--color-neon-red)',
                      }}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {formatCurrency(entry.amount, true)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <TrendingUp className="size-3" /> Manager Standing
          </p>
          <StatBar
            label="Performance score"
            value={state.managerPerformanceScore}
            color="var(--color-neon-violet)"
            segmented
          />
          <p className="mt-2 text-[10px] leading-relaxed text-chrome-500">
            Rises when you beat what the car should deliver. Rival teams judge job applications
            against it.
          </p>
        </div>
      </Panel>

      {/* Facilities */}
      <Panel title="Facilities" icon={<Building2 className="size-3.5" />} className="xl:col-span-2">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {state.facilities.map((facility) => {
            const meta = FACILITY_BY_ID.get(facility.id);
            const maxed = facility.level >= facility.maxLevel;
            const cost = facilityUpgradeCost(facility);
            const affordable = team.budget >= cost;

            return (
              <div
                key={facility.id}
                className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-chrome-100">
                    {meta?.name ?? facility.id}
                  </p>
                  <span className="font-mono text-[10px] text-chrome-500">
                    LVL {facility.level}/{facility.maxLevel}
                  </span>
                </div>

                <div className="mt-2 flex gap-1">
                  {Array.from({ length: facility.maxLevel }).map((_, index) => (
                    <motion.span
                      key={index}
                      layout
                      className={cx(
                        'h-1.5 flex-1 rounded-full',
                        index < facility.level ? 'bg-neon-cyan' : 'bg-carbon-700',
                      )}
                      style={
                        index < facility.level
                          ? { boxShadow: '0 0 8px var(--color-neon-cyan)' }
                          : undefined
                      }
                    />
                  ))}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] text-chrome-500" title={meta?.effect}>
                    {meta?.effect ?? ''}
                  </span>
                  {maxed ? (
                    <Badge tone="lime" className="shrink-0">
                      Maxed
                    </Badge>
                  ) : (
                    <GameButton
                      size="sm"
                      variant="secondary"
                      disabled={!affordable}
                      title={
                        affordable
                          ? `Level ${facility.level + 1}: ${meta?.effect ?? ''}`
                          : 'Not enough budget.'
                      }
                      onClick={() =>
                        dispatch({ type: 'UPGRADE_FACILITY', facilityId: facility.id })
                      }
                    >
                      {formatCurrency(cost, true)}
                    </GameButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Championship */}
      <Panel title="Constructors' Championship" icon={<Trophy className="size-3.5" />}>
        <ul className="space-y-1">
          {state.standings.constructors.slice(0, 11).map((row) => {
            const isPlayer = row.teamId === playerTeam.id;
            return (
              <li
                key={row.teamId}
                className={cx(
                  'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5',
                  isPlayer ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/60',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 font-mono text-[11px] font-bold text-chrome-400">
                    {row.position}
                  </span>
                  <span
                    className={cx(
                      'truncate text-[12px] font-semibold',
                      isPlayer ? 'text-neon-cyan' : 'text-chrome-200',
                    )}
                  >
                    {gridTeamOf(row.teamId).name}
                  </span>
                </span>
                <span className="font-mono text-[12px] font-bold text-chrome-100">
                  {row.points}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
