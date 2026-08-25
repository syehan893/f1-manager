import type { CarStats } from '@/data/grid2026';
import type { PartCategory, PartState, PowerUnitState, TeamSeasonState } from './types';

/* =====================================================================
 * The car as an assembly of parts.
 *
 * Car statistics used to be the thing you bought: money went in and the
 * aero number went up. That made development a slider rather than a
 * programme, and it left the power unit — the one component a season is
 * actually planned around — with no existence of its own.
 *
 * So the stats are now *derived*. Fourteen parts are the source of
 * truth, each carrying a development level, and `assembleCar` folds them
 * into the `CarStats` the race engine, qualifying and every rating
 * already read. Nothing downstream changed; what changed is that a
 * number on a screen is now the consequence of a part somewhere.
 *
 * The power unit sits on top of that: it is not merely a set of levels
 * but a physical object with mileage on it, and a worn one gives back
 * less power and breaks more often than the spec sheet says.
 * ===================================================================== */

/* ------------------------------ the parts ------------------------------ */

export interface PartDefinition {
  id: PartCategory;
  label: string;
  group: 'POWER_UNIT' | 'AERODYNAMICS' | 'MECHANICAL';
  /** What developing it actually buys, in one line. */
  effect: string;
  /**
   * Relative cost of a development step. The power unit is expensive and
   * slow; a front wing is neither, which is why real teams bring wings to
   * every race and a new engine spec twice a year.
   */
  costFactor: number;
  /** Weeks a single development step takes at normal intensity. */
  baseWeeks: number;
}

export const PARTS: PartDefinition[] = [
  {
    id: 'ICE',
    label: 'Internal Combustion Engine',
    group: 'POWER_UNIT',
    effect: 'Straight-line power, and most of the power unit rating.',
    costFactor: 1.9,
    baseWeeks: 8,
  },
  {
    id: 'TURBO',
    label: 'Turbocharger',
    group: 'POWER_UNIT',
    effect: 'Throttle response and top-end boost.',
    costFactor: 1.5,
    baseWeeks: 6,
  },
  {
    id: 'MGU_K',
    label: 'MGU-K',
    group: 'POWER_UNIT',
    effect: 'Deployment and recovery under braking.',
    costFactor: 1.5,
    baseWeeks: 6,
  },
  {
    id: 'MGU_H',
    label: 'MGU-H',
    group: 'POWER_UNIT',
    effect: 'Heat recovery — half the energy budget under the 2026 rules.',
    costFactor: 1.6,
    baseWeeks: 7,
  },
  {
    id: 'ENERGY_STORE',
    label: 'Energy Store',
    group: 'POWER_UNIT',
    effect: 'How much can be deployed, and how consistently.',
    costFactor: 1.3,
    baseWeeks: 5,
  },
  {
    id: 'CHASSIS',
    label: 'Chassis',
    group: 'MECHANICAL',
    effect: 'The platform everything else is bolted to. Lifts overall pace.',
    costFactor: 1.8,
    baseWeeks: 9,
  },
  {
    id: 'SUSPENSION',
    label: 'Suspension',
    group: 'MECHANICAL',
    effect: 'Mechanical grip, kerb behaviour and tyre life.',
    costFactor: 1.1,
    baseWeeks: 5,
  },
  {
    id: 'BRAKES',
    label: 'Brake System',
    group: 'MECHANICAL',
    effect: 'Stopping power and stability under braking.',
    costFactor: 0.9,
    baseWeeks: 4,
  },
  {
    id: 'GEARBOX',
    label: 'Gearbox',
    group: 'MECHANICAL',
    effect: 'Shift losses and traction out of slow corners.',
    costFactor: 1.2,
    baseWeeks: 6,
  },
  {
    id: 'FRONT_WING',
    label: 'Front Wing',
    group: 'AERODYNAMICS',
    effect: 'Front-end load and how the floor is fed.',
    costFactor: 0.7,
    baseWeeks: 3,
  },
  {
    id: 'REAR_WING',
    label: 'Rear Wing',
    group: 'AERODYNAMICS',
    effect: 'Rear load and straight-line efficiency.',
    costFactor: 0.7,
    baseWeeks: 3,
  },
  {
    id: 'FLOOR',
    label: 'Floor',
    group: 'AERODYNAMICS',
    effect: 'The largest single source of downforce on the car.',
    costFactor: 1.4,
    baseWeeks: 6,
  },
  {
    id: 'ACTIVE_AERO',
    label: 'Active Aerodynamics',
    group: 'AERODYNAMICS',
    effect: 'How much of the lap is spent in the low-drag mode.',
    costFactor: 1.1,
    baseWeeks: 5,
  },
  {
    id: 'COOLING',
    label: 'Cooling Package',
    group: 'AERODYNAMICS',
    effect: 'Thermal headroom — how hard the package can be run.',
    costFactor: 0.9,
    baseWeeks: 4,
  },
];

