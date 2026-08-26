import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  Flag,
  Gauge,
  Plus,
  Route,
  Save,
  Timer,
  Trash2,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TelemetryChart } from '@/components/ui/TelemetryChart';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { GameButton } from '@/components/game/GameButton';
import { scaledLaps } from '@/game/trackAdapter';
import { TYRE_MODEL } from '@/engine/raceEngine';
import { TYRE_COLOR, cx, flagEmoji } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import { unconfirmedDrivers } from '@/game/machine';
import type { StintPlan, StrategyPlan } from '@/game/types';
import type { TyreCompound } from '@/types';

const DRY_COMPOUNDS: TyreCompound[] = ['SOFT', 'MEDIUM', 'HARD'];

/** What each notch of the push level actually instructs the driver to do. */
const PUSH_BRIEF: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Bring it home. They will not fight for a position and the tyres will last a long way — but anyone behind will come past.',
  2: 'Manage it. Measured pace, kind on the rubber, and they will let a marginal move go.',
  3: 'Race normally. No instruction either way; the driver races on instinct.',
  4: 'Race hard. They will commit to moves and the tyres will feel it.',
  5: 'Everything. Maximum attack, heavy degradation, and the stress will build all afternoon — a driver held here too long will make a mistake.',
};

/** Push level 1-5 maps onto a wear multiplier and a pace bonus. */
function pushFactors(level: number) {
  const clamped = Math.max(1, Math.min(5, level));
  return {
    wearMultiplier: 0.78 + (clamped - 1) * 0.18,
    paceGainS: (clamped - 3) * 0.22,
  };
}

/** Laps a compound survives before the cliff at a given push level. */
function stintLife(compound: TyreCompound, pushLevel: number): number {
  const { wearMultiplier } = pushFactors(pushLevel);
  return Math.floor(80 / (TYRE_MODEL[compound].wearPerLap * wearMultiplier));
}

/** Wear curve across a stint, for the degradation chart. */
function wearCurve(compound: TyreCompound, laps: number, pushLevel: number): number[] {
  const { wearMultiplier } = pushFactors(pushLevel);
  const perLap = TYRE_MODEL[compound].wearPerLap * wearMultiplier;
  return Array.from({ length: laps + 1 }, (_, lap) => Math.min(100, lap * perLap));
}

const DEFAULT_STINTS: StintPlan[] = [
  { compound: 'MEDIUM', plannedLaps: 8 },
  { compound: 'HARD', plannedLaps: 6 },
];


/* ---------------------------------------------------------------------
 * Grid sign-off.
 *
 * The race cannot start until both cars have a starting compound chosen
 * for this round. That is deliberately a decision the player has to make
 * rather than a default they can ignore: the tyre you start on is the
 * single biggest strategic commitment of the afternoon, and inheriting
 * last weekend's choice is not a decision at all.
 * ------------------------------------------------------------------- */

