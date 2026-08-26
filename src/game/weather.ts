import type { TyreCompound, WeatherKind } from '@/types';
import type { Track } from '@/types/career';

/* =====================================================================
 * Weather, and what it does to a set of tyres.
 *
 * Until now the engine hardcoded a dry afternoon and every track's own
 * forecast was scenery. That made a race weekend almost entirely
 * predictable: the fast car was fast, and nothing else got a vote.
 *
 * The model has one number at its centre — `wetness`, 0 to 1 — because
 * everything a driver cares about follows from how much water is on the
 * track, not from what the sky is doing. Rain drives wetness up quickly;
 * a track dries slowly, and the racing line dries first, which is why a
 * gamble on slicks can look mad for four laps and then win the race.
 *
 * Every compound has a window it works in. Outside that window it is
 * slower, it wears out faster, and it puts the car in the wall — three
 * separate consequences, because a driver on the wrong tyre should be
 * making a visible mistake, not just losing a tenth.
 * ===================================================================== */

/** Above this the track is no longer a slick circuit. */
export const DAMP_THRESHOLD = 0.14;
/** Above this, intermediates are no longer enough. */
export const FLOOD_THRESHOLD = 0.62;

export function isWetCompound(compound: TyreCompound): boolean {
  return compound === 'INTER' || compound === 'WET';
}

/* --------------------------- compound windows -------------------------- */

/**
 * Where each compound wants the track to be, and how far it can stray
 * before it stops working. A slick has almost no tolerance; a wet has a
 * lot, because it is designed for conditions that are changing anyway.
 */
const WINDOW: Record<TyreCompound, { optimum: number; span: number }> = {
  SOFT: { optimum: 0, span: 0.17 },
  MEDIUM: { optimum: 0, span: 0.19 },
  HARD: { optimum: 0, span: 0.21 },
  INTER: { optimum: 0.38, span: 0.32 },
  WET: { optimum: 0.8, span: 0.38 },
};

/** How badly each family suffers per unit outside its window. */
const PACE_SCALE: Record<TyreCompound, number> = {
  SOFT: 0.1,
  MEDIUM: 0.1,
  HARD: 0.095,
  INTER: 0.14,
  WET: 0.13,
};

/** A slick on a soaked track is undriveable, not merely slow. */
const PACE_CAP = 0.85;

function offWindow(compound: TyreCompound, wetness: number): number {
  const { optimum, span } = WINDOW[compound];
  return Math.abs(wetness - optimum) / span;
}

/**
 * Lap-time multiplier for running this compound in these conditions.
 * 1.0 means the tyre is in its window; above that it is the wrong tyre.
 */
export function compoundPaceFactor(compound: TyreCompound, wetness: number): number {
  const off = offWindow(compound, wetness);
  if (off <= 1) {
    // Inside the window the penalty is gentle — this is the usable range.
    return 1 + Math.pow(off, 2) * PACE_SCALE[compound] * 0.5;
  }
  return 1 + Math.min(PACE_CAP, Math.pow(off, 1.7) * PACE_SCALE[compound]);
}

/**
 * Wear multiplier. This is what punishes the opposite mistake: a wet tyre
 * on a drying track does not lose much lap time straight away, it simply
 * destroys itself, and the driver has to come back in.
 */
export function compoundWearFactor(compound: TyreCompound, wetness: number): number {
  if (isWetCompound(compound)) {
    // Water is what cools a wet tyre. Without it they go off in laps.
    const starved = Math.max(0, WINDOW[compound].optimum - wetness);
    return 1 + starved * 4.2;
  }
  // Slicks last longer in the wet — they are not gripping enough to wear.
  return Math.max(0.45, 1 - wetness * 0.7);
}

/**
 * Multiplier on a driver's mistakes. The wrong tyre in the wet is the
 * single most dangerous thing in the model, and it should read that way
 * on the timing screen rather than quietly costing lap time.
 */
export function compoundRiskFactor(compound: TyreCompound, wetness: number): number {
  if (wetness < DAMP_THRESHOLD) return 1;
  const off = offWindow(compound, wetness);
  // Even the right tyre is a handful in a downpour.
  const conditions = 1 + wetness * 0.55;
  return conditions * (1 + Math.max(0, off - 1) * 0.9);
}

/** The tyre a sane engineer would fit for these conditions. */
export function bestCompoundFor(wetness: number, dryChoice: TyreCompound = 'MEDIUM'): TyreCompound {
  if (wetness >= FLOOD_THRESHOLD) return 'WET';
  if (wetness >= DAMP_THRESHOLD) return 'INTER';
  return dryChoice;
}

/** Whether the tyre on the car is plainly the wrong one. */
export function isWrongTyre(compound: TyreCompound, wetness: number): boolean {
  return offWindow(compound, wetness) > 1.25;
}

/* ------------------------------ readouts ------------------------------- */

