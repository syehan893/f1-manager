import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Battery,
  Car,
  Cog,
  Gauge,
  Timer,
  TrendingUp,
  Wind,
  Wrench,
  X,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { carRating, gridTeamOf } from '@/data/grid2026';
import {
  ENGINE_ALLOCATION,
  PARTS,
  POWER_UNIT_PARTS,
  enginePenaltyPlaces,
  fittedUnit,
  powerUnitCost,
  unitSpecRating,
} from '@/game/carModel';
import {
  DEVELOPMENT_INTENSITY,
  canDevelop,
  developmentCost,
  developmentGain,
  developmentWeeks,
  partLevel,
} from '@/game/partDevelopment';
import type { DevelopmentIntensity } from '@/game/partDevelopment';
import { buildTimeReduction } from '@/game/facilities';
import { staffBuildTimeReduction } from '@/game/staffing';
import { PHILOSOPHY_BLURB, PHILOSOPHY_LABEL, philosophyFor } from '@/game/aiDevelopment';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { PartState } from '@/game/types';

/* =====================================================================
 * Car development.
 *
 * The car is fourteen parts, and this is where they are worked on. Money
 * no longer buys a statistic directly — it commissions a programme on a
 * specific part, that programme takes weeks, and when it lands the part
 * moves and the statistics follow.
 *
 * The screen is built to make the trade legible: what each part is worth
 * to which statistic, what a step costs at its current level, how long it
 * will take, and what your buildings and your people are doing to that
 * figure.
 * ===================================================================== */

const GROUP_META = {
  POWER_UNIT: { label: 'Power Unit', icon: Battery, tone: 'var(--color-neon-red)' },
  AERODYNAMICS: { label: 'Aerodynamics', icon: Wind, tone: 'var(--color-neon-cyan)' },
  MECHANICAL: { label: 'Mechanical', icon: Cog, tone: 'var(--color-neon-violet)' },
} as const;

function levelTone(level: number): string {
  if (level >= 92) return 'var(--color-neon-lime)';
  if (level >= 80) return 'var(--color-neon-cyan)';
  if (level >= 68) return 'var(--color-neon-amber)';
  return 'var(--color-neon-red)';
}

/* ------------------------------- one part ------------------------------ */