function GridSignOff() {
  const { state, playerDrivers, currentTrack, dispatch, phase } = useGame();
  if (!state) return null;

  const raceLaps = currentTrack ? scaledLaps(currentTrack, state.settings.raceLengthPct) : 0;
  const outstanding = unconfirmedDrivers(state);
  const gating = phase === 'RACE_STRATEGY';
  const ready = outstanding.length === 0;

  return (
    <Panel
      title={gating ? 'Grid Sign-Off — Required' : 'Grid Sign-Off'}
      icon={<ClipboardCheck className="size-3.5" />}
      className="xl:col-span-2"
      actions={
        gating ? (
          <GameButton
            size="sm"
            disabled={!ready}
            variant={ready ? 'primary' : 'ghost'}
            onClick={() => dispatch({ type: 'CONFIRM_STRATEGY' })}
            icon={<Flag className="size-3" />}
          >
            {ready ? 'Lock it in — go to the grid' : `${outstanding.length} car(s) outstanding`}
          </GameButton>
        ) : (
          <Badge tone={ready ? 'lime' : 'neutral'} mono>
            {ready ? 'Signed off' : 'Not signed off'}
          </Badge>
        )
      }
    >
      <p className="mb-3 text-[11px] text-chrome-500">
        {gating
          ? `Choose the compound each car starts on. ${raceLaps} laps to run — a soft start buys track position early and costs you a longer second stint.`
          : 'The starting compound is confirmed here after qualifying, before the grid forms.'}
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {playerDrivers.map((driver) => {
          const plan = state.strategies[driver.id];
          const confirmed = plan?.confirmedForRound === state.round;
          const grid = state.qualifying?.entries.find((entry) => entry.driverId === driver.id);

          return (
            <div
              key={driver.id}
              className={cx(
                'rounded-lg border p-3 transition-colors',
                confirmed
                  ? 'border-neon-lime/40 bg-neon-lime/[0.05]'
                  : gating
                    ? 'border-neon-amber/50 bg-neon-amber/[0.05]'
                    : 'border-carbon-600/70 bg-carbon-900/40',
              )}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-chrome-500">
                  #{driver.carNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-chrome-100">
                  {driver.firstName} {driver.lastName}
                </span>
                {grid && (
                  <Badge tone="cyan" mono>
                    P{grid.position}
                  </Badge>
                )}
                {confirmed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-neon-lime" />
                ) : null}
              </div>

              <SegmentedControl
                name={`start-tyre-${driver.id}`}
                size="sm"
                value={confirmed ? (plan?.startingCompound ?? null) : null}
                onChange={(compound) =>
                  dispatch({ type: 'SET_STARTING_TYRE', driverId: driver.id, compound })
                }
                options={DRY_COMPOUNDS.map((compound) => ({
                  value: compound,
                  label: compound as string,
                  color: TYRE_COLOR[compound],
                }))}
              />

              <p className="mt-2 font-mono text-[10px] text-chrome-500">
                {confirmed && plan
                  ? `${plan.startingCompound} — roughly ${stintLife(
                      plan.startingCompound,
                      plan.pushLevel,
                    )} laps before the cliff`
                  : 'No compound chosen'}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function RaceStrategyView() {
  const { state, playerDrivers, currentTrack, dispatch } = useGame();

  const [driverId, setDriverId] = useState<string | null>(null);
  const activeDriverId = driverId ?? playerDrivers[0]?.id ?? null;

  const saved = activeDriverId ? state?.strategies[activeDriverId] : undefined;

  const [draft, setDraft] = useState<StrategyPlan | null>(null);
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  const raceLaps =
    currentTrack && state ? scaledLaps(currentTrack, state.settings.raceLengthPct) : 0;

  /* Re-seed the editor whenever the selected driver or their saved plan
   * changes, adjusting during render rather than in an effect. */
  const signature = `${activeDriverId ?? ''}|${JSON.stringify(saved ?? null)}`;
  if (activeDriverId && signature !== syncedFor) {
    setSyncedFor(signature);
    setDraft(
      saved ?? {
        driverId: activeDriverId,
        stints: DEFAULT_STINTS.map((stint) => ({ ...stint })),
        pushLevel: 3,
        startingCompound: DEFAULT_STINTS[0]!.compound,
        confirmedForRound: null,
      },
    );
  }

  const degradation = useMemo(() => {
    if (!draft) return [];
    return DRY_COMPOUNDS.map((compound) => ({
      id: compound,
      color: TYRE_COLOR[compound],
      area: compound === draft.stints[0]?.compound,
      data: wearCurve(compound, Math.max(6, raceLaps), draft.pushLevel),
    }));
  }, [draft, raceLaps]);

  if (!state || !draft || !activeDriverId) {
    return (
      <Panel title="Race Strategy" icon={<Route className="size-3.5" />}>
        <p className="py-10 text-center text-[12px] text-chrome-500">
          Pick a team from the season screen to plan a race.
        </p>
      </Panel>
    );
  }

  const plannedLaps = draft.stints.reduce((sum, stint) => sum + stint.plannedLaps, 0);
  const deficit = raceLaps - plannedLaps;
  const push = pushFactors(draft.pushLevel);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? null);

  const update = (patch: Partial<StrategyPlan>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const updateStint = (index: number, patch: Partial<StintPlan>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            stints: current.stints.map((stint, i) =>
              i === index ? { ...stint, ...patch } : stint,
            ),
          }
        : current,
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <GridSignOff />

      {/* Stint planner */}
      <Panel
        title="Stint Planner"
        icon={<Route className="size-3.5" />}
        className="xl:col-span-2"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              name="strategy-driver"
              size="sm"
              value={activeDriverId}
              onChange={setDriverId}
              options={playerDrivers.map((driver) => ({
                value: driver.id,
                label: `#${driver.carNumber} ${driver.lastName}`,
              }))}
            />
            <GameButton
              size="sm"
              disabled={!dirty}
              onClick={() => dispatch({ type: 'SET_STRATEGY', plan: draft })}
              icon={<Save className="size-3" />}
            >
              {dirty ? 'Save plan' : 'Saved'}
            </GameButton>
          </div>
        }
      >
        {currentTrack && (
          <p className="mb-3 text-[11px] text-chrome-500">
            {flagEmoji(currentTrack.countryCode)} {currentTrack.name} ·{' '}
            <span className="font-mono text-chrome-300">{raceLaps} laps</span> at{' '}
            {state.settings.raceLengthPct}% distance. Plans are stored in the save and apply from
            the next session.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            {/* Visual stint bar */}
            <div className="mb-3 flex h-9 w-full overflow-hidden rounded-lg border border-carbon-600">
              {draft.stints.map((stint, index) => (
                <motion.div
                  key={`${stint.compound}-${index}`}
                  layout
                  className="relative flex items-center justify-center border-r border-carbon-900 last:border-r-0"
                  style={{
                    width: `${(stint.plannedLaps / Math.max(1, plannedLaps)) * 100}%`,
                    background: `color-mix(in srgb, ${TYRE_COLOR[stint.compound]} 22%, transparent)`,
                  }}
                >
                  <span
                    className="font-mono text-[10px] font-bold"
                    style={{ color: TYRE_COLOR[stint.compound] }}
                  >
                    {stint.compound[0]} · {stint.plannedLaps}L
                  </span>
                </motion.div>
              ))}
            </div>

            <ul className="space-y-2">
              {draft.stints.map((stint, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5"
                >
                  <span className="font-mono text-[10px] font-bold tracking-wider text-chrome-500 uppercase">
                    Stint {index + 1}
                  </span>

                  <SegmentedControl
                    name={`stint-${index}`}
                    size="sm"
                    value={stint.compound}
                    onChange={(compound) => updateStint(index, { compound })}
                    options={DRY_COMPOUNDS.map((compound) => ({
                      value: compound,
                      label: compound[0]!,
                      color: TYRE_COLOR[compound],
                    }))}
                  />

                  <div className="flex min-w-[150px] flex-1 items-center gap-2">
                    <input
                      type="range"
                      min={2}
                      max={Math.max(4, raceLaps)}
                      value={stint.plannedLaps}
                      onChange={(event) =>
                        updateStint(index, { plannedLaps: Number(event.target.value) })
                      }
                      className="min-w-0 flex-1"
                      aria-label={`Stint ${index + 1} laps`}
                    />
                    <span className="w-10 shrink-0 text-right font-mono text-[12px] font-bold text-chrome-100">
                      {stint.plannedLaps}L
                    </span>
                  </div>

                  <span className="font-mono text-[10px] text-chrome-500">
                    life {stintLife(stint.compound, draft.pushLevel)}L
                  </span>

                  {draft.stints.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({ stints: draft.stints.filter((_, i) => i !== index) })
                      }
                      aria-label={`Remove stint ${index + 1}`}
                      className="rounded-md border border-carbon-600 p-1.5 text-chrome-500 transition-colors hover:border-neon-red/40 hover:text-neon-red"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() =>
                update({ stints: [...draft.stints, { compound: 'MEDIUM', plannedLaps: 5 }] })
              }
              disabled={draft.stints.length >= 4}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-carbon-600 px-3 py-1.5 text-[10px] font-bold tracking-wider text-chrome-400 uppercase transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan disabled:opacity-40"
            >
              <Plus className="size-3" /> Add stint
            </button>
          </div>

          {/* Summary */}
          <div className="space-y-2.5">
            <div
              className={cx(
                'rounded-lg border px-3 py-2.5',
                deficit === 0
                  ? 'border-neon-lime/30 bg-neon-lime/8'
                  : 'border-neon-amber/30 bg-neon-amber/8',
              )}
            >
              <p className="text-[9px] tracking-widest text-chrome-500 uppercase">Race coverage</p>
              <p
                className={cx(
                  'mt-0.5 font-mono text-lg font-bold',
                  deficit === 0 ? 'text-neon-lime' : 'text-neon-amber',
                )}
              >
                {plannedLaps}/{raceLaps} laps
              </p>
              <p className="mt-0.5 text-[10px] text-chrome-500">
                {deficit === 0
                  ? 'Plan covers the full distance.'
                  : deficit > 0
                    ? `${deficit} laps short.`
                    : `${Math.abs(deficit)} laps over.`}
              </p>
            </div>

            {[
              { label: 'Planned stops', value: String(Math.max(0, draft.stints.length - 1)) },
              {
                label: 'Pace effect',
                value: `${push.paceGainS >= 0 ? '-' : '+'}${Math.abs(push.paceGainS).toFixed(2)}s`,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2"
              >
                <span className="text-[10px] tracking-wider text-chrome-500 uppercase">
                  {row.label}
                </span>
                <span className="font-mono text-[12px] font-bold text-chrome-100">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Degradation */}
      <Panel title="Tyre Degradation" icon={<Timer className="size-3.5" />}>
        <TelemetryChart
          height={168}
          yMin={0}
          yMax={100}
          series={degradation}
          thresholds={[{ value: 80, color: 'var(--color-neon-red)', label: 'cliff' }]}
          xLabels={['L0', `L${Math.round(raceLaps / 2)}`, `L${raceLaps}`]}
          yLabels={['100%', '50%', '0%']}
        />

        <div className="mt-3 flex flex-wrap gap-3">
          {DRY_COMPOUNDS.map((compound) => (
            <span key={compound} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: TYRE_COLOR[compound] }}
              />
              <span className="font-mono text-[10px] text-chrome-400">
                {compound} · {stintLife(compound, draft.pushLevel)}L
              </span>
            </span>
          ))}
        </div>
      </Panel>

      {/* Race mode */}
      <Panel title="Race Mode" icon={<Gauge className="size-3.5" />}>
        <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
          A standing instruction on how hard to race, not a lap-time dial. Turning it up makes
          the driver commit to moves they would otherwise let go — and they pay for it in
          rubber, in stress, and eventually in mistakes.
        </p>

        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow flex items-center gap-1.5">
            <Gauge className="size-3 text-neon-cyan" /> Push level
          </span>
          <span className="font-mono text-[15px] font-bold text-neon-cyan">
            {draft.pushLevel}/5
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          value={draft.pushLevel}
          onChange={(event) => update({ pushLevel: Number(event.target.value) })}
          className="w-full"
          aria-label="Push level"
        />
        <div className="mt-1 flex justify-between font-mono text-[9px] text-chrome-500">
          <span>Conserve</span>
          <span>Balanced</span>
          <span>Attack</span>
        </div>

        <p className="mt-2 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5 text-[10px] leading-relaxed text-chrome-400">
          {PUSH_BRIEF[draft.pushLevel as 1 | 2 | 3 | 4 | 5] ?? PUSH_BRIEF[3]}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2">
            <p className="text-[9px] tracking-widest text-chrome-500 uppercase">Tyre wear</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-neon-red">
              ×{(1 + ((draft.pushLevel - 3) / 2) * 0.22).toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2">
            <p className="text-[9px] tracking-widest text-chrome-500 uppercase">Aggression</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-neon-amber">
              {((draft.pushLevel - 3) / 2) >= 0 ? '+' : ''}
              {(((draft.pushLevel - 3) / 2) * 30).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2">
            <p className="text-[9px] tracking-widest text-chrome-500 uppercase">Lap time</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-neon-lime">
              {((draft.pushLevel - 3) / 2) > 0 ? '−' : ((draft.pushLevel - 3) / 2) < 0 ? '+' : '±'}
              {Math.abs(((draft.pushLevel - 3) / 2) * 0.0032 * 92).toFixed(2)}s
            </p>
          </div>
        </div>
      </Panel>

      {/* Compounds */}
      <Panel
        title="Compound Allocation"
        icon={<Droplets className="size-3.5" />}
        className="xl:col-span-2"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {DRY_COMPOUNDS.map((compound) => {
            const inPlan = draft.stints.some((stint) => stint.compound === compound);
            return (
              <div
                key={compound}
                className={cx(
                  'rounded-lg border p-3 transition-colors',
                  inPlan
                    ? 'border-carbon-500 bg-carbon-800/60'
                    : 'border-carbon-700/60 bg-carbon-900/30',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <TyreBadge compound={compound} size="md" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold" style={{ color: TYRE_COLOR[compound] }}>
                      {compound}
                    </p>
                    <p className="font-mono text-[10px] text-chrome-500">
                      {stintLife(compound, draft.pushLevel)} lap life
                    </p>
                  </div>
                  {inPlan && (
                    <Badge tone="cyan" className="ml-auto">
                      In plan
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