export function conditionLabel(wetness: number): string {
  if (wetness < 0.04) return 'Dry';
  if (wetness < DAMP_THRESHOLD) return 'Greasy';
  if (wetness < 0.34) return 'Damp';
  if (wetness < FLOOD_THRESHOLD) return 'Wet';
  return 'Standing water';
}

/* --------------------------- the race forecast ------------------------- */

/** One stretch of a race with its own sky. */
export interface WeatherPhase {
  /** Lap this phase takes over. */
  fromLap: number;
  kind: WeatherKind;
  /** Where the track ends up if this phase runs long enough. */
  targetWetness: number;
}

export interface RaceWeather {
  startWetness: number;
  phases: WeatherPhase[];
  airTempC: number;
  trackTempC: number;
  windKph: number;
  /** The chance the forecast was built from, for the briefing to quote. */
  rainChancePct: number;
}

/** Where a given sky settles the track, given long enough. */
const KIND_WETNESS: Record<WeatherKind, number> = {
  DRY: 0,
  CLOUDY: 0,
  LIGHT_RAIN: 0.42,
  HEAVY_RAIN: 0.88,
};

/** Rain arrives far faster than a track dries out. */
export const WETTING_RATE_PER_LAP = 0.14;
export const DRYING_RATE_PER_LAP = 0.045;

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The weather for one race, rolled from the circuit's own forecast.
 *
 * Deterministic on season and round, so reloading a save cannot fish for
 * a dry afternoon. A weekend can start wet and dry out, start dry and get
 * caught, or do both — and because the change lands on a specific lap
 * rather than gradually, everybody has to react to it at once.
 */
export function rollRaceWeather(
  track: Track,
  season: number,
  round: number,
  totalLaps: number,
): RaceWeather {
  const forecast = track.forecast;
  const key = `${season}:${round}:${track.id}`;
  const r1 = hash(key + 'start');
  const r2 = hash(key + 'change');
  const r3 = hash(key + 'lap');
  const r4 = hash(key + 'kind');

  const chance = forecast.rainChancePct / 100;

  /* Does it rain at the start? The forecast kind is what the player was
   * shown all weekend, so it has to be the strongest signal. */
  const startsWet = r1 < chance * 0.75;
  const startKind: WeatherKind = startsWet
    ? forecast.kind === 'HEAVY_RAIN' || r4 > 0.62
      ? 'HEAVY_RAIN'
      : 'LIGHT_RAIN'
    : forecast.kind === 'HEAVY_RAIN' || forecast.kind === 'LIGHT_RAIN'
      ? 'CLOUDY'
      : forecast.kind;

  const phases: WeatherPhase[] = [
    { fromLap: 0, kind: startKind, targetWetness: KIND_WETNESS[startKind] },
  ];

  /* And does it change during the race? A dry race under a big rain
   * chance is exactly where a mid-race shower belongs. */
  const changeChance = startsWet ? 0.55 : chance * 0.9;
  if (r2 < changeChance && totalLaps >= 6) {
    // Never on the opening laps or the last one — both are unfair rather
    // than dramatic, and neither leaves time to respond.
    const earliest = Math.max(2, Math.round(totalLaps * 0.18));
    const latest = Math.max(earliest + 1, Math.round(totalLaps * 0.78));
    const fromLap = earliest + Math.floor(r3 * (latest - earliest));

    const nextKind: WeatherKind = startsWet
      ? 'CLOUDY'
      : r4 > 0.55
        ? 'HEAVY_RAIN'
        : 'LIGHT_RAIN';

    phases.push({ fromLap, kind: nextKind, targetWetness: KIND_WETNESS[nextKind] });
  }

  return {
    startWetness: KIND_WETNESS[startKind],
    phases,
    airTempC: forecast.airTempC,
    trackTempC: startsWet ? Math.round(forecast.trackTempC * 0.72) : forecast.trackTempC,
    windKph: forecast.windKph,
    rainChancePct: forecast.rainChancePct,
  };
}

/** The phase in force on a given lap. */
export function phaseAtLap(weather: RaceWeather, lap: number): WeatherPhase {
  let active = weather.phases[0]!;
  for (const phase of weather.phases) {
    if (lap >= phase.fromLap) active = phase;
  }
  return active;
}

/** Moves the track one lap towards where the current sky is taking it. */
export function stepWetness(current: number, target: number): number {
  if (Math.abs(target - current) < 0.005) return target;
  const rate = target > current ? WETTING_RATE_PER_LAP : DRYING_RATE_PER_LAP;
  const next = target > current ? Math.min(target, current + rate) : Math.max(target, current - rate);
  return Math.round(next * 1000) / 1000;
}

/**
 * A dry race with no change in it. Used by the standalone demo session,
 * which has no career forecast behind it.
 */
export function dryWeather(): RaceWeather {
  return {
    startWetness: 0,
    phases: [{ fromLap: 0, kind: 'DRY', targetWetness: 0 }],
    airTempC: 24,
    trackTempC: 41,
    windKph: 9,
    rainChancePct: 0,
  };
}
