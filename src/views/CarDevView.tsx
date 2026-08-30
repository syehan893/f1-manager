import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Battery,
  Boxes,
  Cog,
  Gauge,
  Hammer,
  Trash2,
  TrendingUp,
  Wind,
  Wrench,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { carRating, gridTeamOf } from '@/data/grid2026';
import {
  ASSEMBLY_PARTS,
  CARS_PER_TEAM,
  ENGINE_ALLOCATION,
  PART_BY_ID,
  POWER_UNIT_PARTS,
  buildsRemaining,
  carStatsOf,
  enginePenaltyPlaces,
  fittedPart,
  fittedUnit,
  partBuildCost,
  partHealthFactor,
  powerUnitCost,
  sparePartsOf,
  unitSpecRating,
} from '@/game/carModel';
import { partLevel } from '@/game/partDevelopment';
import { driverWearFactor } from '@/game/roster';
import { PHILOSOPHY_BLURB, PHILOSOPHY_LABEL, philosophyFor } from '@/game/aiDevelopment';
import { GROUP_META, levelTone } from '@/lib/partStyle';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { BuiltPart, PartCategory, TeamSeasonState } from '@/game/types';
import type { Driver } from '@/types';

/* =====================================================================
 * The garage — two cars, one drawing office.
 *
 * R&D raises a drawing and that drawing is the team's. Everything after
 * it is per car: the factory builds a part for a specific car, the
 * mechanics bolt it to that car, and it wears at the rate that car's
 * driver sets. Two cars that left the winter identical are different
 * machines by mid-season, and which one gets the next floor is a real
 * decision because the build allowance is the team's and not the car's.
 *
 * One driver, one car: car 1 is the first name in the line-up, car 2 the
 * second. Promoting a reserve changes who drives a car, never which
 * parts are on it — a floor does not follow a driver out of the garage.
 * ===================================================================== */

/** Health is the number the player actually reads on this screen. */
function healthTone(healthPct: number): string {
  if (healthPct >= 65) return 'var(--color-neon-lime)';
  if (healthPct >= 35) return 'var(--color-neon-amber)';
  return 'var(--color-neon-red)';
}

