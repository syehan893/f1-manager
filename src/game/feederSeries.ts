import { driverRating } from '@/data/grid2026';
import { effectiveDriver } from './driverDevelopment';
import { buildIntake, generateProspect, tierDueIn, withDistinctNames } from './youthTalent';
import type { F2Season, F2Standing, GameState, ProspectDriver } from './types';

/* =====================================================================
 * The feeder series.
 *
 * A junior used to be a card on a shop shelf: generated in the winter,
 * described by a potential nobody could check, and thrown away in the
 * spring if nobody bought them. There was no reason to prefer one to
 * another beyond the number printed on them, and no way to be wrong.
 *
 * F2 is the evidence. The same twenty-two juniors race a championship
 * alongside the F1 season and finish it in an order, so a potential is
 * something the player can watch being confirmed or not: a 92-rated
 * prospect who finishes fourteenth is a different signing to one who won
 * the title, and the player who has been reading the table knows which
 * is which before the price goes up.
 *
 * It is results only, on purpose. Simulating twenty-two more cars lap by
 * lap would cost a great deal and be watched by nobody — what the player
 * needs from it is a standings table and a champion, which is what this
 * produces.
 *
 * Everything is deterministic on (season, driverId): the table cannot be
 * rerolled by reloading, and the same career always produces the same
 * F2 champion.
 * ===================================================================== */

/** Cars on the F2 grid. */
export const F2_FIELD_SIZE = 22;
/** How many of the field are replaced each winter, worst first. */
export const F2_RELEGATED_PER_SEASON = 5;
/** Seasons in the series before a driver ages out of it. */
export const F2_MAX_SEASONS = 4;
/** F2 scores the same way F1 does; only the field is different. */
const F2_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

/** Unit random from a key, finalised so near-identical keys diverge. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------ the field ------------------------------ */

/** A full grid at the start of a career: a mix of ages and one standout. */
export function buildF2Field(season: number): ProspectDriver[] {
  const field = buildIntake(season, F2_FIELD_SIZE);

  /* A championship where everybody arrived this morning reads wrong. The
   * back two thirds of the grid have been here a year or two already,
   * which is also what makes the promotion order legible: a driver in
   * their third season who is still mid-table is not a prospect any
   * more, whatever their ceiling says. */
  return field.map((driver, index) => {
    if (index < 8) return driver;
    const years = 1 + Math.floor(hash(`${driver.id}:tenure`) * 2);
    return { ...driver, seasonsInF2: years, age: driver.age + years };
  });
}

/** Juniors in the field who have not yet been signed by anybody. */
export function unsignedJuniors(state: GameState): ProspectDriver[] {
  return state.prospects.filter((entry) => !state.driverTeams[entry.id]);
}

/* ---------------------------- the championship -------------------------- */

/**
 * How quick this driver is in an F2 car, 0-100.
 *
 * F2 is a spec series: everybody has the same car, which is exactly why
 * it is worth reading. The order is the drivers, plus the season's own
 * form — a junior can have a bad year — and nothing else.
 */
function f2Pace(state: GameState, driver: ProspectDriver, season: number): number {
  /* Their rating as it is *now* rather than as generated: a junior in
   * their third season has developed, and the table has to show it. */
  const resolved = effectiveDriver(state, driver.id);
  const ability = resolved ? driverRating(resolved) : driverRating({
    ...driver,
    teamId: '',
    country: driver.countryCode,
    carNumber: 0,
    morale: 80,
    fitness: 92,
    contract: { salaryPerSeason: driver.salary, expiresAfterSeason: season, buyoutClause: 0, bonusPerWin: 0 },
  });

  /* Experience in the series is worth real time — a rookie is rarely
   * champion, however good they are going to be. */
  const tenure = Math.min(1, driver.seasonsInF2 / 2) * 4;
  // A season's form, fixed per driver per year.
  const form = (hash(`${driver.id}:${season}:form`) - 0.5) * 9;

  return ability + tenure + form;
}

/**
 * Runs one F2 championship and returns the table.
 *
 * Each round is the field ordered by pace plus a per-round scatter, so
 * the quick driver usually wins and occasionally does not, and the
 * championship is decided over the season rather than by one number.
 */
