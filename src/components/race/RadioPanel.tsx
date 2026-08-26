import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CloudRain,
  Flame,
  Gauge,
  Hand,
  MessageSquareWarning,
  OctagonX,
  Radio,
  Thermometer,
  Wrench,
  Zap,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { gridTeamOf } from '@/data/grid2026';
import { useTeamOf } from '@/state/useTeamOf';
import type { LucideIcon } from 'lucide-react';
import { PIT_WALL_CALLS, lapsOfLifeLeft } from '@/game/driverRadio';
import type { DecisionKind, RadioMessage, RadioSeverity } from '@/game/driverRadio';
import {
  EMOTION_BLURB,
  EMOTION_LABEL,
  EMOTION_TONE,
  conditionOf,
  emotionOf,
} from '@/game/driverCondition';
import { TYRE_COLOR, cx, formatGap, formatLapTime } from '@/lib/format';
import { DAMP_THRESHOLD, bestCompoundFor, conditionLabel, isWrongTyre } from '@/game/weather';
import { useGame } from '@/state/gameContext';
import { useRace } from '@/state/raceContext';
import type { CarState, TyreCompound } from '@/types';

/* =====================================================================
 * Pit-to-car radio.
 *
 * Two directions of traffic, and the panel is built around the fact that
 * they are different things:
 *
 *   Car to pit  — the driver reports what the telemetry does not say:
 *                 that the tyres are gone, that the engine is unhappy,
 *                 that they want the softs. Requests that need an answer
 *                 surface as a decision card at the top and stay there
 *                 until the pit wall rules on them.
 *
 *   Pit to car  — every control is a `RaceCommand` sent straight to the
 *                 running engine, so the effect shows up on the map and
 *                 in the timing tower immediately.
 *
 * The two attack modes are deliberately not the same control. Push is a
 * driving style paid for in rubber, fuel and engine life; Boost is a
 * deployment mode paid for out of the battery. Both latch on until they
 * are lifted or their resource runs out, which is why they are rendered
 * as switches rather than buttons.
 * ===================================================================== */

const DRY_COMPOUNDS: TyreCompound[] = ['SOFT', 'MEDIUM', 'HARD'];
const WET_COMPOUNDS: TyreCompound[] = ['INTER', 'WET'];

const SEVERITY_STYLE: Record<
  RadioSeverity,
  { border: string; text: string; dot: string }
> = {
  INFO: { border: 'border-carbon-600', text: 'text-chrome-400', dot: 'bg-chrome-500' },
  CONCERN: {
    border: 'border-neon-amber/40',
    text: 'text-neon-amber',
    dot: 'bg-neon-amber',
  },
  URGENT: { border: 'border-neon-red/50', text: 'text-neon-red', dot: 'bg-neon-red' },
};

/* ------------------------- driver condition strip ---------------------- */

/**
 * The three things a driver would tell you about if you asked. Each is
 * banded rather than exact, because a pit wall reacts to "the engine is
 * in trouble", not to 81.4%.
 */