function HealthBar({ healthPct, thin }: { healthPct: number; thin?: boolean }) {
  const tone = healthTone(healthPct);
  return (
    <div
      className={cx(
        'w-full overflow-hidden rounded-full bg-carbon-700',
        thin ? 'h-1' : 'h-1.5',
      )}
    >
      <motion.div
        className="h-full rounded-full"
        initial={false}
        animate={{ width: `${Math.max(2, healthPct)}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
      />
    </div>
  );
}

/** How many weekends this part has left in it, at this driver's rate. */
function weekendsLeft(part: BuiltPart, wearFactor: number): number {
  const life = PART_BY_ID.get(part.category)?.lifeRounds ?? 5;
  const perWeekend = (100 / life) * wearFactor;
  return perWeekend <= 0 ? 99 : Math.floor(part.healthPct / perWeekend);
}

/* --------------------------- one part, one car ------------------------- */

function PartBay({
  category,
  carIndex,
  team,
  wearFactor,
}: {
  category: PartCategory;
  carIndex: number;
  team: TeamSeasonState;
  wearFactor: number;
}) {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const definition = PART_BY_ID.get(category)!;
  const Icon = GROUP_META[definition.group].icon;

  const drawing = partLevel(team, category);
  const fitted = fittedPart(team, category, carIndex);
  const spares = sparePartsOf(team, category);
  const remaining = buildsRemaining(team, category, state.season);
  const cost = partBuildCost(team, category, state.season);
  const affordable = team.budget >= cost;

  const onCar = fitted ? fitted.spec * partHealthFactor(fitted.healthPct) : drawing;
  const upside = drawing - onCar;
  const left = fitted ? weekendsLeft(fitted, wearFactor) : 0;

  return (
    <li className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
      <div className="flex items-center gap-2">
        <Icon className="size-3 shrink-0" style={{ color: GROUP_META[definition.group].tone }} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-chrome-100">
          {definition.label}
        </span>
        <span
          className="shrink-0 font-mono text-[13px] font-bold"
          style={{ color: levelTone(onCar) }}
        >
          {onCar.toFixed(1)}
        </span>
      </div>

      {fitted ? (
        <div className="mt-1.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-mono text-[9.5px] text-chrome-500">
              spec {fitted.spec.toFixed(1)} · {Math.round(fitted.mileageLaps)} laps
            </span>
            <span
              className="font-mono text-[9.5px] font-bold"
              style={{ color: healthTone(fitted.healthPct) }}
            >
              {fitted.healthPct <= 0
                ? 'finished'
                : `${left} weekend${left === 1 ? '' : 's'} left`}
            </span>
          </div>
          <HealthBar healthPct={fitted.healthPct} thin />
        </div>
      ) : (
        <p className="mt-1.5 text-[9.5px] text-neon-amber">
          Nothing fitted — running the drawing.
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-chrome-500">
          {formatCurrency(cost, true)} · {remaining}/{definition.buildAllowance} left
          {upside >= 0.5 && <span className="ml-1 text-neon-lime">+{upside.toFixed(1)}</span>}
          {remaining === 0 && <span className="ml-1 text-neon-amber">rushed</span>}
        </span>
        <GameButton
          size="sm"
          variant={affordable ? 'secondary' : 'ghost'}
          disabled={!affordable}
          title={
            affordable
              ? `Build a ${definition.label.toLowerCase()} for car ${carIndex + 1} at ${drawing.toFixed(1)} spec${
                  remaining === 0 ? ' — beyond the allowance, so it costs more' : ''
                }`
              : `Costs ${formatCurrency(cost, true)}; you have ${formatCurrency(team.budget, true)}.`
          }
          onClick={() => dispatch({ type: 'BUILD_PART', category, carIndex })}
          icon={<Hammer className="size-3" />}
        >
          Build
        </GameButton>
      </div>

      {spares.length > 0 && (
        <ul className="mt-1.5 grid gap-1">
          {spares.map((spare) => (
            <li
              key={spare.id}
              className="flex items-center gap-1.5 rounded border border-carbon-700 bg-carbon-950/40 px-1.5 py-1"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-chrome-400">
                shelf · {spare.spec.toFixed(1)} · {Math.round(spare.healthPct)}%
              </span>
              <button
                type="button"
                title={`Fit this to car ${carIndex + 1}`}
                onClick={() => dispatch({ type: 'FIT_PART', partId: spare.id, carIndex })}
                className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-neon-cyan transition-colors hover:bg-neon-cyan/20"
              >
                Fit
              </button>
              <button
                type="button"
                title="Scrap this spare"
                onClick={() => dispatch({ type: 'SCRAP_PART', partId: spare.id })}
                className="rounded border border-carbon-600 p-0.5 text-chrome-500 transition-colors hover:border-neon-red/50 hover:text-neon-red"
              >
                <Trash2 className="size-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------- one car ------------------------------- */

function CarGarage({
  carIndex,
  team,
  driver,
  group,
}: {
  carIndex: number;
  team: TeamSeasonState;
  driver: Driver | undefined;
  group: 'ALL' | keyof typeof GROUP_META;
}) {
  const { state, playerTeam } = useGame();
  if (!state || !playerTeam) return null;

  const wearFactor = driver ? driverWearFactor(state, driver.id) : 1;
  const stats = carStatsOf(team, carIndex);
  const rating = carRating(stats);

  const bays = ASSEMBLY_PARTS.filter(
    (category) => group === 'ALL' || PART_BY_ID.get(category)?.group === group,
  );

  const fitted = ASSEMBLY_PARTS.map((category) => fittedPart(team, category, carIndex)).filter(
    (part): part is BuiltPart => Boolean(part),
  );
  const dueSoon = fitted.filter((part) => weekendsLeft(part, wearFactor) <= 1).length;
  const behind = ASSEMBLY_PARTS.reduce((sum, category) => {
    const part = fittedPart(team, category, carIndex);
    if (!part) return sum;
    return sum + Math.max(0, partLevel(team, category) - part.spec * partHealthFactor(part.healthPct));
  }, 0);

  return (
    <Panel
      title={`Car ${carIndex + 1}`}
      icon={<Wrench className="size-3.5" />}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={dueSoon > 0 ? 'red' : 'neutral'} mono>
            {dueSoon > 0 ? `${dueSoon} due` : 'all healthy'}
          </Badge>
          <Badge tone="cyan" mono>
            {rating}
          </Badge>
        </div>
      }
    >
      {/* Whose car this is, and what that costs the parts on it. */}
      <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-carbon-600/70 bg-carbon-900/50 p-2.5">
        {driver ? (
          <>
            <DriverPortrait driver={driver} teamColor={playerTeam.color} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-chrome-100">
                {driver.firstName} {driver.lastName}
              </p>
              <p className="truncate font-mono text-[9.5px] text-chrome-500">
                #{driver.carNumber} · wears the car{' '}
                <span
                  style={{
                    color:
                      wearFactor > 1.08
                        ? 'var(--color-neon-red)'
                        : wearFactor < 0.94
                          ? 'var(--color-neon-lime)'
                          : 'var(--color-chrome-300)',
                  }}
                >
                  {wearFactor > 1.08 ? 'hard' : wearFactor < 0.94 ? 'gently' : 'normally'} (
                  {wearFactor.toFixed(2)}×)
                </span>
              </p>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-neon-amber">No driver in this seat.</p>
        )}
      </div>

      {behind >= 1 && (
        <p className="mb-2.5 flex items-center gap-1.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.05] px-2 py-1.5 text-[10px] text-neon-amber">
          <TrendingUp className="size-3 shrink-0" />
          {behind.toFixed(1)} levels behind the drawings, across wear and parts never rebuilt.
        </p>
      )}

      <ul className="grid gap-1.5">
        {bays.map((category) => (
          <PartBay
            key={category}
            category={category}
            carIndex={carIndex}
            team={team}
            wearFactor={wearFactor}
          />
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------------------- the engine pool -------------------------- */

function PowerUnitPool() {
  const { state, playerTeam, dispatch } = useGame();
  if (!state || !playerTeam) return null;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const cost = powerUnitCost(team);
  const fitted = fittedUnit(team);
  const builtThisSeason = team.powerUnits.filter(
    (unit) => unit.builtInSeason === state.season,
  ).length;
  const penalty = enginePenaltyPlaces(team, state.season);
  const beyond = builtThisSeason >= ENGINE_ALLOCATION;
  const affordable = team.budget >= cost;

  const drawing =
    POWER_UNIT_PARTS.reduce((sum, category) => sum + partLevel(team, category), 0) /
    POWER_UNIT_PARTS.length;

  return (
    <Panel
      title="Power Unit"
      icon={<Battery className="size-3.5" />}
      actions={
        <Badge tone={beyond ? 'red' : 'neutral'} mono>
          {builtThisSeason}/{ENGINE_ALLOCATION} this season
        </Badge>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        Five parts in one object, and the one component both cars share — the allocation is the
        team's. Beyond {ENGINE_ALLOCATION} in a season it is still legal, it just costs a
        Saturday.
      </p>

      {penalty > 0 && (
        <p className="mb-3 flex items-center gap-1.5 rounded-md border border-neon-red/40 bg-neon-red/8 px-2.5 py-2 text-[11px] font-bold text-neon-red">
          <AlertTriangle className="size-3.5" />
          {penalty}-place grid penalty pending at the next race.
        </p>
      )}

      <ul className="grid gap-2">
        {team.powerUnits.map((unit) => {
          const isFitted = unit.id === team.fittedPowerUnitId;
          const spent = unit.status === 'RETIRED';
          return (
            <li
              key={unit.id}
              className={cx(
                'rounded-lg border p-2.5',
                isFitted
                  ? 'border-neon-cyan/40 bg-neon-cyan/[0.06]'
                  : spent
                    ? 'border-carbon-700 bg-carbon-900/30 opacity-70'
                    : 'border-carbon-600/70 bg-carbon-900/40',
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold text-chrome-100">
                  Spec {unitSpecRating(unit)} · {unit.builtInSeason}
                </span>
                <Badge tone={isFitted ? 'cyan' : spent ? 'red' : 'neutral'} mono>
                  {isFitted ? 'In the car' : spent ? 'Scrapped' : 'Spare'}
                </Badge>
              </div>
              <HealthBar healthPct={unit.healthPct} />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[9.5px] text-chrome-500">
                  {Math.round(unit.mileageLaps)} laps · {Math.round(unit.healthPct)}% life
                </span>
                {!isFitted && !spent && (
                  <GameButton
                    size="sm"
                    variant="secondary"
                    onClick={() => dispatch({ type: 'FIT_POWER_UNIT', unitId: unit.id })}
                  >
                    Fit
                  </GameButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex-1 font-mono text-[10px] text-chrome-500">
          new one: {drawing.toFixed(1)} spec · {formatCurrency(cost, true)}
          {beyond && <span className="ml-1 text-neon-amber">+ grid penalty</span>}
        </span>
        <GameButton
          size="sm"
          disabled={!affordable}
          title={
            affordable
              ? beyond
                ? 'Beyond the allocation — legal, but it costs grid places.'
                : 'Build a fresh power unit to the current drawings.'
              : `Costs ${formatCurrency(cost, true)}; you have ${formatCurrency(team.budget, true)}.`
          }
          onClick={() => dispatch({ type: 'BUILD_POWER_UNIT' })}
          icon={<Hammer className="size-3" />}
        >
          Build unit
        </GameButton>
      </div>

      {fitted && (
        <p className="mt-2 font-mono text-[10px] text-chrome-600">
          Fitted unit is {Math.round(fitted.healthPct)}% — a tired one gives back less power and
          strands the car more often.
        </p>
      )}
    </Panel>
  );
}

/* --------------------------------- view -------------------------------- */

type GroupFilter = 'ALL' | keyof typeof GROUP_META;

export function CarDevView() {
  const { state, playerTeam, playerDrivers } = useGame();
  const [group, setGroup] = useState<GroupFilter>('ALL');

  const field = useMemo(() => {
    if (!state) return [];
    return [...state.teams]
      .map((team) => ({ team, rating: carRating(team.car) }))
      .sort((a, b) => b.rating - a.rating);
  }, [state]);

  if (!state || !playerTeam) return null;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const spares = (team.builtParts ?? []).filter((part) => part.status === 'POOL').length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <Panel
          title="The Garage — Two Cars, One Drawing Office"
          icon={<Boxes className="size-3.5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {spares > 0 && (
                <Badge tone="neutral" mono>
                  {spares} on the shelf
                </Badge>
              )}
              <SegmentedControl
                name="garage-group"
                size="sm"
                value={group}
                onChange={setGroup}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'AERODYNAMICS', label: 'Aero' },
                  { value: 'MECHANICAL', label: 'Mech' },
                ]}
              />
            </div>
          }
        >
          <p className="text-[11px] leading-relaxed text-chrome-500">
            R&D raises a drawing for the whole team; everything after it belongs to one car. Each
            car carries its own parts, worn at the rate its own driver sets — so the same wing
            can be finished on one side of the garage and half-fresh on the other. The build
            allowance is the team's, which is what makes{' '}
            <span className="text-chrome-300">which car gets the next one</span> a decision.
            Spares are shared: build one, fit it wherever it is needed most.
          </p>
        </Panel>

        <div className="grid gap-4 2xl:grid-cols-2">
          {Array.from({ length: CARS_PER_TEAM }, (_, carIndex) => (
            <CarGarage
              key={carIndex}
              carIndex={carIndex}
              team={team}
              driver={playerDrivers[carIndex]}
              group={group}
            />
          ))}
        </div>

        {/* Field comparison, now with what every rival is working towards. */}
        <Panel title="Where the Car Sits" icon={<Gauge className="size-3.5" />}>
          <p className="mb-3 text-[11px] text-chrome-500">
            Every constructor's package on the same scale — the average of its two cars — and the
            development direction each one has committed to this season.
          </p>
          <ul className="space-y-1">
            {field.map(({ team: entry, rating }, index) => {
              const isPlayer = entry.teamId === playerTeam.id;
              const meta = gridTeamOf(entry.teamId);
              const philosophy = isPlayer ? entry.philosophy : philosophyFor(state, entry);

              return (
                <li
                  key={entry.teamId}
                  className={cx(
                    'flex items-center gap-2 rounded-md px-2 py-1.5',
                    isPlayer ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/60',
                  )}
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] text-chrome-500">
                    {index + 1}
                  </span>
                  <span
                    className="h-4 w-[3px] shrink-0 rounded-full"
                    style={{ background: meta.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-chrome-200">
                      {meta.name}
                    </span>
                    <span
                      className="block truncate text-[9.5px] text-chrome-500"
                      title={PHILOSOPHY_BLURB[philosophy]}
                    >
                      {PHILOSOPHY_LABEL[philosophy]}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-bold text-chrome-100">
                    {rating}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid content-start gap-4">
        <PowerUnitPool />

        <Panel title="Build Allowances" icon={<Boxes className="size-3.5" />}>
          <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
            What the regulations let you make this season, counted across{' '}
            <span className="text-chrome-300">both cars</span>. Going past an allowance is legal
            and costs half as much again per part — the budget is the real limit.
          </p>
          <ul className="grid gap-1.5">
            {ASSEMBLY_PARTS.map((category) => {
              const definition = PART_BY_ID.get(category)!;
              const left = buildsRemaining(team, category, state.season);
              const pct = (left / definition.buildAllowance) * 100;
              return (
                <li key={category} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-chrome-300">
                    {definition.label}
                  </span>
                  <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-carbon-700">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: left === 0 ? 'var(--color-neon-red)' : 'var(--color-neon-cyan)',
                      }}
                    />
                  </span>
                  <span
                    className={cx(
                      'w-9 shrink-0 text-right font-mono text-[10px] font-bold',
                      left === 0 ? 'text-neon-red' : 'text-chrome-300',
                    )}
                  >
                    {left}/{definition.buildAllowance}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="How A Car Gets Built" icon={<Cog className="size-3.5" />}>
          <ol className="grid gap-2.5">
            {[
              {
                n: 1,
                title: 'Upgrade in R&D',
                body: 'Commission a programme on a part. Weeks later the drawing moves up — for the team, so both cars can be built to it.',
              },
              {
                n: 2,
                title: 'Build for a car',
                body: 'The factory makes one part to that drawing, for the car you chose. Its spec is frozen at that moment.',
              },
              {
                n: 3,
                title: 'Fit it',
                body: 'Bolt it on. What comes off goes on the shelf and can be fitted to either car later.',
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neon-cyan/15 font-mono text-[10px] font-bold text-neon-cyan">
                  {step.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-chrome-100">{step.title}</span>
                  <span className="block text-[10.5px] leading-relaxed text-chrome-500">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Car Statistics" icon={<Wind className="size-3.5" />}>
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <span className="text-[9px] tracking-widest text-chrome-600 uppercase">Stat</span>
            {Array.from({ length: CARS_PER_TEAM }, (_, index) => (
              <span
                key={index}
                className="w-9 text-right text-[9px] tracking-widest text-chrome-600 uppercase"
              >
                Car {index + 1}
              </span>
            ))}
          </div>
          <ul className="grid gap-1.5">
            {(
              [
                ['Pace', 'pace'],
                ['Aerodynamics', 'aero'],
                ['Power unit', 'powerUnit'],
                ['Energy systems', 'electrical'],
                ['Reliability', 'reliability'],
                ['Brakes', 'brakes'],
                ['Suspension', 'suspension'],
                ['Cooling', 'cooling'],
              ] as const
            ).map(([label, key]) => (
              <li
                key={label}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2"
              >
                <span className="min-w-0 truncate text-[10.5px] text-chrome-300">{label}</span>
                {Array.from({ length: CARS_PER_TEAM }, (_, carIndex) => {
                  const value = carStatsOf(team, carIndex)[key];
                  return (
                    <span
                      key={carIndex}
                      className="w-9 text-right font-mono text-[10.5px] font-bold"
                      style={{ color: levelTone(value) }}
                    >
                      {Math.round(value)}
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10.5px] leading-relaxed text-chrome-500">
            Two columns because they are two cars. Each is derived entirely from what is bolted
            to it — a worn part shows up here before it shows up on a Sunday.
          </p>
        </Panel>
      </div>
    </div>
  );
}
