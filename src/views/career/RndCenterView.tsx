import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Ban,
  BatteryCharging,
  Check,
  ChevronsRight,
  Cpu,
  Fan,
  FlaskConical,
  Disc,
  Gauge,
  CircleDollarSign,
  Lock,
  Settings2,
  Snowflake,
  Waypoints,
  Timer,
  Wind,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { canStartUpgrade, variantStatus } from '@/game/machine';
import type { UpgradeStatus } from '@/game/machine';
import { upgradeCashCost } from '@/game/finance';
import { cx, formatCurrency } from '@/lib/format';
import { PartDevelopmentPanel } from '@/components/career/PartDevelopmentPanel';
import { useGame } from '@/state/gameContext';
import type { GameState } from '@/game/types';
import type {
  ComponentCategory,
  ComponentGroup,
  ComponentVariant,
  EngineComponent,
  PerformanceDelta,
} from '@/types/career';

const CATEGORY_ICON: Record<ComponentCategory, LucideIcon> = {
  ICE: Cpu,
  TURBOCHARGER: Fan,
  MGU_K: BatteryCharging,
  MGU_H: BatteryCharging,
  ENERGY_STORE: BatteryCharging,
  CHASSIS: Gauge,
  FRONT_WING: Wind,
  REAR_WING: Wind,
  FLOOR: Wind,
  ACTIVE_AERO: Waypoints,
  BRAKES: Disc,
  SUSPENSION: Settings2,
  GEARBOX: Settings2,
  COOLING: Snowflake,
};

const STATUS_STYLE: Record<
  UpgradeStatus,
  { ring: string; label: string; tone: 'lime' | 'amber' | 'cyan' | 'neutral' | 'red' }
> = {
  INSTALLED: { ring: 'border-neon-lime/50 bg-neon-lime/8', label: 'Fitted', tone: 'lime' },
  IN_DEVELOPMENT: { ring: 'border-neon-amber/50 bg-neon-amber/8', label: 'In build', tone: 'amber' },
  AVAILABLE: { ring: 'border-neon-cyan/40 bg-carbon-900/50', label: 'Available', tone: 'cyan' },
  LOCKED: { ring: 'border-carbon-700 bg-carbon-900/30', label: 'Locked', tone: 'neutral' },
  BLOCKED: { ring: 'border-neon-red/25 bg-carbon-900/30', label: 'Ruled out', tone: 'red' },
};

const DELTA_ROWS: Array<{ key: keyof PerformanceDelta; label: string; color: string }> = [
  { key: 'power', label: 'PWR', color: 'var(--color-neon-red)' },
  { key: 'aero', label: 'AERO', color: 'var(--color-neon-cyan)' },
  { key: 'reliability', label: 'REL', color: 'var(--color-neon-lime)' },
  { key: 'fuelEfficiency', label: 'ERS', color: 'var(--color-neon-amber)' },
  { key: 'driveability', label: 'DRIVE', color: 'var(--color-neon-violet)' },
];

/* ------------------------------- tech node ---------------------------- */

interface TechNodeProps {
  variant: ComponentVariant;
  state: GameState;
  onStart: (variantId: string) => void;
  onCancel: (variantId: string) => void;
  compact?: boolean;
}

