import type { FacilityState, GameState, RndArea } from './types';

/* =====================================================================
 * Facilities.
 *
 * A facility that only shows a level number is a progress bar wearing a
 * costume. Every building here changes a specific number somewhere else
 * in the game — how far a million goes in R&D, how long a build takes,
 * how much a sponsor pays, how fast the crew is on a Sunday — and the
 * upkeep for all of it is charged every round.
 *
 * That is the trade: a bigger factory makes you better and poorer at the
 * same time, so expanding is a decision rather than a formality.
 * ===================================================================== */

export interface FacilityDefinition {
  id: string;
  name: string;
  /** What the building is. */
  description: string;
  /** What each level actually does, in one line. */
  effect: string;
  startLevel: number;
  maxLevel: number;
  /** Base cost of the first upgrade; each level costs progressively more. */
  baseCost: number;
  /** R&D area this facility makes cheaper, if any. */
  boosts?: RndArea;
}

export const FACILITY_DEFINITIONS: FacilityDefinition[] = [
  {
    id: 'windtunnel',
    name: 'Wind Tunnel',
    description: 'Sixty-percent scale tunnel running around the clock.',
    effect: '+6% aerodynamic return on every pound spent in R&D per level.',
    startLevel: 3,
    maxLevel: 6,
    baseCost: 3_400_000,
    boosts: 'aero',
  },
  {
    id: 'cfd-cluster',
    name: 'CFD Cluster',
    description: 'Compute allocation for simulation the tunnel cannot cover.',
    effect: '+5% suspension and cooling return per level.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 2_600_000,
    boosts: 'suspension',
  },
  {
    id: 'engine-dyno',
    name: 'Engine Dyno',
    description: 'Power-unit test cells for the combustion side.',
    effect: '+6% power-unit return per level.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 3_100_000,
    boosts: 'powerUnit',
  },
  {
    id: 'battery-lab',
    name: 'Energy Lab',
    description: 'Cell chemistry and deployment software under one roof.',
    effect: '+6% electrical return per level.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 2_900_000,
    boosts: 'electrical',
  },
  {
    id: 'factory',
    name: 'Composites Factory',
    description: 'Autoclaves and machining for everything the car is made of.',
    effect: 'Cuts one week off component builds every two levels.',
    startLevel: 3,
    maxLevel: 6,
    baseCost: 3_800_000,
  },
  {
    id: 'simulator',
    name: 'Driver Simulator',
    description: 'Full-motion rig the drivers live in between rounds.',
    effect: '+1.5% qualifying performance per level above three.',
    startLevel: 3,
    maxLevel: 6,
    baseCost: 2_400_000,
  },
  {
    id: 'pitcrew-bay',
    name: 'Pit Crew Bay',
    description: 'Practice bay where the stop is drilled to the tenth.',
    effect: '+2 pit crew rating per level, applied on completion.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 1_900_000,
    boosts: 'pitCrew',
  },
  {
    id: 'academy',
    name: 'Driver Academy',
    description: 'Junior programme feeding the second seat.',
    effect: 'Cuts 8% off transfer fees per level — you develop, not buy.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 2_200_000,
  },
  {
    id: 'marketing',
    name: 'Marketing Division',
    description: 'The people who turn results into signatures.',
    effect: '+7% on every sponsor payment per level.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 2_800_000,
  },
  {
    id: 'logistics',
    name: 'Logistics Hub',
    description: 'Freight, hospitality and the travelling circus.',
    effect: 'Cuts 6% off race operating costs per level.',
    startLevel: 2,
    maxLevel: 6,
    baseCost: 2_000_000,
  },
];

export const FACILITY_BY_ID = new Map(FACILITY_DEFINITIONS.map((f) => [f.id, f]));

export const DEFAULT_FACILITIES: FacilityState[] = FACILITY_DEFINITIONS.map((f) => ({
  id: f.id,
  level: f.startLevel,
  maxLevel: f.maxLevel,
}));

/**
 * Each level costs more than the last, so the top of a building is a
 * genuine commitment rather than a rounding error late in a career.
 */
export function facilityUpgradeCost(facility: FacilityState): number {
  const definition = FACILITY_BY_ID.get(facility.id);
  const base = definition?.baseCost ?? 3_000_000;
  return Math.round(base * Math.pow(1.55, facility.level - 2));
}

function levelOf(state: GameState, id: string): number {
  return state.facilities.find((facility) => facility.id === id)?.level ?? 0;
}

/* ------------------------------- effects ------------------------------- */

/**
 * Multiplier on R&D points bought in an area. A maxed wind tunnel turns
 * the same money into meaningfully more downforce.
 */
export function rndEfficiency(state: GameState, area: RndArea): number {
  const direct = FACILITY_DEFINITIONS.find((f) => f.boosts === area);
  let multiplier = 1;

  if (direct) {
    const rate = direct.id === 'cfd-cluster' ? 0.05 : 0.06;
    multiplier += (levelOf(state, direct.id) - direct.startLevel) * rate;
  }

  // The CFD cluster covers two areas; suspension is its declared boost,
  // cooling rides along with it.
  if (area === 'cooling') {
    multiplier += (levelOf(state, 'cfd-cluster') - 2) * 0.05;
  }
  // Reliability and brakes have no dedicated building; the factory floor
  // is what makes those parts better.
  if (area === 'reliability' || area === 'brakes') {
    multiplier += (levelOf(state, 'factory') - 3) * 0.04;
  }

  return Math.max(0.6, multiplier);
}

/** Weeks knocked off a component build by the factory. */
export function buildTimeReduction(state: GameState): number {
  return Math.floor((levelOf(state, 'factory') - 3) / 2) + (levelOf(state, 'factory') >= 6 ? 1 : 0);
}

/** Fractional pace gain applied to the player's cars in qualifying. */
export function simulatorEdge(state: GameState): number {
  return Math.max(0, (levelOf(state, 'simulator') - 3) * 0.015);
}

/** Multiplier on every sponsor payment. */
export function marketingMultiplier(state: GameState): number {
  return 1 + Math.max(0, levelOf(state, 'marketing') - 2) * 0.07;
}

/** Multiplier on the round operating cost. */
export function logisticsMultiplier(state: GameState): number {
  return Math.max(0.6, 1 - Math.max(0, levelOf(state, 'logistics') - 2) * 0.06);
}

/** Multiplier on transfer fees — a strong academy buys less often. */
export function academyDiscount(state: GameState): number {
  return Math.max(0.5, 1 - Math.max(0, levelOf(state, 'academy') - 2) * 0.08);
}

/** Pit crew rating added when the bay finishes a level. */
export function pitCrewGainPerLevel(): number {
  return 2;
}