export const PART_BY_ID = new Map(PARTS.map((part) => [part.id, part]));

export const PART_CATEGORIES: PartCategory[] = PARTS.map((part) => part.id);

/** The five parts that make up a power unit. */
export const POWER_UNIT_PARTS: PartCategory[] = [
  'ICE',
  'TURBO',
  'MGU_K',
  'MGU_H',
  'ENERGY_STORE',
];

/* --------------------------- how stats derive -------------------------- */

/**
 * Weights folding part levels into each car statistic. Every stat's
 * weights sum to one, so a car whose parts are all at 90 rates 90 — which
 * is what makes seeding the existing grid from its current stats exact.
 */
const CONTRIBUTIONS: Record<keyof Omit<CarStats, 'pitCrew'>, Partial<Record<PartCategory, number>>> = {
  powerUnit: { ICE: 0.58, TURBO: 0.42 },
  electrical: { MGU_K: 0.35, MGU_H: 0.31, ENERGY_STORE: 0.34 },
  aero: { FRONT_WING: 0.26, REAR_WING: 0.22, FLOOR: 0.34, ACTIVE_AERO: 0.18 },
  brakes: { BRAKES: 1 },
  suspension: { SUSPENSION: 0.72, CHASSIS: 0.28 },
  cooling: { COOLING: 1 },
  // Reliability is the whole car's build quality, weighted to the parts
  // that actually strand a car when they let go.
  reliability: {
    ICE: 0.18,
    TURBO: 0.1,
    MGU_K: 0.09,
    MGU_H: 0.09,
    ENERGY_STORE: 0.08,
    GEARBOX: 0.14,
    CHASSIS: 0.12,
    SUSPENSION: 0.08,
    BRAKES: 0.07,
    COOLING: 0.05,
  },
  // Single-lap pace is the integrated result rather than a thing you buy.
  pace: {
    CHASSIS: 0.26,
    FLOOR: 0.16,
    FRONT_WING: 0.08,
    REAR_WING: 0.07,
    ICE: 0.15,
    TURBO: 0.06,
    MGU_K: 0.06,
    ENERGY_STORE: 0.04,
    SUSPENSION: 0.07,
    GEARBOX: 0.05,
  },
};

const clampStat = (value: number) => Math.max(1, Math.min(99, value));

function levelOf(parts: PartState[], category: PartCategory): number {
  return parts.find((part) => part.category === category)?.level ?? 60;
}

function derive(
  parts: PartState[],
  weights: Partial<Record<PartCategory, number>>,
): number {
  let total = 0;
  for (const [category, weight] of Object.entries(weights)) {
    total += levelOf(parts, category as PartCategory) * (weight ?? 0);
  }
  return total;
}

/**
 * How much of a worn power unit's paper performance is still there. A
 * unit at the end of its life gives back noticeably less than a fresh
 * one, which is why running an old engine is a decision and not just an
 * accounting exercise.
 */
export function engineHealthFactor(unit: PowerUnitState | null): number {
  if (!unit) return 0.9;
  return 0.86 + (unit.healthPct / 100) * 0.14;
}

/**
 * Fold parts and the fitted power unit into the statistics every other
 * system reads. This is the only place car numbers come from.
 */
export function assembleCar(
  parts: PartState[],
  fittedUnit: PowerUnitState | null,
  pitCrew: number,
): CarStats {
  const health = engineHealthFactor(fittedUnit);

  /* A tired unit costs power and energy directly, and reliability by
   * rather more — it is the wear itself that strands the car. */
  const powerUnit = derive(parts, CONTRIBUTIONS.powerUnit) * health;
  const electrical = derive(parts, CONTRIBUTIONS.electrical) * (0.94 + health * 0.06);
  const reliability =
    derive(parts, CONTRIBUTIONS.reliability) * (fittedUnit ? 0.72 + (fittedUnit.healthPct / 100) * 0.28 : 1);

  return {
    pace: clampStat(derive(parts, CONTRIBUTIONS.pace) * (0.97 + health * 0.03)),
    aero: clampStat(derive(parts, CONTRIBUTIONS.aero)),
    powerUnit: clampStat(powerUnit),
    electrical: clampStat(electrical),
    reliability: clampStat(reliability),
    pitCrew: clampStat(pitCrew),
    brakes: clampStat(derive(parts, CONTRIBUTIONS.brakes)),
    suspension: clampStat(derive(parts, CONTRIBUTIONS.suspension)),
    cooling: clampStat(derive(parts, CONTRIBUTIONS.cooling)),
  };
}

/* ------------------------------- seeding ------------------------------- */

