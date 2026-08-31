import { TYRE_MODEL, WEAR_KNEE, tyreWearPenalty } from './raceEngine';
import type { StintPlan, TyreCompound } from '@/types';

/* =====================================================================
 * Strategy projections.
 *
 * Shares the tyre model with the live race engine so the pit-wall
 * planner and the running simulation never disagree about how quickly
 * a compound goes away.
 * ===================================================================== */

const FUEL_BURN_PER_LAP = 1.92;
const PIT_LOSS_S = 21.5;
/** Wear beyond this point costs disproportionate lap time. */
/* The cliff, as a percentage, taken from the engine's own knee so the
 * two cannot drift apart again. */
export const CLIFF_PCT = Math.round(WEAR_KNEE * 100);

/** A representative lap, for projections made without a circuit. */
const NOMINAL_LAP_MS = 92_000;

export interface StintPoint {
  lap: number;
  wearPct: number;
  /** Lap-time penalty in seconds versus a fresh tyre. */
  lapTimeLossS: number;
}

/** Push level 1-5 maps onto a wear multiplier and a pace bonus. */
export function pushFactors(pushLevel: number) {
  const level = Math.max(1, Math.min(5, pushLevel));
  return {
    wearMultiplier: 0.78 + (level - 1) * 0.18, // 0.78 -> 1.5
    paceGainS: (level - 3) * 0.22, // negative when conserving
  };
}

/**
 * Project wear and lap-time loss across a stint.
 *
 * The curve comes from the engine rather than being restated here. It
 * used to be restated, with a different linear term, a different knee
 * and a different cliff — so the planner was projecting a race nobody
 * was going to run, which is the one thing a planner must never do.
 */
export function projectStint(
  compound: TyreCompound,
  laps: number,
  pushLevel: number,
  startLap = 1,
  startWearPct = 0,
  baseLapMs = NOMINAL_LAP_MS,
): StintPoint[] {
  const model = TYRE_MODEL[compound];
  const { wearMultiplier } = pushFactors(pushLevel);
  const points: StintPoint[] = [];

  for (let i = 0; i <= laps; i++) {
    const wearPct = Math.min(100, startWearPct + i * model.wearPerLap * wearMultiplier);
    points.push({
      lap: startLap + i,
      wearPct,
      lapTimeLossS: (tyreWearPenalty(wearPct) * baseLapMs) / 1000,
    });
  }

  return points;
}

/** Laps a compound can run before hitting the cliff at a given push level. */
export function stintLifeLaps(compound: TyreCompound, pushLevel: number): number {
  const model = TYRE_MODEL[compound];
  const { wearMultiplier } = pushFactors(pushLevel);
  return Math.floor(CLIFF_PCT / (model.wearPerLap * wearMultiplier));
}

export interface PitWindow {
  fromLap: number;
  toLap: number;
  optimalLap: number;
}

/**
 * The window opens once the tyre has given its best and closes at the
 * cliff. The optimum sits where cumulative degradation loss overtakes
 * the cost of the stop itself.
 */
export function pitWindow(
  compound: TyreCompound,
  pushLevel: number,
  stintStartLap: number,
  startWearPct = 0,
): PitWindow {
  const model = TYRE_MODEL[compound];
  const { wearMultiplier } = pushFactors(pushLevel);
  const wearPerLap = model.wearPerLap * wearMultiplier;

  const lapsToCliff = Math.max(1, (CLIFF_PCT - startWearPct) / wearPerLap);
  const fromLap = Math.round(stintStartLap + lapsToCliff * 0.62);
  const toLap = Math.round(stintStartLap + lapsToCliff);
  const optimalLap = Math.round(stintStartLap + lapsToCliff * 0.84);

  return { fromLap, toLap, optimalLap };
}

export function fuelRequiredKg(laps: number, pushLevel: number): number {
  const { wearMultiplier } = pushFactors(pushLevel);
  return Math.ceil(laps * FUEL_BURN_PER_LAP * (0.94 + wearMultiplier * 0.06));
}

export interface RaceProjection {
  totalTimeS: number;
  /** Seconds versus a theoretical zero-degradation, zero-stop run. */
  lossS: number;
  stops: number;
  lapsPlanned: number;
}

/** Rough race-time projection for a stint plan. */
export function projectRace(
  stints: StintPlan[],
  baseLapTimeMs: number,
  pushLevel: number,
): RaceProjection {
  const base = baseLapTimeMs / 1000;
  const { paceGainS } = pushFactors(pushLevel);

  let total = 0;
  let laps = 0;

  for (const stint of stints) {
    const points = projectStint(stint.compound, stint.plannedLaps, pushLevel);
    const compoundOffset = (TYRE_MODEL[stint.compound].paceFactor - 1) * base;

    for (let lap = 0; lap < stint.plannedLaps; lap++) {
      const point = points[lap];
      total += base + compoundOffset + (point?.lapTimeLossS ?? 0) - paceGainS;
      laps += 1;
    }
  }

  const stops = Math.max(0, stints.length - 1);
  total += stops * PIT_LOSS_S;

  return {
    totalTimeS: total,
    lossS: total - laps * base,
    stops,
    lapsPlanned: laps,
  };
}