function TechNode({ variant, state, onStart, onCancel, compact }: TechNodeProps) {
  const status = variantStatus(variant, state);
  const style = STATUS_STYLE[status];
  const check = canStartUpgrade(variant, state);
  const project = state.rnd.projects[variant.id];

  const progressPct = project
    ? ((variant.weeksRequired - project.weeksRemaining) / variant.weeksRequired) * 100
    : 0;

  const cashCost = upgradeCashCost(variant.tokenCost);
  const balance = state.teams.find((team) => team.teamId === state.playerTeamId)?.budget ?? 0;
  const affordable = balance >= cashCost;

  return (
    <motion.div
      layout
      className={cx(
        'flex h-full flex-col rounded-lg border p-2.5 transition-colors',
        style.ring,
        status === 'LOCKED' && 'opacity-55',
        status === 'BLOCKED' && 'opacity-45',
        compact && 'ml-0',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] leading-tight font-bold text-chrome-100">
            {variant.name}
          </p>
          <p className="mt-0.5 font-mono text-[8.5px] tracking-widest text-chrome-500 uppercase">
            T{variant.tier} · {variant.philosophy.replace('_', ' ')}
          </p>
        </div>
        <Badge tone={style.tone} className="shrink-0 !px-1.5">
          {status === 'INSTALLED' && <Check className="size-2.5" />}
          {status === 'LOCKED' && <Lock className="size-2.5" />}
          {status === 'BLOCKED' && <Ban className="size-2.5" />}
          {style.label}
        </Badge>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-chrome-500">
        {variant.description}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        {DELTA_ROWS.filter((row) => variant.delta[row.key] !== 0).map((row) => {
          const value = variant.delta[row.key];
          return (
            <span
              key={row.key}
              className="rounded px-1 py-px font-mono text-[9px] font-bold"
              style={{
                background: `color-mix(in srgb, ${row.color} 14%, transparent)`,
                color: value > 0 ? row.color : 'var(--color-neon-red)',
              }}
            >
              {row.label} {value > 0 ? '+' : ''}
              {value}
            </span>
          );
        })}
      </div>

      <div className="mt-auto pt-2.5">
        {/* Three currencies, and a build needs all three: regulated tokens,
            cash out of the same account as everything else, and weeks. */}
        <div className="mb-1.5 flex items-center justify-between gap-1 font-mono text-[9.5px] text-chrome-400">
          <span className="flex items-center gap-1">
            <FlaskConical className="size-3 text-neon-violet" />
            {variant.tokenCost}
          </span>
          <span
            className="flex items-center gap-1"
            style={{ color: affordable ? undefined : 'var(--color-neon-red)' }}
            title={`Build cost: ${formatCurrency(cashCost)}`}
          >
            <CircleDollarSign className="size-3 text-neon-lime" />
            {formatCurrency(cashCost, true)}
          </span>
          <span className="flex items-center gap-1">
            <Timer className="size-3 text-neon-amber" />
            {variant.weeksRequired}w
          </span>
        </div>

        {status === 'IN_DEVELOPMENT' && project ? (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
              <motion.div
                className="h-full rounded-full bg-neon-amber"
                initial={false}
                animate={{ width: `${progressPct}%` }}
                style={{ boxShadow: '0 0 8px var(--color-neon-amber)' }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] text-neon-amber">
                {project.weeksRemaining}w · ~{Math.ceil(project.weeksRemaining / 2)} round
                {Math.ceil(project.weeksRemaining / 2) === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => onCancel(variant.id)}
                className="flex items-center gap-0.5 rounded border border-carbon-600 px-1.5 py-0.5 font-mono text-[9px] text-chrome-400 transition-colors hover:border-neon-red/50 hover:text-neon-red"
              >
                <X className="size-2.5" /> Cancel
              </button>
            </div>
          </div>
        ) : status === 'INSTALLED' ? (
          <p className="rounded-md border border-neon-lime/30 bg-neon-lime/8 py-1.5 text-center font-mono text-[9.5px] font-bold tracking-wider text-neon-lime uppercase">
            Fitted to car
          </p>
        ) : (
          <button
            type="button"
            disabled={!check.ok}
            title={check.reason}
            onClick={() => onStart(variant.id)}
            className="w-full rounded-md border border-neon-cyan/40 bg-neon-cyan/10 py-1.5 text-[9.5px] font-bold tracking-widest text-neon-cyan uppercase transition-colors hover:bg-neon-cyan/20 disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/60 disabled:text-chrome-500"
          >
            {status === 'BLOCKED' ? 'Ruled out' : status === 'LOCKED' ? 'Locked' : 'Develop'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------ connectors ---------------------------- */

function SplitConnector({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 26 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <path
        d="M0 50 H13 M13 25 V75 M13 25 H26 M13 75 H26"
        fill="none"
        stroke={active ? 'var(--color-neon-cyan)' : 'var(--color-carbon-500)'}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={active ? 0.8 : 0.5}
      />
    </svg>
  );
}

function LineConnector({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 26 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <path
        d="M0 50 H26"
        fill="none"
        stroke={active ? 'var(--color-neon-cyan)' : 'var(--color-carbon-500)'}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={active ? 0.8 : 0.5}
      />
    </svg>
  );
}

/* ------------------------------ component ----------------------------- */

function ComponentTree({
  component,
  state,
  onStart,
  onCancel,
}: {
  component: EngineComponent;
  state: GameState;
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const Icon = CATEGORY_ICON[component.category];
  const [root, branchA, branchB, evoA, evoB, apexA, apexB] = component.variants;
  if (!root || !branchA || !branchB || !evoA || !evoB) return null;

  const rootDone = variantStatus(root, state) === 'INSTALLED';
  const aDone = variantStatus(branchA, state) === 'INSTALLED';
  const bDone = variantStatus(branchB, state) === 'INSTALLED';
  const aEvoDone = variantStatus(evoA, state) === 'INSTALLED';
  const bEvoDone = variantStatus(evoB, state) === 'INSTALLED';
  /** Deepest reachable tier — 3 for a legacy component, 4 with an apex. */
  const depth = apexA && apexB ? 4 : 3;

  const nodeProps = { state, onStart, onCancel };
  const fitted = component.variants.filter((v) => variantStatus(v, state) === 'INSTALLED').length;

  return (
    <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/30 p-3">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-carbon-700 text-neon-cyan">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-chrome-100">{component.name}</p>
          <p className="truncate text-[10px] text-chrome-500">{component.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[13px] font-bold text-chrome-200">{component.baseRating}</p>
          <p className="font-mono text-[9px] text-chrome-500">
            {fitted}/{depth} fitted
          </p>
        </div>
      </div>

      {/* Root splits into two philosophies, each of which runs three deep.
          The grid is laid out so the two branches read as parallel rows. */}
      <div className="hidden grid-cols-[minmax(140px,1fr)_24px_minmax(150px,1fr)_24px_minmax(150px,1fr)_24px_minmax(150px,1fr)] gap-y-2.5 xl:grid">
        <div className="row-span-2 self-center">
          <TechNode variant={root} {...nodeProps} />
        </div>
        <div className="row-span-2">
          <SplitConnector active={rootDone} />
        </div>

        <TechNode variant={branchA} {...nodeProps} />
        <LineConnector active={aDone} />
        <TechNode variant={evoA} {...nodeProps} />
        {apexA ? <LineConnector active={aEvoDone} /> : <span />}
        {apexA ? <TechNode variant={apexA} {...nodeProps} /> : <span />}

        <TechNode variant={branchB} {...nodeProps} />
        <LineConnector active={bDone} />
        <TechNode variant={evoB} {...nodeProps} />
        {apexB ? <LineConnector active={bEvoDone} /> : <span />}
        {apexB ? <TechNode variant={apexB} {...nodeProps} /> : <span />}
      </div>

      <div className="space-y-2 xl:hidden">
        {component.variants.map((variant) => (
          <div
            key={variant.id}
            className="flex items-stretch gap-2"
            style={{ paddingLeft: (variant.tier - 1) * 14 }}
          >
            {variant.tier > 1 && (
              <ChevronsRight className="mt-3 size-3.5 shrink-0 text-carbon-400" />
            )}
            <div className="min-w-0 flex-1">
              <TechNode variant={variant} {...nodeProps} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- view -------------------------------- */

type GroupFilter = 'ALL' | ComponentGroup;

export function RndCenterView() {
  const { state, components, dispatch, playerTeam } = useGame();
  const [group, setGroup] = useState<GroupFilter>('ALL');

  const visible = useMemo(
    () => (group === 'ALL' ? components : components.filter((c) => c.group === group)),
    [components, group],
  );

  if (!state || !playerTeam) return null;

  const { seasonalCapTokens, seasonalTokensUsed, developmentTokens } = state.rnd;
  const capRemaining = seasonalCapTokens - seasonalTokensUsed;
  const capPct = (seasonalTokensUsed / seasonalCapTokens) * 100;
  const capExhausted = capRemaining <= 0;

  const inDevelopment = Object.values(state.rnd.projects).filter(
    (project) => project.status === 'IN_DEVELOPMENT',
  );

  const car = state.teams.find((team) => team.teamId === playerTeam.id)?.car;
  const roundsLeft = Math.max(0, state.settings.seasonLength - state.round + 1);

  const start = (variantId: string) => void dispatch({ type: 'START_UPGRADE', variantId });
  const cancel = (variantId: string) => void dispatch({ type: 'CANCEL_UPGRADE', variantId });

  return (
    <div className="grid gap-4">
      <Panel
        title="Engineering & R&D Center"
        icon={<FlaskConical className="size-3.5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan" mono>
              Season {state.season}
            </Badge>
            <Badge tone="neutral" mono>
              Round {state.round}/{state.settings.seasonLength} · Week {state.week}
            </Badge>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Seasonal cap */}
          <div
            className={cx(
              'rounded-lg border p-4',
              capExhausted
                ? 'border-neon-red/45 bg-neon-red/8'
                : 'border-carbon-600/70 bg-carbon-900/40',
            )}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Seasonal Development Cap</span>
              <span
                className={cx(
                  'font-mono text-xl font-bold',
                  capExhausted ? 'text-neon-red' : 'text-chrome-100',
                )}
              >
                {seasonalTokensUsed}
                <span className="text-chrome-500">/{seasonalCapTokens}</span>
              </span>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded-full bg-carbon-700">
              <motion.div
                className="h-full rounded-full"
                initial={false}
                animate={{ width: `${Math.min(100, capPct)}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                style={{
                  background: capExhausted
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-neon-red) 55%, transparent), var(--color-neon-red))'
                    : 'linear-gradient(90deg, color-mix(in srgb, var(--color-neon-violet) 55%, transparent), var(--color-neon-violet))',
                  boxShadow: capExhausted
                    ? '0 0 14px var(--color-neon-red)'
                    : '0 0 14px color-mix(in srgb, var(--color-neon-violet) 60%, transparent)',
                }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent 0 11px, var(--color-carbon-850) 11px 13px)',
                }}
              />
            </div>

            <p
              className={cx(
                'mt-2 text-[11px]',
                capExhausted ? 'font-semibold text-neon-red' : 'text-chrome-500',
              )}
            >
              {capExhausted
                ? 'Cap reached — no further upgrades may be started this season.'
                : `${capRemaining} tokens may still be committed before the regulations bite.`}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Token pool', value: developmentTokens, tone: 'text-neon-violet' },
                { label: 'In build', value: inDevelopment.length, tone: 'text-neon-amber' },
                { label: 'Fitted', value: state.rnd.installedVariantIds.length, tone: 'text-neon-lime' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-carbon-600/70 bg-carbon-800/50 px-2.5 py-2"
                >
                  <p className="text-[9px] tracking-widest text-chrome-500 uppercase">
                    {stat.label}
                  </p>
                  <p className={cx('mt-0.5 font-mono text-[15px] font-bold', stat.tone)}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Live car */}
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-4">
            <p className="eyebrow mb-3">Current Car — {playerTeam.name}</p>
            <div className="space-y-2.5">
              {car &&
                (
                  [
                    { key: 'pace', label: 'Pace', color: 'var(--color-neon-cyan)' },
                    { key: 'aero', label: 'Aero', color: 'var(--color-neon-violet)' },
                    { key: 'powerUnit', label: 'Power unit', color: 'var(--color-neon-red)' },
                    { key: 'electrical', label: 'Electrical', color: 'var(--color-neon-amber)' },
                    { key: 'reliability', label: 'Reliability', color: 'var(--color-neon-lime)' },
                  ] as const
                ).map((row) => (
                  <div key={row.key}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="font-mono text-[10px] tracking-wider text-chrome-400">
                        {row.label}
                      </span>
                      <span
                        className="font-mono text-[12px] font-bold"
                        style={{ color: row.color }}
                      >
                        {Math.round(car[row.key])}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
                      <motion.div
                        className="h-full rounded-full"
                        initial={false}
                        animate={{ width: `${car[row.key]}%` }}
                        style={{ background: row.color, boxShadow: `0 0 8px ${row.color}` }}
                      />
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-3 rounded-md border border-carbon-600/70 bg-carbon-800/50 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[9px] tracking-widest text-chrome-500 uppercase">
                  Season progress
                </span>
                <span className="font-mono text-[10px] text-chrome-300">
                  {roundsLeft} round{roundsLeft === 1 ? '' : 's'} left to develop in
                </span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: state.settings.seasonLength }).map((_, index) => (
                  <span
                    key={index}
                    className={cx(
                      'h-1.5 flex-1 rounded-full',
                      index + 1 < state.round
                        ? 'bg-carbon-500'
                        : index + 1 === state.round
                          ? 'bg-neon-red'
                          : 'bg-carbon-700',
                    )}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-chrome-400">
                Each round advances the calendar two weeks. A fitted upgrade feeds straight into
                the car above, and therefore into qualifying and race pace.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <PartDevelopmentPanel />

      <Panel
        title="Development Tech Tree"
        icon={<Cpu className="size-3.5" />}
        actions={
          <SegmentedControl
            name="rnd-group"
            size="sm"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'POWER_UNIT', label: 'Power Unit' },
              { value: 'AERODYNAMICS', label: 'Aero' },
            ]}
          />
        }
      >
        <p className="mb-3 text-[11px] text-chrome-500">
          Each component opens with a shared baseline, then forks into two mutually exclusive
          design philosophies. Committing to one branch rules the other out for the season.
        </p>

        <div className="space-y-3">
          {visible.map((component) => (
            <ComponentTree
              key={component.id}
              component={component}
              state={state}
              onStart={start}
              onCancel={cancel}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
