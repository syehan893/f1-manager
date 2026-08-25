import { useMemo } from 'react';
import { Activity, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { TelemetryChart } from '@/components/ui/TelemetryChart';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TYRE_MODEL } from '@/engine/raceEngine';
import { lapsOfLifeLeft } from '@/game/driverRadio';
import { TYRE_COLOR, cx, formatLapTime } from '@/lib/format';
import { useRace } from '@/state/raceContext';
import type { CarState, RaceState, TelemetrySample } from '@/types';

/* =====================================================================
 * Session telemetry.
 *
 * The traces the pit wall watches between decisions. The design rule is
 * that every number on this panel should answer a question the player is
 * about to have to act on — how long can this stint go, is the car
 * quicker or slower than it was, will the fuel reach the flag, is the
 * engine going to make it — rather than simply reporting a value.
 *
 * So the readouts carry a projection and a direction of travel, not just
 * a current figure, and each trace says in one line what shape of it
 * means what.
 * ===================================================================== */

type TraceId = 'PACE' | 'TYRE' | 'FUEL' | 'ENERGY';

const TRACES: Array<{ id: TraceId; label: string }> = [
  { id: 'PACE', label: 'Pace' },
  { id: 'TYRE', label: 'Tyres' },
  { id: 'FUEL', label: 'Fuel' },
  { id: 'ENERGY', label: 'Speed' },
];

/* ------------------------------ readouts ------------------------------- */

type Trend = 'UP' | 'DOWN' | 'FLAT';

function TrendIcon({ trend, good }: { trend: Trend; good: 'UP' | 'DOWN' }) {
  if (trend === 'FLAT') return <Minus className="size-2.5 text-chrome-600" />;
  const positive = trend === good;
  const tone = positive ? 'var(--color-neon-lime)' : 'var(--color-neon-red)';
  const Icon = trend === 'UP' ? ArrowUp : ArrowDown;
  return <Icon className="size-2.5" style={{ color: tone }} />;
}

/**
 * A readout with the thing the player actually needs underneath it: what
 * the number means for the rest of the race.
 */
function Readout({
  label,
  value,
  unit,
  tone,
  detail,
  trend,
  good,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: string;
  detail: string;
  trend?: Trend;
  good?: 'UP' | 'DOWN';
}) {
  return (
    <div className="rounded-md border border-carbon-600/70 bg-carbon-950/40 px-2 py-1.5">
      <p className="flex items-center gap-1 truncate text-[8px] tracking-widest text-chrome-600 uppercase">
        {label}
        {trend && good && <TrendIcon trend={trend} good={good} />}
      </p>
      <p className="mt-0.5 font-mono text-[13px] font-bold" style={{ color: tone }}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] font-normal opacity-70">{unit}</span>}
      </p>
      <p className="truncate text-[8.5px] leading-tight text-chrome-600">{detail}</p>
    </div>
  );
}

/* ------------------------------- traces -------------------------------- */

interface TraceSpec {
  series: Array<{ id: string; color: string; data: number[]; area?: boolean }>;
  yMin: number;
  yMax: number;
  yLabels: string[];
  caption: string;
  thresholds?: Array<{ value: number; color: string; label?: string }>;
}

