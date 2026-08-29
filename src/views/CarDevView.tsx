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
import { carRating, gridTeamOf } from '@/data/grid2026';
import {
  ASSEMBLY_PARTS,
  ENGINE_ALLOCATION,
  PART_BY_ID,
  POWER_UNIT_PARTS,
  buildsRemaining,
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
import { PHILOSOPHY_BLURB, PHILOSOPHY_LABEL, philosophyFor } from '@/game/aiDevelopment';
import { GROUP_META, levelTone } from '@/lib/partStyle';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { BuiltPart, PartCategory } from '@/game/types';

/* =====================================================================
 * The garage — steps two and three.
 *
 * R&D raises the drawing. This is where a drawing becomes an object and
 * an object goes onto the car:
 *
 *   build   the factory makes one part to the current drawing, and its
 *           spec is frozen there — later development improves the next
 *           one, never this one
 *   fit     the mechanics bolt it on; whatever came off goes back on the
 *           shelf, or in the bin if it was finished
 *
 * Parts wear. A front wing is gone in three weekends and a chassis lasts
 * a season, which is what turns the build allowance into a plan: spend
 * it early on a car that is not ready yet, and there is nothing left in
 * the budget when the upgrade you were waiting for finally lands.
 * ===================================================================== */

/** Health is the number the player actually reads on this screen. */
function healthTone(healthPct: number): string {
  if (healthPct >= 65) return 'var(--color-neon-lime)';
  if (healthPct >= 35) return 'var(--color-neon-amber)';
  return 'var(--color-neon-red)';
}

function HealthBar({ healthPct }: { healthPct: number }) {
  const tone = healthTone(healthPct);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
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

/** One spare on the shelf, with the two things you can do to it. */
function SpareRow({ part }: { part: BuiltPart }) {
  const { dispatch } = useGame();
  return (
    <li className="flex items-center gap-2 rounded-md border border-carbon-700 bg-carbon-950/40 px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] text-chrome-300">
          spec {part.spec.toFixed(1)} · {Math.round(part.healthPct)}% life
        </span>
        <span className="block font-mono text-[9px] text-chrome-600">
          built {part.builtInSeason} · {Math.round(part.mileageLaps)} laps
        </span>
      </span>
      <GameButton
        size="sm"
        variant="secondary"
        onClick={() => dispatch({ type: 'FIT_PART', partId: part.id })}
      >
        Fit
      </GameButton>
      <button
        type="button"
        title="Scrap this spare"
        onClick={() => dispatch({ type: 'SCRAP_PART', partId: part.id })}
        className="rounded border border-carbon-600 p-1 text-chrome-500 transition-colors hover:border-neon-red/50 hover:text-neon-red"
      >
        <Trash2 className="size-3" />
      </button>
    </li>
  );
}

/** One category: what is on the car, what is on the shelf, what a new one costs. */
function GarageBay({ category }: { category: PartCategory }) {
  const { state, playerTeam, dispatch } = useGame();
  if (!state || !playerTeam) return null;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const definition = PART_BY_ID.get(category)!;
  const Icon = GROUP_META[definition.group].icon;

  const drawing = partLevel(team, category);
  const fitted = fittedPart(team, category);
  const spares = sparePartsOf(team, category);
  const remaining = buildsRemaining(team, category, state.season);
  const cost = partBuildCost(team, category, state.season);
  const affordable = team.budget >= cost;

  /* The part on the car is worth its spec faded by wear; the drawing is
   * what a new one would be worth. The gap between them is the case for
   * building, and it is the only number on this card that matters. */
  const onCar = fitted ? fitted.spec * partHealthFactor(fitted.healthPct) : drawing;
  const upside = drawing - onCar;

  return (
    <li className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-3.5 shrink-0" style={{ color: GROUP_META[definition.group].tone }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-chrome-100">{definition.label}</p>
          <p className="truncate text-[10px] text-chrome-500">
            lasts {definition.lifeRounds} weekend{definition.lifeRounds === 1 ? '' : 's'} ·{' '}
            {remaining}/{definition.buildAllowance} builds left this season
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span
            className="block font-mono text-[16px] font-bold"
            style={{ color: levelTone(onCar) }}
          >
            {onCar.toFixed(1)}
          </span>
          <span className="block text-[8px] tracking-widest text-chrome-600 uppercase">
            on the car
          </span>
        </span>
      </div>

      {fitted ? (
        <div className="mt-2.5 rounded-md border border-carbon-600/70 bg-carbon-800/40 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-chrome-400">
              spec {fitted.spec.toFixed(1)} · {Math.round(fitted.mileageLaps)} laps
            </span>
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color: healthTone(fitted.healthPct) }}
            >
              {Math.round(fitted.healthPct)}% life
            </span>
          </div>
          <HealthBar healthPct={fitted.healthPct} />
          {fitted.healthPct <= 0 && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-neon-red">
              <AlertTriangle className="size-3" />
              Finished — it is costing you every lap it stays on.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.05] p-2 text-[10px] text-neon-amber">
          Nothing built for this yet — the car is running the drawing.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="flex-1 font-mono text-[10px] text-chrome-500">
          new one: {drawing.toFixed(1)} spec · {formatCurrency(cost, true)}
          {upside >= 0.5 && (
            <span className="ml-1 text-neon-lime">+{upside.toFixed(1)}</span>
          )}
          {remaining === 0 && <span className="ml-1 text-neon-amber">rushed</span>}
        </span>
        <GameButton
          size="sm"
          variant={affordable ? 'secondary' : 'ghost'}
          disabled={!affordable}
          title={
            affordable
              ? `Build a ${definition.label.toLowerCase()} at ${drawing.toFixed(1)} spec${
                  remaining === 0 ? ' — beyond the allowance, so it costs more' : ''
                }`
              : `Costs ${formatCurrency(cost, true)}; you have ${formatCurrency(team.budget, true)}.`
          }
          onClick={() => dispatch({ type: 'BUILD_PART', category })}
          icon={<Hammer className="size-3" />}
        >
          Build
        </GameButton>
      </div>

      {spares.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          <li className="text-[8.5px] tracking-widest text-chrome-600 uppercase">
            On the shelf ({spares.length})
          </li>
          {spares.map((spare) => (
            <SpareRow key={spare.id} part={spare} />
          ))}
        </ul>
      )}
    </li>
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

  /* The unit is five parts at once, so its spec is the average of the
   * five drawings — which is what a new one would be built to. */
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
        Five parts in one object, built to the drawings as they stand. Beyond{' '}
        {ENGINE_ALLOCATION} in a season it is still legal — it just costs a Saturday.
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
  const { state, playerTeam } = useGame();
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

  const bays = ASSEMBLY_PARTS.filter(
    (category) => group === 'ALL' || PART_BY_ID.get(category)?.group === group,
  );

  const fittedParts = (team.builtParts ?? []).filter((part) => part.status === 'FITTED');
  const worn = fittedParts.filter((part) => part.healthPct <= 25).length;
  const spares = (team.builtParts ?? []).filter((part) => part.status === 'POOL').length;

  /* What the car is giving away to wear right now: the drawings it could
   * be running against what is actually bolted to it. */
  const behind = ASSEMBLY_PARTS.reduce((sum, category) => {
    const fitted = fittedPart(team, category);
    if (!fitted) return sum;
    const gap = partLevel(team, category) - fitted.spec * partHealthFactor(fitted.healthPct);
    return sum + Math.max(0, gap);
  }, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <Panel
          title="The Garage — Steps 2 & 3: Build, Then Fit"
          icon={<Wrench className="size-3.5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {worn > 0 && (
                <Badge tone="red" mono>
                  {worn} nearly gone
                </Badge>
              )}
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
          <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
            Every part is built to the drawing as it stands today, and its spec is frozen there —
            developing the floor next month improves the next floor, not this one. Parts wear
            out, so the car has to be rebuilt through the season, and each rebuild is a chance to
            put whatever R&D has landed onto the car.
          </p>

          {behind >= 1 && (
            <p className="mb-3 flex items-center gap-1.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.05] px-2.5 py-2 text-[11px] text-neon-amber">
              <TrendingUp className="size-3.5 shrink-0" />
              The car is {behind.toFixed(1)} levels behind its own drawings, across wear and
              parts never rebuilt. That is what a build programme buys back.
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            {bays.map((category) => (
              <GarageBay key={category} category={category} />
            ))}
          </ul>
        </Panel>

        {/* Field comparison, now with what every rival is working towards. */}
        <Panel title="Where the Car Sits" icon={<Gauge className="size-3.5" />}>
          <p className="mb-3 text-[11px] text-chrome-500">
            Every constructor's package on the same scale, and the development direction each one
            has committed to this season.
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
            What the regulations let you make this season. Going past an allowance is legal and
            costs half as much again per part — but the budget is the real limit.
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
                body: 'Commission a programme on a part. Weeks later the drawing for it moves up. The car does not change.',
              },
              {
                n: 2,
                title: 'Build here',
                body: 'The factory makes one part to that drawing. Its spec is frozen at the moment it is built.',
              },
              {
                n: 3,
                title: 'Fit it',
                body: 'Bolt it on. Whatever comes off goes back on the shelf, and the car statistics move.',
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neon-cyan/15 font-mono text-[10px] font-bold text-neon-cyan">
                  {step.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-chrome-100">
                    {step.title}
                  </span>
                  <span className="block text-[10.5px] leading-relaxed text-chrome-500">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Car Statistics" icon={<Wind className="size-3.5" />}>
          <ul className="grid gap-1.5">
            {(
              [
                ['Pace', team.car.pace],
                ['Aerodynamics', team.car.aero],
                ['Power unit', team.car.powerUnit],
                ['Energy systems', team.car.electrical],
                ['Reliability', team.car.reliability],
                ['Brakes', team.car.brakes],
                ['Suspension', team.car.suspension],
                ['Cooling', team.car.cooling],
              ] as const
            ).map(([label, value]) => (
              <li key={label} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-chrome-300">
                  {label}
                </span>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-carbon-700">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${value}%`, background: levelTone(value) }}
                  />
                </span>
                <span className="w-7 shrink-0 text-right font-mono text-[10px] font-bold text-chrome-100">
                  {Math.round(value)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10.5px] leading-relaxed text-chrome-500">
            Derived entirely from what is bolted to the car — never edited directly. A worn part
            shows up here before it shows up on a Sunday.
          </p>
        </Panel>
      </div>
    </div>
  );
}