/**
 * Build a starting parts list from a team's published statistics, so a
 * new career opens with exactly the grid the data file describes. Each
 * part is seeded from the stat it dominates; `CHASSIS` is solved for
 * last so that single-lap pace comes out where it started.
 */
export function seedParts(stats: CarStats): PartState[] {
  const seed: Record<PartCategory, number> = {
    ICE: stats.powerUnit,
    TURBO: stats.powerUnit,
    MGU_K: stats.electrical,
    MGU_H: stats.electrical,
    ENERGY_STORE: stats.electrical,
    FRONT_WING: stats.aero,
    REAR_WING: stats.aero,
    FLOOR: stats.aero,
    ACTIVE_AERO: stats.aero,
    BRAKES: stats.brakes,
    COOLING: stats.cooling,
    SUSPENSION: stats.suspension,
    GEARBOX: (stats.powerUnit + stats.suspension) / 2,
    CHASSIS: stats.suspension,
  };

  /* Solve the chassis level so the pace weighting reproduces the
   * published figure. Everything else is already pinned by the stat it
   * was seeded from, so the chassis is the one free variable left. */
  const paceWeights = CONTRIBUTIONS.pace;
  const chassisWeight = paceWeights.CHASSIS ?? 0.26;
  let others = 0;
  for (const [category, weight] of Object.entries(paceWeights)) {
    if (category === 'CHASSIS') continue;
    others += seed[category as PartCategory] * (weight ?? 0);
  }
  seed.CHASSIS = Math.max(30, Math.min(99, (stats.pace - others) / chassisWeight));

  return PART_CATEGORIES.map((category) => ({
    category,
    level: Math.round(seed[category] * 10) / 10,
    variantId: null,
  }));
}

/* ---------------------------- power units ------------------------------ */

/** Units a team may use in a season before penalties start. */
export const ENGINE_ALLOCATION = 4;
/** Grid places dropped for each unit taken beyond the allocation. */
export const ENGINE_PENALTY_PLACES = 5;

/** Health lost per racing lap, before push and reliability are counted. */
export const ENGINE_WEAR_PER_RACE_LAP = 1.15;

export function buildPowerUnit(
  parts: PartState[],
  season: number,
  index: number,
): PowerUnitState {
  return {
    id: `pu-${season}-${index}`,
    builtInSeason: season,
    // The spec is frozen at build time: developing the ICE tomorrow does
    // not improve an engine already sitting on the shelf.
    spec: Object.fromEntries(
      POWER_UNIT_PARTS.map((category) => [category, levelOf(parts, category)]),
    ) as PowerUnitState['spec'],
    mileageLaps: 0,
    healthPct: 100,
    status: 'POOL',
  };
}

/**
 * What a fresh unit costs to build. A better spec is a more expensive
 * object, and the fifth unit of a season costs more than the first
 * because it is being built outside the planned run.
 */
export function powerUnitCost(team: TeamSeasonState): number {
  const spec =
    POWER_UNIT_PARTS.reduce((sum, category) => sum + levelOf(team.parts, category), 0) /
    POWER_UNIT_PARTS.length;
  const builtThisSeason = team.powerUnits.length;
  const rushed = builtThisSeason >= ENGINE_ALLOCATION ? 1.5 : 1;
  const base = 2_600_000 + Math.pow(Math.max(0, spec - 55) / 45, 2) * 9_000_000;
  return Math.round((base * rushed) / 100_000) * 100_000;
}

/** The unit currently in the car, if any. */
export function fittedUnit(team: TeamSeasonState): PowerUnitState | null {
  return team.powerUnits.find((unit) => unit.id === team.fittedPowerUnitId) ?? null;
}

/** Units still usable — not scrapped. */
export function usableUnits(team: TeamSeasonState): PowerUnitState[] {
  return team.powerUnits.filter((unit) => unit.status !== 'RETIRED');
}

/**
 * Grid penalty a team is currently carrying, in places. Taking a fifth
 * power unit is legal; it just costs you a Saturday.
 */
export function enginePenaltyPlaces(team: TeamSeasonState, season: number): number {
  const usedThisSeason = team.powerUnits.filter((unit) => unit.builtInSeason === season).length;
  const excess = Math.max(0, usedThisSeason - ENGINE_ALLOCATION);
  return excess * ENGINE_PENALTY_PLACES;
}

/** The average spec of a unit, for display against the current parts. */
export function unitSpecRating(unit: PowerUnitState): number {
  const values = Object.values(unit.spec);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Recompute a team's cached statistics from its parts and fitted unit.
 * Called wherever parts or engine health change, so `team.car` is never
 * stale and nothing downstream has to know parts exist.
 */
export function refreshCar(team: TeamSeasonState): void {
  team.car = assembleCar(team.parts, fittedUnit(team), team.car.pitCrew);
}