function traceFor(
  trace: TraceId,
  samples: TelemetrySample[],
  car: CarState,
  snapshot: RaceState,
): TraceSpec {
  switch (trace) {
    case 'TYRE': {
      const model = TYRE_MODEL[car.tyre.compound];
      const perLap = model.wearPerLap * snapshot.tyreWearScale;
      return {
        series: [
          {
            id: 'wear',
            color: TYRE_COLOR[car.tyre.compound],
            data: samples.map((s) => s.tyreWearPct),
            area: true,
          },
        ],
        yMin: 0,
        yMax: 100,
        yLabels: ['100%', '50%', '0%'],
        // The cliff is the only number on this chart that matters.
        thresholds: [{ value: 72, color: 'var(--color-neon-red)', label: 'cliff' }],
        caption: `${car.tyre.compound.toLowerCase()} · ${perLap.toFixed(1)}%/lap at this distance · the red line is where it falls away`,
      };
    }
    case 'FUEL': {
      const lapsLeft = Math.max(0, snapshot.totalLaps - car.lap);
      const needed = lapsLeft * 1.92;
      return {
        series: [
          {
            id: 'fuel',
            color: 'var(--color-neon-amber)',
            data: samples.map((s) => s.fuelKg),
            area: true,
          },
        ],
        yMin: 0,
        yMax: 110,
        yLabels: ['110kg', '55kg', '0kg'],
        thresholds: [
          { value: needed, color: 'var(--color-neon-red)', label: 'to finish' },
        ],
        caption: `${needed.toFixed(0)}kg needed for the remaining ${lapsLeft} laps — the red line is the flag`,
      };
    }
    case 'ENERGY':
      return {
        series: [
          { id: 'speed', color: 'var(--color-neon-cyan)', data: samples.map((s) => s.speedKph) },
          {
            id: 'throttle',
            color: 'var(--color-neon-lime)',
            data: samples.map((s) => s.throttlePct * 3),
          },
          {
            id: 'brake',
            color: 'var(--color-neon-red)',
            data: samples.map((s) => s.brakePct * 3),
          },
        ],
        yMin: 0,
        yMax: 330,
        yLabels: ['330', '165', '0'],
        caption:
          'speed in cyan, throttle in green, brake in red — a flat line at zero is a pit stop',
      };
    case 'PACE':
    default: {
      /* A relative pace index: what the tyres and the fuel load are doing
       * to the lap time. The shape is the pit window — when the line has
       * fallen far enough, staying out costs more than stopping. */
      const data = samples.map((s) => 100 - s.tyreWearPct * 0.42 - (110 - s.fuelKg) * 0.16);
      return {
        series: [{ id: 'pace', color: 'var(--color-neon-violet)', data, area: true }],
        yMin: 30,
        yMax: 105,
        yLabels: ['fast', '', 'slow'],
        caption:
          'relative pace as the tyres go away and the fuel burns off — when the line dives, the stop is due',
      };
    }
  }
}

/* -------------------------------- panel -------------------------------- */

