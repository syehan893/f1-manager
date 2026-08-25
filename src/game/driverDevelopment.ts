import { DRIVER_BY_ID } from '@/data/drivers';
import { driverRating } from '@/data/grid2026';
import type { Driver, DriverAttributes } from '@/types';
import type { DriverRecord, GameState, ProspectDriver } from './types';

/* =====================================================================
 * Driver development.
 *
 * The grid data file is a snapshot of one season, not a career. Left
 * alone, a nineteen-year-old is still a nineteen-year-old in 2040 and a
 * forty-four-year-old never slows down, which makes the driver market a
 * shopping list rather than a judgement.
 *
 * This module is the overlay that fixes that. The static roster stays the
 * starting point; the save carries a record per driver holding their real
 * age and how far they have moved from where they began. Everything that
 * asks "how good is this driver" goes through here.
 *
 * The curve has three parts, which is roughly how a real career reads:
 *
 *   before ~24   improving quickly, and faster with running and results
 *   24 to ~31    at their level, moving only on form
 *   after ~32    losing a little every year, and more of it each year
 *
 * Results matter on top of age: a driver beating the car develops faster
 * than one being beaten by it, so a good seat is worth something to them
 * and a young signing is a genuine investment.
 * ===================================================================== */

const GROWTH_UNTIL_AGE = 24;
const DECLINE_FROM_AGE = 32;
/** Hard ceiling on how far any driver can drift from their base rating. */
const MAX_DELTA = 14;

/* ------------------------------ the record ----------------------------- */

export function blankRecord(driverId: string, age: number): DriverRecord {
  return {
    driverId,
    age,
    formDelta: 0,
    seasonsRun: 0,
    careerPoints: 0,
    careerWins: 0,
    careerPodiums: 0,
  };
}

/** Records for the whole grid at the start of a career. */
export function seedDriverRecords(driverIds: string[]): Record<string, DriverRecord> {
  return Object.fromEntries(
    driverIds.map((id) => [id, blankRecord(id, DRIVER_BY_ID[id]?.age ?? 26)]),
  );
}

/* --------------------------- resolving a driver ------------------------ */

function shiftAttributes(base: DriverAttributes, delta: number): DriverAttributes {
  const move = (value: number) => Math.max(30, Math.min(99, Math.round(value + delta)));
  return {
    ...base,
    pace: move(base.pace),
    cornering: move(base.cornering),
    braking: move(base.braking),
    consistency: move(base.consistency),
    overtaking: move(base.overtaking),
    reaction: move(base.reaction),
    stamina: move(base.stamina),
    wetWeather: move(base.wetWeather),
  };
}

/**
 * The driver as they are now: the roster entry, or a prospect the save
 * generated, with their current age and form applied.
 */
export function effectiveDriver(state: GameState | null, driverId: string): Driver | undefined {
  const prospect = state?.prospects.find((entry) => entry.id === driverId);
  const base: Driver | undefined = prospect
    ? prospectToDriver(prospect)
    : DRIVER_BY_ID[driverId];
  if (!base) return undefined;

  const record = state?.driverRecords[driverId];
  if (!record) return base;

  return {
    ...base,
    age: record.age,
    attributes: shiftAttributes(base.attributes, record.formDelta),
  };
}

/** Overall rating with age and form folded in. */
export function currentRating(state: GameState | null, driverId: string): number {
  const driver = effectiveDriver(state, driverId);
  return driver ? driverRating(driver) : 50;
}

/* ------------------------------ progression ---------------------------- */

/** Deterministic per (season, driver), so a reload cannot reroll a career. */
function seeded(season: number, driverId: string): number {
  let hash = season * 2654435761;
  for (let i = 0; i < driverId.length; i++) {
    hash = (hash * 31 + driverId.charCodeAt(i)) >>> 0;
  }
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
}

export interface DevelopmentNote {
  driverId: string;
  /** Signed change to the overall rating this off-season. */
  change: number;
  ageAfter: number;
  reason: 'GROWTH' | 'PEAK' | 'DECLINE';
}

/**
 * Ages the whole grid a year and moves every driver along their curve.
 * Mutates `state`, which is always a clone by the time the machine calls
 * this. Returns what changed, for the season review.
 */
export function advanceDriverSeason(state: GameState): DevelopmentNote[] {
  const notes: DevelopmentNote[] = [];

  for (const record of Object.values(state.driverRecords)) {
    const before = record.formDelta;
    record.age += 1;
    record.seasonsRun += 1;

    /* How the season actually went, measured against the driver's own
     * team-mate — the only comparison that controls for the car. */
    const row = state.standings.drivers.find((entry) => entry.driverId === record.driverId);
    const teamId = state.driverTeams[record.driverId];
    const mateId = Object.entries(state.driverTeams).find(
      ([id, team]) => team === teamId && id !== record.driverId,
    )?.[0];
    const matePoints = mateId
      ? (state.standings.drivers.find((entry) => entry.driverId === mateId)?.points ?? 0)
      : 0;
    const points = row?.points ?? 0;
    const total = points + matePoints;
    // −1 (beaten badly) .. +1 (beat the team-mate comfortably).
    const form = total > 0 ? (points / total - 0.5) * 2 : 0;

    // Career tallies, which the history screen reads.
    record.careerPoints += points;
    record.careerWins += row?.wins ?? 0;

    const noise = (seeded(state.season, record.driverId) - 0.5) * 1.4;
    let change: number;
    let reason: DevelopmentNote['reason'];

    if (record.age <= GROWTH_UNTIL_AGE) {
      // Young drivers improve fast, and faster still when they deliver.
      change = 2.4 + form * 1.6 + noise;
      reason = 'GROWTH';
    } else if (record.age < DECLINE_FROM_AGE) {
      // At their level: only form moves them, and not by much.
      change = form * 1.1 + noise * 0.7;
      reason = 'PEAK';
    } else {
      // The drop accelerates, and results only soften it.
      const years = record.age - DECLINE_FROM_AGE + 1;
      change = -(0.5 + years * 0.32) + form * 0.9 + noise * 0.5;
      reason = 'DECLINE';
    }

    record.formDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, record.formDelta + change));

    notes.push({
      driverId: record.driverId,
      change: record.formDelta - before,
      ageAfter: record.age,
      reason,
    });
  }

  return notes;
}

