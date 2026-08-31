import { DRIVER_BY_ID } from '@/data/drivers';
import { driverRating } from '@/data/grid2026';
import { buildIntake } from './youthTalent';
import type { Driver, DriverAttributes } from '@/types';
import type { DriverRecord, GameState, ProspectDriver, SeasonTally } from './types';

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

/* ---------------------------------------------------------------------
 * Age, and the two ends of a career.
 *
 * The per-attribute curves above already peak at different ages, which
 * is what makes a veteran a different driver rather than a worse one.
 * But they peak as late as thirty-five, and the form and experience
 * terms are added on top of the decline — so a thirty-nine-year-old
 * having a good season could still finish it *rated higher* than he
 * started it, indefinitely. A career with no downhill in it is not a
 * career.
 *
 * VETERAN_AGE is the line. Past it nothing adds: no form, no experience,
 * no upside from the noise. Every attribute moves by its own decline and
 * only its own decline, so the overall rating falls every year, gently
 * at first and faster as the years pile up.
 * ------------------------------------------------------------------- */

/** Age past which a driver can no longer gain rating on any channel. */
export const VETERAN_AGE = 38;
/** Age from which retirement becomes a real possibility. */
export const RETIREMENT_WATCH_AGE = 34;
/** Nobody races past this. */
export const HARD_RETIREMENT_AGE = 44;

/* ------------------------------ the record ----------------------------- */

export function blankSeasonTally(): SeasonTally {
  return {
    races: 0,
    points: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    dnfs: 0,
    qualifyingWins: 0,
    qualifyingDuels: 0,
  };
}

export function blankRecord(driverId: string, age: number): DriverRecord {
  return {
    driverId,
    age,
    deltas: {},
    seasonsRun: 0,
    careerPoints: 0,
    careerWins: 0,
    careerPodiums: 0,
    careerRaces: 0,
    careerPoles: 0,
    careerDnfs: 0,
    careerBestFinish: null,
    season: blankSeasonTally(),
    ratingHistory: [],
  };
}

/**
 * A record that is safe to read, whatever wrote it.
 *
 * Records are created in several places and one of them is a save file
 * written by an older build. Rather than scatter `?? 0` across every
 * caller, anything that reads the statistics goes through here.
 */