export function SessionTelemetry({
  trace,
  onTraceChange,
  className,
}: {
  trace: TraceId;
  onTraceChange: (trace: TraceId) => void;
  className?: string;
}) {
  const { snapshot, focusedDriverId } = useRace();

  const car = snapshot.cars.find((entry) => entry.driverId === focusedDriverId);
  /* Read the buffer inside the memo rather than outside it: the `?? []`
   * fallback would otherwise be a fresh array on every render and defeat
   * the memo entirely. */
  const samples = snapshot.telemetry[focusedDriverId];

  const chart = useMemo(
    () => (car ? traceFor(trace, samples ?? [], car, snapshot) : null),
    [trace, samples, car, snapshot],
  );

  /** Direction of travel over the last stretch of the buffer. */
  const trends = useMemo(() => {
    const buffer = samples ?? [];
    if (buffer.length < 12) return null;
    const recent = buffer.slice(-8);
    const earlier = buffer.slice(-20, -12);
    if (earlier.length === 0) return null;

    const mean = (rows: TelemetrySample[], pick: (s: TelemetrySample) => number) =>
      rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;

    const direction = (now: number, before: number, epsilon: number): Trend =>
      now - before > epsilon ? 'UP' : before - now > epsilon ? 'DOWN' : 'FLAT';

    return {
      speed: direction(
        mean(recent, (s) => s.speedKph),
        mean(earlier, (s) => s.speedKph),
        3,
      ),
      wear: direction(
        mean(recent, (s) => s.tyreWearPct),
        mean(earlier, (s) => s.tyreWearPct),
        0.6,
      ),
    };
  }, [samples]);

  if (!car || !chart) {
    return (
      <p className="py-6 text-center text-[11px] text-chrome-500">
        Select a car to see its telemetry.
      </p>
    );
  }

  const latest = samples?.[samples.length - 1];
  const lifeLeft = lapsOfLifeLeft(car, snapshot.tyreWearScale);
  const lapsLeft = Math.max(0, snapshot.totalLaps - car.lap);
  const fuelNeeded = lapsLeft * 1.92;

  /* The two projections that decide the next call: can this set reach the
   * flag, and can the fuel. Both are stated as an answer, not a value. */
  const tyreReachesEnd = lifeLeft >= lapsLeft;
  const fuelReachesEnd = car.fuelKg >= fuelNeeded;

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

  return (
    <div className={cx('mt-3 border-t border-carbon-600/60 pt-3', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <Activity className="size-3" /> Telemetry
          <span className="font-mono text-[9px] font-normal tracking-normal text-chrome-600 normal-case">
            · lap {car.lap + 1}/{snapshot.totalLaps}
          </span>
        </p>
        <SegmentedControl
          name="session-telemetry"
          size="sm"
          value={trace}
          onChange={onTraceChange}
          options={TRACES.map((entry) => ({ value: entry.id, label: entry.label }))}
        />
      </div>

      {/* Six readouts, each with what it means for the rest of the race. */}
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <Readout
          label="Last lap"
          value={car.lastLapMs ? formatLapTime(car.lastLapMs) : '—'}
          tone="var(--color-chrome-100)"
          detail={
            car.bestLapMs && car.lastLapMs
              ? `${car.lastLapMs > car.bestLapMs ? '+' : ''}${((car.lastLapMs - car.bestLapMs) / 1000).toFixed(2)}s to best`
              : 'no reference yet'
          }
        />
        <Readout
          label="Speed"
          value={latest ? Math.round(latest.speedKph).toString() : '—'}
          unit="kph"
          tone="var(--color-neon-cyan)"
          detail={car.status === 'IN_PIT' ? 'stationary in the box' : 'current trace'}
          trend={trends?.speed}
          good="UP"
        />
        <Readout
          label="Tyre life"
          value={Math.round(lifeLeft).toString()}
          unit="L"
          tone={tyreTone}
          detail={
            tyreReachesEnd
              ? `reaches the flag (${lapsLeft} to go)`
              : `${lapsLeft - Math.round(lifeLeft)} laps short — a stop is coming`
          }
          trend={trends?.wear}
          good="DOWN"
        />
        <Readout
          label="Fuel"
          value={car.fuelKg.toFixed(1)}
          unit="kg"
          tone={fuelReachesEnd ? 'var(--color-neon-amber)' : 'var(--color-neon-red)'}
          detail={
            fuelReachesEnd
              ? `${(car.fuelKg - fuelNeeded).toFixed(1)}kg in hand`
              : `${(fuelNeeded - car.fuelKg).toFixed(1)}kg short — lift and coast`
          }
        />
        <Readout
          label="Energy"
          value={Math.round(car.ersPct).toString()}
          unit="%"
          tone="var(--color-neon-violet)"
          detail={
            car.boosting
              ? 'deploying — draining fast'
              : car.ersPct < 12
                ? 'too low to arm the override'
                : 'harvesting'
          }
        />
        <Readout
          label="Engine"
          value={Math.round(100 - car.engineWearPct).toString()}
          unit="%"
          tone={engineTone}
          detail={
            car.engineWearPct >= 88
              ? 'failure imminent — back off'
              : car.engineWearPct >= 58
                ? 'in the danger band'
                : 'healthy'
          }
        />
      </div>

      <TelemetryChart
        series={chart.series}
        height={92}
        yMin={chart.yMin}
        yMax={chart.yMax}
        yLabels={chart.yLabels}
        thresholds={chart.thresholds}
        showEndDot
        grid
      />

      <p className="mt-1.5 text-[9px] leading-relaxed text-chrome-600">{chart.caption}</p>
    </div>
  );
}

export type { TraceId };
