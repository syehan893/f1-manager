import { DRIVER_BY_ID } from '@/data/drivers';
import { driverRating } from '@/data/grid2026';
import { seedAttributes } from '@/data/attributeSeed';
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

/* ---------------------------------------------------------------------
 * The curves.
 *
 * One age curve for the whole driver was the thing that made careers read
 * as a single slider. Every attribute now has its own, and they point in
 * different directions on purpose:
 *
 *   reaction peaks at twenty-four and falls away fastest — reflexes go
 *   pace peaks in the mid-twenties and is the next to go
 *   defending, racecraft and tyre management are *learned*, peak in the
 *     mid-thirties, and barely decline at all
 *   adaptability runs backwards: the young pick up a new car quickest
 *
 * That is what makes a veteran a different proposition rather than simply
 * a worse one — half a second slower and still impossible to pass.
 * ------------------------------------------------------------------- */

export interface AttributeCurve {
  /** Age at which this attribute stops improving on age alone. */
  peakAge: number;
  /** Points per season gained before the peak. */
  growth: number;
  /** Points per season lost after it, before acceleration. */
  decline: number;
  /** How much beating or losing to a team-mate moves it. */
  formWeight: number;
}

export const CURVES: Record<keyof DriverAttributes, AttributeCurve> = {
  // Raw speed: early peak, real decline.
  pace: { peakAge: 26, growth: 2.6, decline: 0.55, formWeight: 1.2 },
  cornering: { peakAge: 27, growth: 2.4, decline: 0.45, formWeight: 1 },
  braking: { peakAge: 27, growth: 2.2, decline: 0.4, formWeight: 0.9 },
  reaction: { peakAge: 24, growth: 2.8, decline: 0.78, formWeight: 0.5 },

  // Wheel to wheel: learned, and slow to fade.
  attack: { peakAge: 28, growth: 2.2, decline: 0.35, formWeight: 1.1 },
  defence: { peakAge: 32, growth: 1.8, decline: 0.14, formWeight: 0.9 },
  racecraft: { peakAge: 33, growth: 1.9, decline: 0.1, formWeight: 1 },

  // Managing a race.
  consistency: { peakAge: 33, growth: 1.7, decline: 0.12, formWeight: 1.1 },
  tyreManagement: { peakAge: 34, growth: 1.5, decline: 0.08, formWeight: 0.8 },
  stamina: { peakAge: 27, growth: 2, decline: 0.62, formWeight: 0.3 },

  // Conditions and the team.
  wetWeather: { peakAge: 31, growth: 1.6, decline: 0.2, formWeight: 0.6 },
  // Runs the other way: youth adapts fastest, and that fades early.
  adaptability: { peakAge: 23, growth: 2.2, decline: 0.6, formWeight: 0.4 },
  feedback: { peakAge: 35, growth: 1.4, decline: 0.05, formWeight: 0.7 },
};

export const ATTRIBUTE_KEYS = Object.keys(CURVES) as Array<keyof DriverAttributes>;

/** Hard ceiling on how far any one attribute can drift from where it began. */
const MAX_DELTA = 18;

/* ------------------------------ the record ----------------------------- */