function PartRow({
  part,
  intensity,
}: {
  part: PartState;
  intensity: DevelopmentIntensity;
}) {
  const { state, playerTeam, dispatch } = useGame();
  if (!state || !playerTeam) return null;

  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const definition = PARTS.find((entry) => entry.id === part.category)!;
  const Icon = GROUP_META[definition.group].icon;

  const project = team.development.find((entry) => entry.category === part.category);
  const level = partLevel(team, part.category);
  const cost = developmentCost(part.category, level, intensity);
  const gain = developmentGain(state, part.category, level, intensity);
  const weeks = developmentWeeks(
    part.category,
    intensity,
    buildTimeReduction(state) + staffBuildTimeReduction(state),
  );
  const check = canDevelop(team, part.category, intensity);
  const tone = levelTone(level);

  return (
    <li className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          className="size-3.5 shrink-0"
          style={{ color: GROUP_META[definition.group].tone }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-chrome-100">{definition.label}</p>
          <p className="truncate text-[10px] text-chrome-500">{definition.effect}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[16px] font-bold" style={{ color: tone }}>
            {level.toFixed(1)}
          </span>
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${level}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
      </div>

      {project ? (
        /* In build: show what is coming and when, and let it be stopped. */
        <div className="mt-2.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.05] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-neon-amber">
              <Timer className="size-3" />
              In build · +{project.gain.toFixed(1)} in {project.weeksRemaining}w
            </span>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'CANCEL_PART_DEVELOPMENT', projectId: project.id })
              }
              title="Cancel this programme. Work already done is not refunded."
              className="flex items-center gap-0.5 rounded border border-carbon-600 px-1.5 py-0.5 font-mono text-[9px] text-chrome-400 transition-colors hover:border-neon-red/50 hover:text-neon-red"
            >
              <X className="size-2.5" />
              Stop
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-carbon-700">
            <div
              className="h-full rounded-full bg-neon-amber"
              style={{
                width: `${((project.totalWeeks - project.weeksRemaining) / project.totalWeeks) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="flex-1 font-mono text-[10px] text-chrome-500">
            +{gain.toFixed(1)} · {weeks}w · {formatCurrency(cost, true)}
          </span>
          <GameButton
            size="sm"
            variant={check.ok ? 'secondary' : 'ghost'}
            disabled={!check.ok}
            title={check.reason ?? `Commission ${definition.label} development`}
            onClick={() =>
              dispatch({ type: 'DEVELOP_PART', category: part.category, intensity })
            }
          >
            Commission
          </GameButton>
        </div>
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

  const usedThisSeason = team.powerUnits.filter(
    (unit) => unit.builtInSeason === state.season,
  ).length;
  const penalty = enginePenaltyPlaces(team, state.season);
  const cost = powerUnitCost(team);
  const current = fittedUnit(team);

  return (
    <Panel
      title="Power Units"
      icon={<Battery className="size-3.5" />}
      actions={
        <Badge tone={usedThisSeason > ENGINE_ALLOCATION ? 'red' : 'cyan'} mono>
          {usedThisSeason}/{ENGINE_ALLOCATION} used
        </Badge>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        {ENGINE_ALLOCATION} units per season before penalties. Every unit is built to the power
        unit spec of the day and never improves afterwards, so a fresh engine late in a season
        is also a better one — mileage costs power, energy and reliability.
      </p>

      {penalty > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-neon-red/40 bg-neon-red/[0.07] p-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-neon-red" />
          <p className="text-[10px] leading-relaxed text-neon-red">
            Over the allocation — a {penalty}-place grid penalty applies at the next race.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {team.powerUnits
          .filter((unit) => unit.status !== 'RETIRED')
          .map((unit) => {
            const isFitted = unit.id === team.fittedPowerUnitId;
            const healthTone =
              unit.healthPct >= 60
                ? 'var(--color-neon-lime)'
                : unit.healthPct >= 30
                  ? 'var(--color-neon-amber)'
                  : 'var(--color-neon-red)';

            return (
              <li
                key={unit.id}
                className={cx(
                  'rounded-lg border p-2.5',
                  isFitted
                    ? 'border-neon-cyan/40 bg-neon-cyan/[0.05]'
                    : 'border-carbon-600/70 bg-carbon-900/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-chrome-100">
                      Spec {unitSpecRating(unit)} · built {unit.builtInSeason}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-chrome-500">
                      {Math.round(unit.mileageLaps)} laps run
                    </span>
                  </span>
                  {isFitted ? (
                    <Badge tone="cyan" mono>
                      Fitted
                    </Badge>
                  ) : (
                    <GameButton
                      size="sm"
                      variant="secondary"
                      onClick={() => dispatch({ type: 'FIT_POWER_UNIT', unitId: unit.id })}
                    >
                      Fit
                    </GameButton>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-carbon-700">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${unit.healthPct}%`, background: healthTone }}
                    />
                  </div>
                  <span
                    className="w-10 shrink-0 text-right font-mono text-[10px] font-bold"
                    style={{ color: healthTone }}
                  >
                    {Math.round(unit.healthPct)}%
                  </span>
                </div>
              </li>
            );
          })}
      </ul>

      <GameButton
        size="sm"
        className="mt-3 w-full"
        variant="secondary"
        disabled={team.budget < cost}
        title={
          usedThisSeason >= ENGINE_ALLOCATION
            ? `This would be unit ${usedThisSeason + 1} — a further ${5} grid places.`
            : 'Build a fresh unit to the current power unit spec.'
        }
        onClick={() => dispatch({ type: 'BUILD_POWER_UNIT' })}
        icon={<Wrench className="size-3" />}
      >
        Build fresh unit · {formatCurrency(cost, true)}
      </GameButton>

      {current && (
        <p className="mt-2 text-[10px] leading-relaxed text-chrome-500">
          The unit in the car is at {Math.round(current.healthPct)}% health, which is currently
          worth {Math.round((1 - (0.86 + (current.healthPct / 100) * 0.14)) * 100)}% off its
          paper power figure.
        </p>
      )}
    </Panel>
  );
}

/* -------------------------------- screen -------------------------------- */