function ConditionStrip({ car, wearScale }: { car: CarState; wearScale: number }) {
  const lifeLeft = lapsOfLifeLeft(car, wearScale);

  const engineTone =
    car.engineWearPct >= 88
      ? 'var(--color-neon-red)'
      : car.engineWearPct >= 72
        ? 'var(--color-neon-amber)'
        : 'var(--color-neon-lime)';

  const tyreTone =
    car.tyre.wearPct >= 80
      ? 'var(--color-neon-red)'
      : car.tyre.wearPct >= 55
        ? 'var(--color-neon-amber)'
        : 'var(--color-neon-lime)';

  const rows = [
    {
      key: 'tyres',
      icon: Gauge,
      label: 'Tyre life',
      value: `${Math.round(lifeLeft)}L`,
      pct: 100 - car.tyre.wearPct,
      tone: tyreTone,
      hint: `${Math.round(car.tyre.wearPct)}% worn`,
    },
    {
      key: 'energy',
      icon: Zap,
      label: 'Energy',
      value: `${Math.round(car.ersPct)}%`,
      pct: car.ersPct,
      tone: 'var(--color-neon-violet)',
      hint: car.boosting ? 'deploying' : 'harvesting',
    },
    {
      key: 'engine',
      icon: Thermometer,
      label: 'Engine',
      value: `${Math.round(100 - car.engineWearPct)}%`,
      pct: 100 - car.engineWearPct,
      tone: engineTone,
      hint:
        car.engineWearPct >= 88
          ? 'failure imminent'
          : car.engineWearPct >= 72
            ? 'under stress'
            : 'healthy',
    },
  ];

  return (
    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div
            key={row.key}
            className="rounded-md border border-carbon-600/70 bg-carbon-950/40 px-2 py-1.5"
            title={`${row.label}: ${row.hint}`}
          >
            <p className="flex items-center gap-1 text-[8px] tracking-widest text-chrome-600 uppercase">
              <Icon className="size-2.5" style={{ color: row.tone }} />
              {row.label}
            </p>
            <p className="mt-0.5 font-mono text-[12px] font-bold" style={{ color: row.tone }}>
              {row.value}
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-carbon-700">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${Math.max(0, Math.min(100, row.pct))}%`,
                  background: row.tone,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------- how they are feeling ------------------------- */

/**
 * Mood, stress and the emotion they add up to, alongside the four calls a
 * pit wall can actually make. This is the half of a race radio the game
 * never had: a manager who can only answer questions is not managing
 * anybody.
 */
function DriverState({ driverId }: { driverId: string }) {
  const { state } = useGame();
  const { callDriver } = useRace();

  const condition = conditionOf(state, driverId);
  const emotion = emotionOf(condition);
  const tone = EMOTION_TONE[emotion];

  const bars = [
    { label: 'Mood', value: condition.mood, tone: 'var(--color-neon-lime)', good: 'high' },
    { label: 'Stress', value: condition.stress, tone: 'var(--color-neon-red)', good: 'low' },
    { label: 'Morale', value: condition.morale, tone: 'var(--color-neon-cyan)', good: 'high' },
  ];

  return (
    <div className="mt-2.5 rounded-md border border-carbon-600/70 bg-carbon-950/40 p-2.5">
      <div className="flex items-center gap-2">
        <motion.span
          animate={
            emotion === 'RATTLED' || emotion === 'FIRED_UP'
              ? { opacity: [1, 0.4, 1] }
              : { opacity: 1 }
          }
          transition={{ duration: 1.3, repeat: Infinity }}
          className="size-2 shrink-0 rounded-full"
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
        <span
          className="text-[11px] font-bold tracking-wide uppercase"
          style={{ color: tone }}
          title={EMOTION_BLURB[emotion]}
        >
          {EMOTION_LABEL[emotion]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {bars.map((bar) => (
          <div key={bar.label}>
            <p className="flex items-center justify-between text-[8px] tracking-widest text-chrome-600 uppercase">
              {bar.label}
              <span className="font-mono" style={{ color: bar.tone }}>
                {Math.round(bar.value)}
              </span>
            </p>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-carbon-700">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${bar.value}%`, background: bar.tone }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* The pit wall speaking first. */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {PIT_WALL_CALLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => callDriver(driverId, entry.id)}
            title={`${entry.hint} ${entry.effect}`}
            className={cx(
              'rounded-md border border-carbon-600 bg-carbon-800/60 py-1',
              'text-[8.5px] font-bold tracking-wider text-chrome-400 uppercase',
              'transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- decision card ----------------------------- */

/**
 * A driver asking for something. All three kinds work the same way: the
 * card has to be answered, because refusing is a real call with real
 * consequences rather than the absence of one, and it only clears when
 * the pit wall picks a side.
 *
 * The three are styled apart because they are different sizes of
 * decision — a stop reshapes the race, an override is worth one corner.
 */
const DECISION_STYLE: Record<
  DecisionKind,
  { accent: string; tone: 'red' | 'violet' | 'cyan'; icon: LucideIcon; refuse: string; pulse: number }
> = {
  PIT: {
    accent: 'var(--color-neon-red)',
    tone: 'red',
    icon: MessageSquareWarning,
    refuse: 'Stay out',
    pulse: 1.4,
  },
  PUSH: {
    accent: 'var(--color-neon-amber)',
    tone: 'cyan',
    icon: Flame,
    refuse: 'Hold station',
    pulse: 2,
  },
  BOOST: {
    accent: 'var(--color-neon-violet)',
    tone: 'violet',
    icon: Zap,
    refuse: 'Save it',
    pulse: 1.1,
  },
};

function RequestCard({
  message,
  driverCode,
  onAnswer,
}: {
  message: RadioMessage;
  driverCode: string;
  onAnswer: (accepted: boolean) => void;
}) {
  const decision = message.decision;
  if (!decision) return null;

  const style = DECISION_STYLE[decision.kind];
  const Icon = style.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="rounded-lg border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${style.accent} 50%, transparent)`,
        background: `color-mix(in srgb, ${style.accent} 7%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <motion.span
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: style.pulse, repeat: Infinity }}
          className="grid size-6 shrink-0 place-items-center rounded-md"
          style={{
            background: `color-mix(in srgb, ${style.accent} 20%, transparent)`,
            color: style.accent,
          }}
        >
          <Icon className="size-3.5" />
        </motion.span>
        <span
          className="font-mono text-[10px] font-bold tracking-widest uppercase"
          style={{ color: style.accent }}
        >
          {driverCode} · Lap {message.lap}
        </span>
        <Badge tone={style.tone} mono className="ml-auto">
          Answer required
        </Badge>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed font-medium text-chrome-100 italic">
        “{message.text}”
      </p>

      <p className="mt-1 font-mono text-[9px] text-chrome-500">{decision.rationale}</p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAnswer(true)}
          className={cx(
            'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2',
            'text-[10px] font-bold tracking-wider uppercase transition-all hover:brightness-125',
          )}
          style={{
            borderColor: style.accent,
            background: `color-mix(in srgb, ${style.accent} 15%, transparent)`,
            color: style.accent,
          }}
        >
          <Check className="size-3.5" />
          {decision.affirm}
        </button>
        <button
          type="button"
          onClick={() => onAnswer(false)}
          className={cx(
            'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2',
            'text-[10px] font-bold tracking-wider uppercase transition-all',
            'border-carbon-500 bg-carbon-800 text-chrome-300',
            'hover:border-neon-cyan/50 hover:text-neon-cyan',
          )}
        >
          <Hand className="size-3.5" />
          {style.refuse}
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------- panel --------------------------------- */

interface PitCallEntry {
  id: number;
  driverCode: string;
  text: string;
}

/** What the pit wall's log says about a call it just made. */
function replyLabel(message: RadioMessage, accepted: boolean): string {
  switch (message.decision?.kind) {
    case 'PUSH':
      return accepted ? 'push mode granted' : 'push refused, hold station';
    case 'BOOST':
      return accepted ? 'override granted' : 'override refused, save the battery';
    default:
      return accepted
        ? `box confirmed — ${message.decision?.compound.toLowerCase() ?? 'tyres'}`
        : 'stay out, extend the stint';
  }
}

export function RadioPanel({ className }: { className?: string }) {
  const { playerDrivers, state } = useGame();
  const {
    snapshot,
    send,
    setFocusedDriverId,
    focusedDriverId,
    radio,
    radioRequests,
    answerRadio,
  } = useRace();

  /* How much water is on the track right now — what the pit wall is
   * actually looking at when it decides what to bolt on. */
  const wetness = snapshot.weather.wetness;
  const trackIsWet = wetness >= DAMP_THRESHOLD;

  /** Calls the pit wall made, kept separate from what the drivers said. */
  const [pitCalls, setPitCalls] = useState<PitCallEntry[]>([]);
  const [seq, setSeq] = useState(0);
  /** Compound queued for each car's next stop. */
  const [nextTyre, setNextTyre] = useState<Record<string, TyreCompound>>({});

  const teamOfCar = useTeamOf();
  const codeOf = (driverId: string) =>
    playerDrivers.find((driver) => driver.id === driverId)?.code ?? driverId.slice(0, 3);

  const logCall = (driverCode: string, text: string) => {
    setSeq((n) => n + 1);
    setPitCalls((current) => [{ id: seq + 1, driverCode, text }, ...current].slice(0, 6));
  };

  const chooseTyre = (car: CarState, code: string, compound: TyreCompound) => {
    // Re-picking the compound already queued is not a call worth logging;
    // without this the log fills with the same line every time the player
    // taps around the selector.
    const current = nextTyre[car.driverId] ?? car.tyre.compound;
    if (current === compound) return;

    setNextTyre((prev) => ({ ...prev, [car.driverId]: compound }));
    send({ type: 'SET_TYRE', driverId: car.driverId, compound });
    logCall(code, `${compound.toLowerCase()} tyres readied`);
  };

  return (
    <Panel
      title="Team Radio & Pit Wall"
      icon={<Radio className="size-3.5" />}
      className={className}
      actions={
        <div className="flex items-center gap-2">
          {radioRequests.length > 0 && (
            <Badge tone="red" mono>
              {radioRequests.length} awaiting
            </Badge>
          )}
          <Badge tone="cyan" mono>
            {state?.playerTeamId ? gridTeamOf(state.playerTeamId).shortName : 'PIT WALL'}
          </Badge>
        </div>
      }
    >
      {/* Outstanding decisions come first — they are the only thing on this
          panel with a deadline attached. */}
      <AnimatePresence initial={false}>
        {radioRequests.length > 0 && (
          <motion.div layout className="mb-3 grid gap-2">
            {radioRequests.map((message) => (
              <RequestCard
                key={message.id}
                message={message}
                driverCode={codeOf(message.driverId)}
                onAnswer={(accepted) => {
                  answerRadio(message.id, accepted);
                  logCall(codeOf(message.driverId), replyLabel(message, accepted));
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The conditions, and — far more urgently — whether either car is
          out there on a tyre that no longer suits them. A driver losing
          seconds a lap on the wrong rubber is the one thing the pit wall
          must never have to work out for itself. */}
      {trackIsWet && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/[0.06] px-3 py-2">
          <CloudRain className="size-3.5 shrink-0 text-neon-cyan" />
          <span className="text-[11px] font-bold text-chrome-100">
            {conditionLabel(wetness)}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-chrome-500 uppercase">
            {Math.round(wetness * 100)}% water · {bestCompoundFor(wetness).toLowerCase()} is the tyre
          </span>
          {playerDrivers.some((driver) => {
            const car = snapshot.cars.find((entry) => entry.driverId === driver.id);
            return car && car.status !== 'RETIRED' && isWrongTyre(car.tyre.compound, wetness);
          }) && (
            <span className="ml-auto animate-pulse font-mono text-[10px] font-bold tracking-wider text-neon-red uppercase">
              Wrong tyre — box now
            </span>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {playerDrivers.map((driver) => {
          const car = snapshot.cars.find((entry) => entry.driverId === driver.id);
          if (!car) return null;

          const retired = car.status === 'RETIRED';
          const inPit =
            car.status === 'IN_PIT' ||
            car.status === 'PIT_ENTRY' ||
            car.status === 'PIT_EXIT';
          const queued = nextTyre[car.driverId] ?? car.tyre.compound;
          const isFocused = focusedDriverId === car.driverId;

          // Both modes refuse to arm when the resource behind them is gone.
          const pushBlocked = car.tyre.wearPct >= 96 || car.fuelKg < 2.5;
          // Arming needs a real charge; holding only needs a trickle.
          const boostBlocked = car.ersPct < 12;

          return (
            <div
              key={driver.id}
              className={cx(
                'rounded-lg border p-3 transition-colors',
                retired
                  ? 'border-carbon-700 bg-carbon-900/30 opacity-70'
                  : isFocused
                    ? 'border-neon-cyan/40 bg-neon-cyan/6'
                    : 'border-carbon-600/70 bg-carbon-900/40',
              )}
            >
              {/* Driver strip */}
              <button
                type="button"
                onClick={() => setFocusedDriverId(car.driverId)}
                className="flex w-full items-center gap-2.5 text-left"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold text-carbon-950"
                  style={{ background: teamOfCar(car.driverId).color }}
                >
                  {retired ? '—' : car.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-chrome-100">
                    #{driver.carNumber} {driver.lastName}
                  </p>
                  <p className="truncate font-mono text-[10px] text-chrome-500">
                    {retired
                      ? 'Retired'
                      : `${formatGap(car.gapToLeaderMs, car.position === 1)} · ${formatLapTime(car.lastLapMs)}`}
                  </p>
                </div>
                <TyreBadge
                  compound={car.tyre.compound}
                  wearPct={car.tyre.wearPct}
                  ageLaps={car.tyre.ageLaps}
                  size="md"
                />
              </button>

              <ConditionStrip car={car} wearScale={snapshot.tyreWearScale} />
              <DriverState driverId={driver.id} />

              {/* Tyre change */}
              <div className="mt-2.5 rounded-md border border-carbon-600/70 bg-carbon-800/40 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[9px] tracking-widest text-chrome-500 uppercase">
                    Next set
                  </span>
                  <span
                    className="font-mono text-[10px] font-bold"
                    style={{ color: TYRE_COLOR[queued] }}
                  >
                    {queued}
                  </span>
                </div>

                {/* Wets appear once the track is actually wet: three slicks
                    in a downpour is a broken pit wall, and five buttons on
                    a dry Sunday is clutter. */}
                <div className={cx('grid gap-1.5', trackIsWet ? 'grid-cols-5' : 'grid-cols-3')}>
                  {(trackIsWet
                    ? [...DRY_COMPOUNDS, ...WET_COMPOUNDS]
                    : DRY_COMPOUNDS
                  ).map((compound) => {
                    const selected = queued === compound;
                    return (
                      <button
                        key={compound}
                        type="button"
                        disabled={retired}
                        onClick={() => chooseTyre(car, driver.code, compound)}
                        title={`Fit ${compound.toLowerCase()} tyres at the next stop`}
                        className={cx(
                          'flex items-center justify-center gap-1.5 rounded-md border py-1.5',
                          'text-[10px] font-bold tracking-wider uppercase transition-all',
                          'disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                        style={
                          selected
                            ? {
                                borderColor: TYRE_COLOR[compound],
                                background: `color-mix(in srgb, ${TYRE_COLOR[compound]} 16%, transparent)`,
                                color: TYRE_COLOR[compound],
                                boxShadow: `0 0 14px -6px ${TYRE_COLOR[compound]}`,
                              }
                            : {
                                borderColor: 'var(--color-carbon-500)',
                                background: 'var(--color-carbon-800)',
                                color: 'var(--color-chrome-300)',
                              }
                        }
                      >
                        <TyreBadge compound={compound} size="xs" />
                        {compound[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Attack modes — latched switches, not momentary buttons. */}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={retired || (pushBlocked && !car.attacking)}
                  title={
                    pushBlocked && !car.attacking
                      ? 'The tyres or the fuel will not take it.'
                      : car.attacking
                        ? 'Push is ON. Costs tyre life, fuel and engine wear. Click to lift.'
                        : 'Push mode: a sustained pace increase, paid for in rubber, fuel and engine life. Stays on until lifted.'
                  }
                  onClick={() => {
                    const enabled = !car.attacking;
                    send({ type: 'PUSH_MODE', driverId: car.driverId, enabled });
                    logCall(driver.code, enabled ? 'push mode ON' : 'push mode off');
                  }}
                  className={cx(
                    'relative flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2',
                    'text-[10px] font-bold tracking-wider uppercase transition-all',
                    'disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/50 disabled:text-chrome-500',
                    car.attacking
                      ? 'border-neon-red bg-neon-red/15 text-neon-red shadow-[0_0_18px_-5px_var(--color-neon-red)]'
                      : 'border-carbon-500 bg-carbon-800 text-chrome-300 hover:border-neon-red/50 hover:text-neon-red',
                  )}
                >
                  {car.attacking && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                      className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-neon-red"
                    />
                  )}
                  <span className="flex items-center gap-1.5">
                    <Flame className="size-3.5" />
                    Push
                  </span>
                  <span className="text-[8px] font-normal tracking-normal normal-case opacity-70">
                    {car.attacking ? 'ON · tyres + engine' : 'tyre & fuel cost'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={retired || (boostBlocked && !car.boosting)}
                  title={
                    boostBlocked && !car.boosting
                      ? `Not enough charge to deploy — ${Math.round(car.ersPct)}%, needs 12%.`
                      : car.boosting
                        ? 'Override is ON. Drains the battery fast and drops out when it empties.'
                        : 'Override: maximum deployment from the energy store. Much bigger gain than push, but it empties the battery in under a lap.'
                  }
                  onClick={() => {
                    const enabled = !car.boosting;
                    send({ type: 'ERS_BOOST', driverId: car.driverId, enabled });
                    logCall(driver.code, enabled ? 'override ARMED' : 'override off');
                  }}
                  className={cx(
                    'relative flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2',
                    'text-[10px] font-bold tracking-wider uppercase transition-all',
                    'disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/50 disabled:text-chrome-500',
                    car.boosting
                      ? 'border-neon-violet bg-neon-violet/15 text-neon-violet shadow-[0_0_18px_-5px_var(--color-neon-violet)]'
                      : 'border-carbon-500 bg-carbon-800 text-chrome-300 hover:border-neon-violet/50 hover:text-neon-violet',
                  )}
                >
                  {car.boosting && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity }}
                      className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-neon-violet"
                    />
                  )}
                  <span className="flex items-center gap-1.5">
                    <Zap className="size-3.5" />
                    Boost
                  </span>
                  <span className="text-[8px] font-normal tracking-normal normal-case opacity-70">
                    {car.boosting
                      ? `ON · ${Math.round(car.ersPct)}% left`
                      : 'battery cost'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={retired || inPit}
                  title={
                    inPit
                      ? 'Already in the pit lane.'
                      : `Box this lap for ${queued.toLowerCase()} tyres`
                  }
                  onClick={() => {
                    send({ type: 'PIT_CALL', driverId: car.driverId });
                    logCall(driver.code, `box, box — ${queued.toLowerCase()}`);
                  }}
                  className={cx(
                    'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2',
                    'text-[10px] font-bold tracking-wider uppercase transition-all',
                    'disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/50 disabled:text-chrome-500',
                    inPit
                      ? 'border-neon-amber bg-neon-amber/15 text-neon-amber'
                      : 'border-carbon-500 bg-carbon-800 text-chrome-300 hover:border-neon-amber/50 hover:text-neon-amber',
                  )}
                >
                  <Wrench className="size-3.5" />
                  {inPit ? 'In pit' : 'Box'}
                </button>

                <button
                  type="button"
                  disabled={retired || inPit}
                  title="Wave off a queued stop and extend the stint."
                  onClick={() => {
                    send({ type: 'CANCEL_PIT', driverId: car.driverId });
                    logCall(driver.code, 'stay out, extend the stint');
                  }}
                  className={cx(
                    'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2',
                    'border-carbon-500 bg-carbon-800 text-[10px] font-bold tracking-wider text-chrome-300 uppercase transition-all',
                    'hover:border-neon-cyan/50 hover:text-neon-cyan',
                    'disabled:cursor-not-allowed disabled:border-carbon-600 disabled:bg-carbon-800/50 disabled:text-chrome-500',
                  )}
                >
                  <Hand className="size-3.5" />
                  Stay out
                </button>
              </div>

              <button
                type="button"
                disabled={retired}
                title="Bring the car in and end its session."
                onClick={() => {
                  if (!window.confirm(`Retire ${driver.lastName}? The car cannot rejoin.`)) return;
                  send({ type: 'RETIRE_CAR', driverId: car.driverId });
                  logCall(driver.code, 'retiring the car');
                }}
                className={cx(
                  'mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5',
                  'border-carbon-600 bg-carbon-800/60 text-[10px] font-bold tracking-wider text-chrome-400 uppercase transition-all',
                  'hover:border-neon-red/50 hover:text-neon-red',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                <OctagonX className="size-3.5" />
                Retire car
              </button>

              {/* Engine warning, promoted out of the radio log because it is
                  the one condition that ends a race without warning. */}
              {!retired && car.engineWearPct >= 78 && (
                <div className="mt-2 flex items-center gap-1.5 rounded-md border border-neon-red/30 bg-neon-red/[0.06] px-2 py-1.5">
                  <AlertTriangle className="size-3 shrink-0 text-neon-red" />
                  <span className="text-[9px] leading-tight text-neon-red">
                    Power unit at {Math.round(car.engineWearPct)}% wear — every lap in push or
                    override brings a failure closer.
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {playerDrivers.length === 0 && (
          <p className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-6 text-center text-[11px] text-chrome-500">
            No cars under your control. Pick a team from the season screen first.
          </p>
        )}
      </div>

      {/* Driver radio: what the cars have said, in their own words. */}
      <div className="mt-3 border-t border-carbon-600/60 pt-3">
        <p className="eyebrow mb-2">Driver Radio</p>
        <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
          {/* The empty state sits outside AnimatePresence: an unkeyed child
              inside it is kept mounted as an exiting element, so it would
              linger under the first real message. */}
          {radio.length === 0 && (
            <p className="text-[10px] text-chrome-500">The cars have nothing to report yet.</p>
          )}
          <AnimatePresence initial={false}>
            {radio.slice(0, 24).map((message) => {
                const style = SEVERITY_STYLE[message.severity];
                return (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className={cx(
                      'flex items-start gap-2 rounded-md border bg-carbon-900/40 px-2 py-1.5',
                      style.border,
                    )}
                  >
                    <span className={cx('mt-1 size-1.5 shrink-0 rounded-full', style.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[9px] tracking-widest text-chrome-600 uppercase">
                        {codeOf(message.driverId)} · L{message.lap} · {message.kind.replace('_', ' ')}
                      </p>
                      <p className={cx('text-[10px] leading-snug', style.text)}>{message.text}</p>
                    </div>
                  </motion.div>
                );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Pit-to-car: the calls this pit wall actually made. */}
      {pitCalls.length > 0 && (
        <div className="mt-3 border-t border-carbon-600/60 pt-3">
          <p className="eyebrow mb-2">Calls Made</p>
          <AnimatePresence initial={false}>
            {pitCalls.map((entry) => (
              <motion.p
                key={entry.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="font-mono text-[10px] text-chrome-400"
              >
                <span className="text-neon-cyan">▸ {entry.driverCode}</span> — {entry.text}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  );
}