export function simulateF2Season(
  state: GameState,
  field: ProspectDriver[],
  season: number,
  rounds: number,
): F2Season {
  const pace = new Map(field.map((driver) => [driver.id, f2Pace(state, driver, season)]));

  const tally = new Map<string, F2Standing>(
    field.map((driver) => [
      driver.id,
      {
        position: 0,
        driverId: driver.id,
        name: `${driver.firstName} ${driver.lastName}`,
        tier: driver.tier,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        bestFinish: field.length,
      },
    ]),
  );

  for (let round = 1; round <= rounds; round++) {
    /* Qualifying and the race are scattered separately, so pole and the
     * win are not the same result twice. */
    /* Saturday is scattered harder than Sunday, which is the right way
     * round for a spec series: one lap on identical machinery is decided
     * by tenths and by who found the lap, whereas a race distance gives
     * the quicker driver time to prove it. Without the width the fastest
     * junior simply took every pole of the season. */
    const grid = [...field].sort(
      (a, b) =>
        pace.get(b.id)! + (hash(`${b.id}:${season}:${round}:q`) - 0.5) * 13 -
        (pace.get(a.id)! + (hash(`${a.id}:${season}:${round}:q`) - 0.5) * 13),
    );
    tally.get(grid[0]!.id)!.poles += 1;

    const finish = [...field]
      .map((driver) => {
        const scatter = (hash(`${driver.id}:${season}:${round}:r`) - 0.5) * 11;
        /* Starting near the front is worth something: a spec series is
         * hard to overtake in, which is the other half of why F2
         * qualifying matters. */
        const fromGrid = (field.length - grid.indexOf(driver)) * 0.12;
        // One car in nine does not see the flag.
        const retired = hash(`${driver.id}:${season}:${round}:dnf`) < 0.055;
        return { driver, score: retired ? -1000 : pace.get(driver.id)! + scatter + fromGrid };
      })
      .sort((a, b) => b.score - a.score);

    finish.forEach((entry, index) => {
      const row = tally.get(entry.driver.id)!;
      if (entry.score <= -900) return;
      const position = index + 1;
      row.points += F2_POINTS[index] ?? 0;
      if (position === 1) row.wins += 1;
      if (position <= 3) row.podiums += 1;
      row.bestFinish = Math.min(row.bestFinish, position);
    });
  }

  const standings = [...tally.values()]
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums)
    .map((row, index) => ({ ...row, position: index + 1 }));

  return { season, rounds, standings, championDriverId: standings[0]?.driverId ?? null };
}

/* ---------------------------- promotion and churn ----------------------- */

/**
 * Replaces one driver in the field, keeping it at full strength.
 *
 * Called the moment somebody is promoted to F1: a seat that empties in
 * the feeder series is filled, because a nineteen-car F2 grid is not a
 * thing that happens. The replacement is a fresh junior, and the id is
 * salted so promoting two drivers in one winter does not generate the
 * same person twice.
 */
export function replaceInField(
  field: ProspectDriver[],
  departingId: string,
  season: number,
): ProspectDriver[] {
  const index = field.findIndex((driver) => driver.id === departingId);
  if (index < 0) return field;

  const replacement = generateProspect({
    season,
    // Well clear of the intake's own indices, so ids never collide.
    index: 500 + Math.floor(hash(`${departingId}:replacement`) * 400),
  });

  const next = [...field];
  /* Named against everybody still in the field, so the driver who
   * replaces a promotion is never somebody else's namesake. */
  next[index] = withDistinctNames(
    [replacement],
    field.filter((entry) => entry.id !== departingId).map((e) => `${e.firstName} ${e.lastName}`),
  )[0]!;
  return next;
}

/**
 * The winter in the feeder series.
 *
 * The bottom five are let go — a driver who has been beaten for a season
 * does not get another one by default — along with anybody who has spent
 * their allotted years here without earning a drive. The seats they
 * vacate are filled from the new intake, and the year's rare talent is
 * one of them, so the standout arrives *in F2* where the player can
 * watch them rather than on a card with a number on it.
 *
 * Returns the new field and who left, so the caller can report it.
 */