export function CarDevView() {
  const { state, playerTeam, dispatch } = useGame();
  const [intensity, setIntensity] = useState<DevelopmentIntensity>(2);
  const [group, setGroup] = useState<'ALL' | keyof typeof GROUP_META>('ALL');

  const field = useMemo(() => {
    if (!state) return [];
    return [...state.teams]
      .map((team) => ({ team, rating: carRating(team.car) }))
      .sort((a, b) => b.rating - a.rating);
  }, [state]);

  if (!state || !playerTeam) return null;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const visible =
    group === 'ALL' ? team.parts : team.parts.filter((part) => {
      const definition = PARTS.find((entry) => entry.id === part.category);
      return definition?.group === group;
    });

  const committed = team.development.reduce((sum, project) => sum + project.cost, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <Panel
          title="Development Programme"
          icon={<Car className="size-3.5" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                name="dev-group"
                size="sm"
                value={group}
                onChange={setGroup}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'POWER_UNIT', label: 'PU' },
                  { value: 'AERODYNAMICS', label: 'Aero' },
                  { value: 'MECHANICAL', label: 'Mech' },
                ]}
              />
              <SegmentedControl
                name="dev-intensity"
                size="sm"
                value={String(intensity)}
                onChange={(value) => setIntensity(Number(value) as DevelopmentIntensity)}
                options={[
                  { value: '1', label: 'Steady' },
                  { value: '2', label: 'Normal' },
                  { value: '3', label: 'Max' },
                ]}
              />
            </div>
          }
        >
          <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
            Money commissions work on a part; the part is what moves the statistics.{' '}
            <span className="text-chrome-300">
              {DEVELOPMENT_INTENSITY[intensity].label}
            </span>{' '}
            intensity — {intensity === 1 && 'cheapest, and the slowest to arrive.'}
            {intensity === 2 && 'the standard programme.'}
            {intensity === 3 && 'costs far more, arrives sooner, and gains more.'} A part that
            is already strong costs progressively more to move.
          </p>

          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((part) => (
              <PartRow key={part.category} part={part} intensity={intensity} />
            ))}
          </ul>
        </Panel>

        {/* Field comparison, now with what every rival is working towards. */}
        <Panel title="Where the Car Sits" icon={<Gauge className="size-3.5" />}>
          <p className="mb-3 text-[11px] text-chrome-500">
            Every constructor's package on the same scale, and the development direction each
            one has committed to this season.
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
                    <span
                      className={cx(
                        'block truncate text-[11px]',
                        isPlayer ? 'font-bold text-neon-cyan' : 'text-chrome-200',
                      )}
                    >
                      {meta.name}
                    </span>
                    <span className="block truncate text-[9px] text-chrome-600">
                      {PHILOSOPHY_LABEL[philosophy]}
                      {entry.development.length > 0
                        ? ` · ${entry.development.length} in build`
                        : ''}
                    </span>
                  </span>
                  <span
                    className="w-8 shrink-0 text-right font-mono text-[12px] font-bold"
                    style={{ color: isPlayer ? 'var(--color-neon-cyan)' : levelTone(rating) }}
                  >
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

        <Panel title="Programme Status" icon={<TrendingUp className="size-3.5" />}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
              <p className="text-[9px] tracking-widest text-chrome-600 uppercase">In build</p>
              <p className="mt-1 font-mono text-[15px] font-bold text-neon-amber">
                {team.development.length}
              </p>
            </div>
            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
              <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Committed</p>
              <p className="mt-1 font-mono text-[15px] font-bold text-neon-violet">
                {formatCurrency(committed, true)}
              </p>
            </div>
          </div>

          {team.development.length === 0 ? (
            <p className="mt-2.5 text-[10px] leading-relaxed text-chrome-500">
              Nothing in build. The car will not improve on its own, and every rival is
              spending.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1">
              {[...team.development]
                .sort((a, b) => a.weeksRemaining - b.weeksRemaining)
                .map((project) => (
                  <li
                    key={project.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-carbon-800/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] text-chrome-300">
                      {PARTS.find((p) => p.id === project.category)?.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-neon-lime">
                      +{project.gain.toFixed(1)}
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-[10px] text-neon-amber">
                      {project.weeksRemaining}w
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <Panel title="Your Direction" icon={<Cog className="size-3.5" />}>
          <p className="mb-2.5 text-[11px] leading-relaxed text-chrome-500">
            {PHILOSOPHY_BLURB[team.philosophy]}
          </p>
          <div className="grid gap-1.5">
            {(
              ['BALANCED', 'AERO_LED', 'POWER_LED', 'RELIABILITY_FIRST', 'IN_SEASON_PUSH'] as const
            ).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => dispatch({ type: 'SET_PHILOSOPHY', philosophy: option })}
                className={cx(
                  'rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors',
                  team.philosophy === option
                    ? 'border-neon-cyan/45 bg-neon-cyan/8 text-neon-cyan'
                    : 'border-carbon-600 bg-carbon-900/40 text-chrome-300 hover:border-carbon-500',
                )}
              >
                {PHILOSOPHY_LABEL[option]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-chrome-600">
            Your own direction is a note to yourself — you commission every programme by hand.
            Rival teams follow theirs automatically.
          </p>
        </Panel>

        <Panel title="Power Unit Parts" icon={<Battery className="size-3.5" />}>
          <p className="mb-2 text-[11px] leading-relaxed text-chrome-500">
            These five are what a power unit is built from. Developing them improves the{' '}
            <span className="text-chrome-300">next</span> unit you build, not the one already
            in the car.
          </p>
          <ul className="space-y-1">
            {POWER_UNIT_PARTS.map((category) => {
              const level = partLevel(team, category);
              const current = fittedUnit(team);
              const built = current?.spec[category as keyof typeof current.spec] ?? level;
              const behind = level - built;

              return (
                <li
                  key={category}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-carbon-800/60"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px] text-chrome-300">
                    {PARTS.find((p) => p.id === category)?.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-chrome-500">
                    fitted {built.toFixed(0)}
                  </span>
                  <span
                    className="w-10 shrink-0 text-right font-mono text-[11px] font-bold"
                    style={{ color: behind > 0.5 ? 'var(--color-neon-amber)' : levelTone(level) }}
                  >
                    {level.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