export function tallyOf(record: DriverRecord | undefined): SeasonTally {
  return record?.season ?? blankSeasonTally();
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

/* --------------------------- how a season read -------------------------- */

/**
 * How well a driver actually did, −1 to +1.
 *
 * The old measure was share of the team's points and nothing else, which
 * has two holes big enough to drive a career through. A driver in a car
 * that scored nothing had a season worth zero evidence — 0/0 read as
 * "level with the team-mate" whether they had dragged it into Q3 every
 * week or spun it into a wall. And absolute achievement counted for
 * nothing: winning the championship and beating a team-mate 60-40 in a
 * backmarker came out the same.
 *
 * So it is built from four things a scout would actually name, weighted
 * by how much each one controls for the car:
 *
 *   the team-mate       same machinery, so the fairest read there is
 *   qualifying          one lap, no strategy, no luck — the purest one
 *   what they won       wins and podiums are worth something on their own
 *   getting it home     a driver who does not finish develops nothing
 */
export function performanceIndex(state: GameState, driverId: string): number {
  const record = state.driverRecords[driverId];
  const tally = tallyOf(record);
  if (tally.races === 0) return 0;

  const teamId = state.driverTeams[driverId];
  const mateId = Object.entries(state.driverTeams).find(
    ([id, team]) => team === teamId && id !== driverId,
  )?.[0];

  const points = tally.points;
  const matePoints = mateId ? tallyOf(state.driverRecords[mateId]).points : 0;
  const total = points + matePoints;

  /* Share of the team's points, −1 to +1. When neither car scored this
   * says nothing at all rather than saying "level": the qualifying and
   * finishing terms below are what carry a driver in a bad car. */
  const share = total > 0 ? (points / total - 0.5) * 2 : 0;
  const shareWeight = total > 0 ? 1 : 0;

  /* Qualifying head to head. The same machinery on the same lap, which
   * is why it is worth as much as the points despite scoring nothing. */
  const duels = tally.qualifyingDuels;
  const quali = duels > 0 ? (tally.qualifyingWins / duels - 0.5) * 2 : 0;
  const qualiWeight = duels > 0 ? 1 : 0;

  /* What they actually won. A win is worth a great deal more to a young
   * driver's development than a run of sevenths, and this is the term
   * that says so. Saturates: a champion is not four times a race winner. */
  const silverware = Math.min(1, (tally.wins * 0.34 + tally.podiums * 0.14 + tally.poles * 0.1));

  /* Bringing it home. Retirements that are the driver's own doing are
   * the clearest negative evidence there is. */
  const finishRate = 1 - tally.dnfs / tally.races;
  const reliability = (finishRate - 0.86) * 2.2;

  const weighted =
    share * 1.15 * shareWeight +
    quali * 0.95 * qualiWeight +
    silverware * 0.9 +
    reliability * 0.5;
  const divisor = 1.15 * shareWeight + 0.95 * qualiWeight + 0.9 + 0.5;

  return Math.max(-1, Math.min(1, weighted / divisor));
}

export interface DevelopmentNote {
  driverId: string;
  /** Signed change to the overall rating this off-season. */
  change: number;
  ageAfter: number;
  reason: 'GROWTH' | 'PEAK' | 'DECLINE' | 'VETERAN';
  /** The two attributes that moved most, for the season review. */
  biggestGain: { key: keyof DriverAttributes; change: number } | null;
  biggestLoss: { key: keyof DriverAttributes; change: number } | null;
  /** How the season itself read, −1 to +1. What drove the change. */
  form: number;
}

/**
 * Ages the whole grid a year and moves every driver along their curve.
 * Mutates `state`, which is always a clone by the time the machine calls
 * this. Returns what changed, for the season review.
 */
export function advanceDriverSeason(state: GameState): DevelopmentNote[] {
  const notes: DevelopmentNote[] = [];
  const retired = new Set(state.retiredDriverIds ?? []);

  for (const record of Object.values(state.driverRecords)) {
    // A career that has ended does not keep moving.
    if (retired.has(record.driverId)) continue;

    const ratingBefore = currentRating(state, record.driverId);
    const tally = tallyOf(record);

    /* How the season actually went, across everything it produced —
     * measured before the record is rolled forward. */
    const form = performanceIndex(state, record.driverId);

    record.age += 1;
    if (tally.races > 0) record.seasonsRun += 1;

    record.careerPoints += tally.points;
    record.careerWins += tally.wins;
    record.careerPodiums += tally.podiums;
    record.careerPoles += tally.poles;
    record.careerRaces += tally.races;
    record.careerDnfs += tally.dnfs;

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

    /* Past the veteran line nothing adds. Not form, not experience, not
     * the upside of the noise — this is the switch that guarantees a
     * career has a downhill in it. */
    const veteran = record.age >= VETERAN_AGE;

    let biggestGain: DevelopmentNote['biggestGain'] = null;
    let biggestLoss: DevelopmentNote['biggestLoss'] = null;

    for (const key of ATTRIBUTE_KEYS) {
      const curve = CURVES[key];
      const noise = (seeded(state.season, record.driverId + key) - 0.5) * 1.2;

      let change: number;
      if (veteran) {
        /* Only the decline, and it steepens every year past the line.
         * The noise can make one year harsher than another but never
         * turns the sign: a veteran's rating falls, full stop. */
        const years = record.age - VETERAN_AGE;
        const fade = Math.max(curve.decline, 0.22) * (1 + years * 0.3);
        change = -fade * (1 + Math.abs(noise) * 0.2);
      } else if (record.age <= curve.peakAge) {
        /* Still climbing, and how fast is mostly about the season they
         * just had. The two terms are deliberately asymmetric:
         *
         * The upside is gated by headroom, because no amount of winning
         * takes a driver past their own ceiling. The downside is not —
         * a season of being beaten and putting it in the wall costs a
         * young driver even when they have a career of room left, which
         * is the whole reason a bad seat is bad for a prospect.
         *
         * Calibrated so a title year is worth about four points of
         * rating to a young driver with room to grow, and a season of
         * being beaten and retiring from half of it is worth nothing at
         * all — they age a year and stand still. */
        const formEffect =
          form >= 0
            ? form * curve.formWeight * 2.2 * headroom
            : form * curve.formWeight * 3.4;
        change = curve.growth * headroom + formEffect + noise;
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

    let ratingAfter = currentRating(state, record.driverId);

    /* The clamp that makes the rule true rather than merely likely.
     *
     * Every attribute moved down, but the overall rating is a rounded
     * weighted average of thirteen clamped integers — so a driver
     * already pinned at the −18 delta floor on the attributes that
     * carry weight can come out level, and "cannot gain past 38" would
     * be a claim the code does not actually keep. If the rating has not
     * fallen, take it down by hand. */
    if (veteran && ratingAfter >= ratingBefore) {
      for (const key of ATTRIBUTE_KEYS) {
        const before = record.deltas[key] ?? 0;
        record.deltas[key] = Math.max(-MAX_DELTA, Math.round((before - 0.6) * 10) / 10);
      }
      ratingAfter = Math.min(currentRating(state, record.driverId), ratingBefore - 1);
    }

    record.ratingHistory = [...(record.ratingHistory ?? []), ratingAfter].slice(-25);
    // The season's page is turned; next year starts from nothing.
    record.season = blankSeasonTally();

    const peakish = CURVES.pace.peakAge;

    notes.push({
      driverId: record.driverId,
      change: ratingAfter - ratingBefore,
      ageAfter: record.age,
      reason: veteran
        ? 'VETERAN'
        : record.age <= peakish
          ? 'GROWTH'
          : record.age <= CURVES.racecraft.peakAge
            ? 'PEAK'
            : 'DECLINE',
      biggestGain: biggestGain && biggestGain.change > 0.15 ? biggestGain : null,
      biggestLoss: biggestLoss && biggestLoss.change < -0.15 ? biggestLoss : null,
      form,
    });
  }

  return notes;
}

/* ----------------------------- retirement ------------------------------- */

export interface RetirementNote {
  driverId: string;
  age: number;
  reason: 'AGE' | 'NO_SEAT' | 'DECLINE';
  /** How the paddock reported it. */
  note: string;
}

/**
 * Whether this driver hangs up their helmet this winter.
 *
 * Ageing without retirement is the same bug as a contract that never
 * expires: the grid could only ever get older, a forty-five-year-old
 * kept a seat by inertia, and no seat ever opened up because somebody
 * had simply had enough. Three things decide it, and they compound:
 *
 *   how old they are      certain by the hard limit, unlikely before 34
 *   whether they have a drive   nobody sits out two winters at 36
 *   how far they have fallen    a driver off their own peak knows it
 *
 * Deterministic on (season, driverId) so a reload cannot save a career.
 */
export function retirementCheck(state: GameState, driverId: string): RetirementNote | null {
  const record = state.driverRecords[driverId];
  const driver = effectiveDriver(state, driverId);
  if (!record || !driver) return null;

  const age = record.age;
  if (age < RETIREMENT_WATCH_AGE) return null;

  const hasSeat = Boolean(state.driverTeams[driverId]);
  if (age >= HARD_RETIREMENT_AGE) {
    return {
      driverId,
      age,
      reason: 'AGE',
      note: `${driver.lastName} retires from the sport at ${age} after ${record.seasonsRun} seasons.`,
    };
  }

  /* Rising from nothing at the watch age to near-certain by the hard
   * limit. Squared so the middle years stay a real question rather than
   * a slow, predictable slide. */
  const span = HARD_RETIREMENT_AGE - RETIREMENT_WATCH_AGE;
  let chance = Math.pow((age - RETIREMENT_WATCH_AGE) / span, 2) * 0.9;

  // A driver without a drive is deciding whether to wait another year.
  if (!hasSeat) chance += age >= 36 ? 0.55 : 0.25;

  /* How far they are off their own best. A driver who is still at their
   * peak keeps going; one who has lost five points of rating from it has
   * had the conversation with themselves already. */
  const history = record.ratingHistory ?? [];
  const peak = history.length > 0 ? Math.max(...history) : currentRating(state, driverId);
  const fallen = peak - currentRating(state, driverId);
  if (fallen > 3) chance += Math.min(0.3, (fallen - 3) * 0.06);

  // A champion holds on longer than a driver with nothing to defend.
  if (record.careerWins >= 10) chance -= 0.12;

  if (seeded(state.season, driverId + ':retire') > Math.min(0.97, chance)) return null;

  const reason: RetirementNote['reason'] = !hasSeat ? 'NO_SEAT' : fallen > 3 ? 'DECLINE' : 'AGE';
  return {
    driverId,
    age,
    reason,
    note:
      reason === 'NO_SEAT'
        ? `${driver.lastName} calls time at ${age} rather than wait for a seat that is not coming.`
        : reason === 'DECLINE'
          ? `${driver.lastName} steps away at ${age}, some way off the driver he was.`
          : `${driver.lastName} retires at ${age} after ${record.seasonsRun} seasons.`,
  };
}

/* ------------------------------ prospects ------------------------------ */

/**
 * The junior intake, now the feeder-series field. Kept here as the name
 * the rest of the game already calls; the generation itself lives in
 * `youthTalent.ts` and the championship in `feederSeries.ts`.
 */
export function buildProspects(season: number, count = 6): ProspectDriver[] {
  return buildIntake(season, count);
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