export function regenerateF2Field(
  field: ProspectDriver[],
  results: F2Season | null,
  season: number,
): { field: ProspectDriver[]; released: ProspectDriver[] } {
  const placeOf = new Map(
    (results?.standings ?? []).map((row) => [row.driverId, row.position]),
  );

  /* Worst first. Anybody the table has never heard of is treated as
   * having finished last, which is the safe way round: a field that
   * changed shape mid-season should not protect a driver by accident. */
  const ranked = [...field].sort(
    (a, b) => (placeOf.get(b.id) ?? 99) - (placeOf.get(a.id) ?? 99),
  );

  const releasing = new Set<string>();
  for (const driver of ranked) {
    if (releasing.size >= F2_RELEGATED_PER_SEASON) break;
    releasing.add(driver.id);
  }
  // Time served. Nobody stays in the feeder series forever.
  for (const driver of field) {
    if (driver.seasonsInF2 + 1 >= F2_MAX_SEASONS) releasing.add(driver.id);
  }

  const released = field.filter((driver) => releasing.has(driver.id));
  const staying = field
    .filter((driver) => !releasing.has(driver.id))
    .map((driver) => developInSeries(driver, results));

  /* The new intake fills every seat that opened, and carries the rare
   * tier due this year in its first slot — so a generational talent
   * always arrives in the series rather than only on a scouting card. */
  const openings = F2_FIELD_SIZE - staying.length;
  const intake = withDistinctNames(
    Array.from({ length: Math.max(0, openings) }, (_, index) =>
      generateProspect({
        season,
        index,
        tier: index === 0 ? tierDueIn(season) : 'STANDARD',
      }),
    ),
    staying.map((entry) => `${entry.firstName} ${entry.lastName}`),
  );

  return { field: [...staying, ...intake], released };
}

/**
 * A junior's winter: a year older, and a year better.
 *
 * Drivers in the feeder series deliberately hold no `DriverRecord` —
 * that is the thing an F1 driver has, and handing one to every junior
 * put twenty-two names into the free-agent market and the retirement
 * notices every time the field turned over. So the series ages and
 * develops its own people, right here, and a junior only acquires a
 * record on the day they are promoted.
 *
 * Growth closes the gap to their ceiling, and closes it faster for a
 * driver who is actually winning — which is what makes the F2 table
 * worth reading rather than a formality between the potential and the
 * signature.
 */
function developInSeries(driver: ProspectDriver, results: F2Season | null): ProspectDriver {
  const row = results?.standings.find((entry) => entry.driverId === driver.id);
  /* Championship position as a 0-1 quality: a title is 1, last is 0. */
  const total = results?.standings.length ?? F2_FIELD_SIZE;
  const form = row ? 1 - (row.position - 1) / Math.max(1, total - 1) : 0.4;

  const attributes = { ...driver.attributes };
  for (const key of Object.keys(attributes) as Array<keyof typeof attributes>) {
    const headroom = Math.max(0, driver.potential + 4 - attributes[key]);
    /* Two to five points a year on whatever is furthest from the
     * ceiling, so the raw ones stop climbing and the learned ones keep
     * going — the same shape as an F1 career, at a junior's speed. */
    const gain = Math.min(headroom, 1.4 + form * 2.6) * (0.35 + hash(`${driver.id}:${key}:grow`) * 0.9);
    attributes[key] = Math.max(25, Math.min(99, Math.round(attributes[key] + gain)));
  }

  return {
    ...driver,
    age: driver.age + 1,
    seasonsInF2: driver.seasonsInF2 + 1,
    attributes,
    /* A driver who has just won the championship is not the bargain he
     * was in November. */
    salary: Math.round((driver.salary * (1 + form * 0.28)) / 100_000) * 100_000,
  };
}

/** Where a junior finished last year, for the intake screen. */
export function f2PlaceOf(state: GameState, driverId: string): F2Standing | null {
  return state.f2?.standings.find((row) => row.driverId === driverId) ?? null;
}