/* ------------------------------ prospects ------------------------------ */

const PROSPECT_FIRST = [
  'Théo', 'Nico', 'Emil', 'Rafa', 'Kenji', 'Milan', 'Aaron', 'Luca',
  'Sander', 'Diogo', 'Tomas', 'Ravi', 'Felix', 'Mateo', 'Jonas', 'Ari',
];

const PROSPECT_LAST = [
  'Verhoeven', 'Brandão', 'Kaufmann', 'Lindholm', 'Serrano', 'Baptiste',
  'Yamada', 'Novotny', 'Aaltonen', 'Mercier', 'Grimaldi', 'Ostrowski',
  'Van Dijk', 'Barros', 'Nyström', 'Ferrand',
];

const PROSPECT_COUNTRIES = ['NL', 'BR', 'DE', 'FI', 'ES', 'FR', 'JP', 'CZ', 'IT', 'PL', 'PT', 'SE'];

function prospectHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The junior intake for one season. Regenerated every year, so a class
 * the player passes on is genuinely gone, and deterministic on the
 * season so reloading cannot fish for a better one.
 */
export function buildProspects(season: number, count = 6): ProspectDriver[] {
  const used = new Set<string>();
  const prospects: ProspectDriver[] = [];

  for (let index = 0; index < count; index++) {
    const key = `${season}:prospect:${index}`;
    const r1 = prospectHash(key + 'a');
    const r2 = prospectHash(key + 'b');
    const r3 = prospectHash(key + 'c');
    const r4 = prospectHash(key + 'd');

    const first = PROSPECT_FIRST[Math.floor(r1 * PROSPECT_FIRST.length)]!;
    let lastIndex = Math.floor(r2 * PROSPECT_LAST.length);
    let last = PROSPECT_LAST[lastIndex]!;
    for (let attempt = 0; used.has(`${first} ${last}`) && attempt < PROSPECT_LAST.length; attempt++) {
      lastIndex = (lastIndex + 1) % PROSPECT_LAST.length;
      last = PROSPECT_LAST[lastIndex]!;
    }
    used.add(`${first} ${last}`);

    /* A junior is signed on what they might become, not what they are.
     * The gap between the two is the whole gamble. */
    const potential = Math.round(74 + r3 * 24);
    const raw = Math.round(potential - 10 - r4 * 12);

    /* A junior is quick and fearless and short on the things only laps
     * teach: consistency, stamina, and reading a wet track. */
    const attrs: DriverAttributes = {
      pace: raw,
      cornering: raw - 1 + Math.round(r1 * 3),
      braking: raw - 2 + Math.round(r2 * 4),
      overtaking: raw + Math.round(r4 * 4),
      consistency: raw - 8 + Math.round(r3 * 4),
      reaction: raw + 2 + Math.round(r1 * 3),
      stamina: raw - 4 + Math.round(r2 * 5),
      wetWeather: raw - 7 + Math.round(r3 * 6),
    };

    prospects.push({
      id: `prospect-${season}-${index}`,
      code: (first.slice(0, 1) + last.slice(0, 2)).toUpperCase(),
      firstName: first,
      lastName: last,
      countryCode: PROSPECT_COUNTRIES[Math.floor(r3 * PROSPECT_COUNTRIES.length)]!,
      age: 17 + Math.floor(r4 * 4),
      potential,
      attributes: attrs,
      // Juniors are cheap, which is most of the appeal.
      salary: Math.round((900_000 + potential * 22_000) / 100_000) * 100_000,
      scoutedInSeason: season,
    });
  }

  return prospects;
}

/** A prospect rendered as a full driver, so the rest of the app can use it. */
export function prospectToDriver(prospect: ProspectDriver): Driver {
  return {
    id: prospect.id,
    code: prospect.code,
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    teamId: '',
    countryCode: prospect.countryCode,
    country: prospect.countryCode,
    carNumber: 0,
    age: prospect.age,
    attributes: prospect.attributes,
    morale: 80,
    fitness: 92,
    contract: {
      salaryPerSeason: prospect.salary,
      expiresAfterSeason: prospect.scoutedInSeason + 3,
      buyoutClause: Math.round(prospect.salary * 1.5),
      bonusPerWin: Math.round(prospect.salary * 0.05),
    },
  };
}