export function blankRecord(driverId: string, age: number): DriverRecord {
  return {
    driverId,
    age,
    deltas: {},
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

function shiftAttributes(
  base: DriverAttributes,
  deltas: Partial<Record<keyof DriverAttributes, number>>,
): DriverAttributes {
  const shifted = { ...base };
  for (const key of ATTRIBUTE_KEYS) {
    const move = deltas[key] ?? 0;
    shifted[key] = Math.max(25, Math.min(99, Math.round(base[key] + move)));
  }
  return shifted;
}

/**
 * The driver as they are now: the roster entry, or a prospect the save
 * generated, with their current age and form applied.
 */
export function effectiveDriver(state: GameState | null, driverId: string): Driver | undefined {
  /* Look in the intake *and* among the graduates: once a junior signs,
   * the intake they came from is rebuilt every season, and a driver who
   * cannot be resolved here never ages and never develops. */
  const prospect =
    state?.prospects.find((entry) => entry.id === driverId) ??
    state?.academyDrivers.find((entry) => entry.id === driverId);
  const base: Driver | undefined = prospect
    ? prospectToDriver(prospect)
    : DRIVER_BY_ID[driverId];
  if (!base) return undefined;

  const record = state?.driverRecords[driverId];
  if (!record) return base;

  return {
    ...base,
    age: record.age,
    attributes: shiftAttributes(base.attributes, record.deltas),
  };
}

/** Overall rating with age and form folded in. */
export function currentRating(state: GameState | null, driverId: string): number {
  const driver = effectiveDriver(state, driverId);
  return driver ? driverRating(driver) : 50;
}

/* --------------------------- the other two ----------------------------- */

/**
 * The lap time a driver gives away for being somewhere new.
 *
 * `adaptability` was seeded, aged and shown on every driver card without
 * ever being read. This is its job: a driver at a circuit they have never
 * raced, or in their first season at all, is not yet on the pace, and how
 * quickly they get there is the attribute. It makes signing a rookie
 * mid-season cost something real rather than being a pure discount.
 *
 * Returns a signed lap-time factor — positive is slower — on the same
 * scale the engine's condition channel already uses.
 */
export function driverAdaptationPenalty(
  state: GameState | null,
  driverId: string,
  trackId: string,
): number {
  if (!state) return 0;

  const driver = effectiveDriver(state, driverId);
  if (!driver) return 0;

  const raced = state.history.some((round) => round.trackId === trackId);
  const record = state.driverRecords[driverId];
  const rookieSeason = (record?.seasonsRun ?? 0) === 0;

  if (raced && !rookieSeason) return 0;

  /* 70 is neutral: a 95 barely notices a new circuit, a 45 needs a race
   * to get on terms with it. */
  const adaptability = driver.attributes.adaptability;
  const resistance = Math.max(0.15, 1 - (adaptability - 70) / 55);

  const unfamiliarTrack = raced ? 0 : 0.0026;
  const firstSeason = rookieSeason ? 0.0022 : 0;

  return (unfamiliarTrack + firstSeason) * resistance;
}

/**
 * How much the driver line-up is worth to the development programme.
 *
 * `feedback` is the quality of what the driver can tell the engineers,
 * and it had no effect on anything. Now it multiplies what a development
 * cheque actually buys, so a quick driver who cannot describe the car
 * genuinely slows the whole team down — which is a real trade-off to
 * weigh against raw pace on the driver market.
 */
export function driverFeedbackBonus(state: GameState): number {
  const ours = Object.entries(state.driverTeams)
    .filter(([, teamId]) => teamId === state.playerTeamId)
    .map(([driverId]) => effectiveDriver(state, driverId)?.attributes.feedback ?? 70);

  if (ours.length === 0) return 1;
  const average = ours.reduce((sum, value) => sum + value, 0) / ours.length;
  // A 95 pairing buys about a tenth more; a 45 pairing about a tenth less.
  return Math.max(0.85, Math.min(1.14, 1 + (average - 70) / 210));
}

/* ------------------------------- ceilings ------------------------------ */

/**
 * How good this driver can ever get.
 *
 * A junior is signed on a stated ceiling and that is now the number that
 * actually binds: without this, every driver on the grid grew by the same
 * flat allowance and the headline figure on the academy card — the one
 * thing the player is asked to gamble on — decided nothing at all.
 *
 * Established drivers have no stated potential, so it is derived: what
 * they are today plus the headroom their age still allows. A 21-year-old
 * has most of a career in front of them; a 34-year-old has none.
 */
export function potentialOf(state: GameState | null, driverId: string): number {
  const graduate =
    state?.academyDrivers.find((entry) => entry.id === driverId) ??
    state?.prospects.find((entry) => entry.id === driverId);
  if (graduate) return graduate.potential;

  const driver = DRIVER_BY_ID[driverId];
  if (!driver) return 99;

  const base = driverRating(driver);
  const age = state?.driverRecords[driverId]?.age ?? driver.age;
  const headroom = age <= 21 ? 12 : age <= 24 ? 8 : age <= 27 ? 5 : age <= 30 ? 2 : 0;
  return Math.min(99, base + headroom);
}

/**
 * What the scouts will commit to, as a range rather than a number.
 *
 * A ceiling nobody can measure is the whole risk of signing a teenager,
 * so the report narrows as they actually run races instead of being
 * handed over precise on day one.
 */
export function scoutedRange(
  state: GameState | null,
  driverId: string,
): { low: number; high: number; certainty: number } {
  const potential = potentialOf(state, driverId);
  const seasons = state?.driverRecords[driverId]?.seasonsRun ?? 0;
  /* Two full seasons of racing is what it takes to be sure. */
  const certainty = Math.min(1, seasons / 2);
  const spread = Math.round(9 * (1 - certainty));
  /* The error is deterministic per driver, so a reload cannot re-scout. */
  const lean = (seeded(0, driverId + 'scout') - 0.5) * 2 * spread * 0.45;
  return {
    low: Math.max(40, Math.round(potential - spread + lean)),
    high: Math.min(99, Math.round(potential + spread + lean)),
    certainty,
  };
}

/* ------------------------------ progression ---------------------------- */

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

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
  /** The two attributes that moved most, for the season review. */
  biggestGain: { key: keyof DriverAttributes; change: number } | null;
  biggestLoss: { key: keyof DriverAttributes; change: number } | null;
}

/**
 * Ages the whole grid a year and moves every driver along their curve.
 * Mutates `state`, which is always a clone by the time the machine calls
 * this. Returns what changed, for the season review.
 */
export function advanceDriverSeason(state: GameState): DevelopmentNote[] {
  const notes: DevelopmentNote[] = [];

  for (const record of Object.values(state.driverRecords)) {
    const ratingBefore = currentRating(state, record.driverId);
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

    record.careerPoints += points;
    record.careerWins += row?.wins ?? 0;

    /* Racing seasons are what actually teach the learned attributes, so a
     * driver who has run ten years keeps gaining on them long after their
     * raw speed has turned over. */
    const mileage = Math.min(1, record.seasonsRun / 8);

    /* What is left between what they are and what they can become. Growth
     * fades out as a driver closes on their own ceiling, which is what
     * makes the number on the academy card a real promise rather than
     * decoration. Decline is untouched — age takes what it takes. */
    const ceiling = potentialOf(state, record.driverId);
    const headroom = clampUnit((ceiling - currentRating(state, record.driverId)) / 6);

    let biggestGain: DevelopmentNote['biggestGain'] = null;
    let biggestLoss: DevelopmentNote['biggestLoss'] = null;

    for (const key of ATTRIBUTE_KEYS) {
      const curve = CURVES[key];
      const noise = (seeded(state.season, record.driverId + key) - 0.5) * 1.2;

      let change: number;
      if (record.age <= curve.peakAge) {
        // Still climbing, and climbing faster when the results back it up.
        change = (curve.growth + form * curve.formWeight) * headroom + noise;
      } else {
        /* Past the peak the loss accelerates, but experience keeps paying
         * into the learned attributes for years afterwards — which is why
         * a veteran's defending holds up while their reactions do not. */
        const years = record.age - curve.peakAge;
        const fade = curve.decline * (1 + years * 0.16);
        const learned = curve.decline < 0.2 ? mileage * 0.55 : 0;
        change = -fade + learned + form * curve.formWeight * 0.7 + noise * 0.6;
      }

      const before = record.deltas[key] ?? 0;
      const after = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, before + change));
      record.deltas[key] = Math.round(after * 10) / 10;

      const moved = after - before;
      if (!biggestGain || moved > biggestGain.change) biggestGain = { key, change: moved };
      if (!biggestLoss || moved < biggestLoss.change) biggestLoss = { key, change: moved };
    }

    const ratingAfter = currentRating(state, record.driverId);
    const peakish = CURVES.pace.peakAge;

    notes.push({
      driverId: record.driverId,
      change: ratingAfter - ratingBefore,
      ageAfter: record.age,
      reason:
        record.age <= peakish ? 'GROWTH' : record.age <= CURVES.racecraft.peakAge ? 'PEAK' : 'DECLINE',
      biggestGain: biggestGain && biggestGain.change > 0.15 ? biggestGain : null,
      biggestLoss: biggestLoss && biggestLoss.change < -0.15 ? biggestLoss : null,
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
     * teach. The seeding helper handles the rest: at seventeen it hands
     * them almost no defending, racecraft or tyre management, which is
     * exactly the gap they spend their first seasons closing. */
    const age = 17 + Math.floor(r4 * 4);
    const attrs = seedAttributes(`prospect-${season}-${index}`, age, {
      pace: raw,
      cornering: raw - 1 + Math.round(r1 * 3),
      braking: raw - 2 + Math.round(r2 * 4),
      attack: raw + Math.round(r4 * 4),
      consistency: raw - 8 + Math.round(r3 * 4),
      reaction: raw + 2 + Math.round(r1 * 3),
      stamina: raw - 4 + Math.round(r2 * 5),
      wetWeather: raw - 7 + Math.round(r3 * 6),
    });

    prospects.push({
      id: `prospect-${season}-${index}`,
      code: (first.slice(0, 1) + last.slice(0, 2)).toUpperCase(),
      firstName: first,
      lastName: last,
      countryCode: PROSPECT_COUNTRIES[Math.floor(r3 * PROSPECT_COUNTRIES.length)]!,
      age,
      potential,
      attributes: attrs,
      // Juniors are cheap, which is most of the appeal.
      salary: Math.round((900_000 + potential * 22_000) / 100_000) * 100_000,
      scoutedInSeason: season,
    });
  }

  return prospects;
}

/**
 * A prospect rendered as a full driver, so the rest of the app can use it.
 *
 * On the market screen there is no seat and no number yet, which is what
 * the defaults describe. Once a junior is actually signed the caller has
 * both, and passes them — a driver with no team and car number 0 is fine
 * on a scouting card but wrong everywhere a real entry is expected.
 */
export function prospectToDriver(
  prospect: ProspectDriver,
  seat?: { teamId: string; carNumber: number },
): Driver {
  return {
    id: prospect.id,
    code: prospect.code,
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    teamId: seat?.teamId ?? '',
    countryCode: prospect.countryCode,
    country: prospect.countryCode,
    carNumber: seat?.carNumber ?? 0,
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
