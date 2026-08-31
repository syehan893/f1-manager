import { GRID_2026_TEAMS, driverRating } from '@/data/grid2026';
import { blankRecord, effectiveDriver, retirementCheck } from './driverDevelopment';
import { blankCondition } from './driverCondition';
import { GRID_SEATS_PER_TEAM, joinSquad, leaveSquad, raceDriversOf, squadOf } from './roster';
import { replaceInField } from './feederSeries';
import type { DriverDeal, GameState, ProspectDriver } from './types';
import type { RetirementNote } from './driverDevelopment';

/* =====================================================================
 * The winter, for the people rather than the cars.
 *
 * Three things happen to a grid between seasons, and none of them was
 * happening. Contracts ran down to zero and were quietly deleted while
 * the driver kept his seat and kept racing — so "out of contract" was a
 * label with nothing behind it, and a driver nobody had agreed terms
 * with was still on the grid five years later. Nobody ever retired, so
 * the grid could only get older. And no seat ever came free by itself,
 * which meant a free agent had nowhere to go even if one had existed.
 *
 * This is that winter, in the order it actually happens:
 *
 *   1. RETIREMENTS   old drivers leave the sport for good
 *   2. EXPIRIES      deals run out; a team either renews or lets go
 *   3. FREE AGENCY   whoever is left without a seat is on the market
 *   4. REFILLING     rival teams fill the seats that opened
 *
 * The player's team is deliberately excluded from step 4 — and from the
 * automatic renewals in step 2. Losing a driver because nobody agreed
 * new terms is exactly the consequence the player is being asked to
 * manage, and quietly re-signing him for them would be the same bug in
 * a friendlier costume.
 * ===================================================================== */

/** Most drivers who may retire in one winter, however the dice fall. */
const MAX_RETIREMENTS_PER_SEASON = 4;

function seededUnit(season: number, key: string): number {
  let hash = season * 2654435761;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

const teamName = (teamId: string) =>
  GRID_2026_TEAMS.find((team) => team.id === teamId)?.name ?? teamId;

/* ------------------------------ free agents ---------------------------- */

/**
 * Everybody in the game without a seat and without a helmet on a nail.
 *
 * A driver is a free agent when they hold no contract, are not in the
 * feeder series, and have not retired. That is the whole definition, and
 * keeping it derived rather than stored means a driver cannot end up on
 * two lists at once.
 */
export function freeAgents(state: GameState): string[] {
  const retired = new Set(state.retiredDriverIds ?? []);
  const juniors = new Set(state.prospects.map((entry) => entry.id));

  return Object.keys(state.driverRecords)
    .filter(
      (driverId) =>
        !state.driverTeams[driverId] && !retired.has(driverId) && !juniors.has(driverId),
    )
    .sort((a, b) => ratingOf(state, b) - ratingOf(state, a));
}

export function isFreeAgent(state: GameState, driverId: string): boolean {
  const retired = new Set(state.retiredDriverIds ?? []);
  return (
    Boolean(state.driverRecords[driverId]) &&
    !state.driverTeams[driverId] &&
    !retired.has(driverId) &&
    !state.prospects.some((entry) => entry.id === driverId)
  );
}

function ratingOf(state: GameState, driverId: string): number {
  const driver = effectiveDriver(state, driverId);
  return driver ? driverRating(driver) : 0;
}

/* ------------------------------ retirement ----------------------------- */

/**
 * Runs the retirement check across everybody still racing, oldest first,
 * and stops at the cap. Mutates: retired drivers leave their seat, their
 * contract and the grid.
 */
export function runRetirements(state: GameState): RetirementNote[] {
  const retired = new Set(state.retiredDriverIds ?? []);
  const juniors = new Set(state.prospects.map((entry) => entry.id));

  const candidates = Object.values(state.driverRecords)
    .filter((record) => !retired.has(record.driverId) && !juniors.has(record.driverId))
    .sort((a, b) => b.age - a.age);

  const notes: RetirementNote[] = [];
  for (const record of candidates) {
    if (notes.length >= MAX_RETIREMENTS_PER_SEASON) break;
    const note = retirementCheck(state, record.driverId);
    if (!note) continue;

    notes.push(note);
    leaveSquad(state, record.driverId);
    delete state.deals[record.driverId];
    record.retiredInSeason = state.season;
    state.retiredDriverIds = [...(state.retiredDriverIds ?? []), record.driverId];
  }

  return notes;
}

/* ------------------------------- expiries ------------------------------ */

export interface ExpiryNote {
  driverId: string;
  teamId: string;
  /** Renewed by the team, or released onto the market. */
  outcome: 'RENEWED' | 'RELEASED';
  seasons: number;
  salary: number;
}

/**
 * Whether an AI team re-signs a driver whose deal has run out.
 *
 * The team is weighing what they have against what the winter market
 * could get them: a quick driver is kept, an old one is not, and a
 * driver who was carrying the car is kept even when he is old. The
 * player's team is never asked — that decision is theirs to make on the
 * driver market screen, and forgetting to make it is the point.
 */
function rivalWillRenew(state: GameState, deal: DriverDeal): boolean {
  const driver = effectiveDriver(state, deal.driverId);
  if (!driver) return false;

  const rating = driverRating(driver);
  const record = state.driverRecords[deal.driverId];
  const age = record?.age ?? driver.age;

  /* A rating of 78 is a driver most teams would keep; every year past
   * thirty-three takes some of that away, and a race seat is worth more
   * to a team than a reserve they are paying to wait. */
  let appetite = (rating - 70) / 22;
  if (age > 33) appetite -= (age - 33) * 0.12;
  if (deal.role === 'RESERVE') appetite -= 0.2;
  // Points on the board this year argue for themselves.
  const points = state.standings.drivers.find((row) => row.driverId === deal.driverId)?.points ?? 0;
  if (points > 0) appetite += Math.min(0.35, points / 180);

  return seededUnit(state.season, `${deal.driverId}:renew`) < appetite;
}

/**
 * Winds every contract down a year and settles the ones that ran out.
 *
 * This is the fix for the reported bug. A deal reaching zero used to be
 * deleted and nothing else — the driver stayed in `driverTeams`, stayed
 * in the line-up, and took the grid on Sunday under no contract at all.
 * Now the seat goes with the contract: a rival may re-sign him, and if
 * nobody does he leaves the team and is a free agent.
 */
export function runContractExpiries(state: GameState): ExpiryNote[] {
  for (const deal of Object.values(state.deals)) {
    deal.seasonsRemaining -= 1;
  }

  const notes: ExpiryNote[] = [];

  for (const [driverId, deal] of Object.entries(state.deals)) {
    if (deal.seasonsRemaining > 0) continue;

    const isPlayers = deal.teamId === state.playerTeamId;
    if (!isPlayers && rivalWillRenew(state, deal)) {
      /* Renewed on the spot, for a term that reflects how much they are
       * wanted. A rival's paperwork does not need the player's attention. */
      const seasons = 1 + Math.floor(seededUnit(state.season, `${driverId}:term`) * 3);
      const driver = effectiveDriver(state, driverId);
      const rating = driver ? driverRating(driver) : 70;
      const salary = Math.round((deal.salary * (0.9 + rating / 200)) / 100_000) * 100_000;

      state.deals[driverId] = {
        ...deal,
        salary,
        seasonsRemaining: seasons,
        signedInSeason: state.season,
      };

      notes.push({ driverId, teamId: deal.teamId, outcome: 'RENEWED', seasons, salary });
      continue;
    }

    /* Nobody agreed terms, so the deal is over and so is the driver's
     * time at the team. Both have to go: leaving the seat map alone is
     * exactly what let an out-of-contract driver keep racing. */
    delete state.deals[driverId];
    leaveSquad(state, driverId);
    notes.push({
      driverId,
      teamId: deal.teamId,
      outcome: 'RELEASED',
      seasons: 0,
      salary: deal.salary,
    });
  }

  return notes;
}

/* ------------------------------- refilling ----------------------------- */

export interface SigningNote {
  driverId: string;
  teamId: string;
  from: 'FREE_AGENT' | 'FEEDER_SERIES';
  note: string;
}

/**
 * Rival teams fill the seats the winter emptied.
 *
 * A grid with nineteen cars on it is not a grid, so every team but the
 * player's signs back up to two: the best free agent who will have them,
 * and if the market is bare, the best junior in the feeder series. The
 * order matters — teams higher up the championship pick first, which is
 * what makes the top of the market genuinely competitive.
 *
 * The player's team is left exactly as they left it. An empty seat is
 * something they have to notice and fix.
 */
export function refillGrid(state: GameState): SigningNote[] {
  const notes: SigningNote[] = [];

  const teamsByStanding = state.teams
    .map((team) => team.teamId)
    .filter((teamId) => teamId !== state.playerTeamId)
    .sort(
      (a, b) =>
        (state.standings.constructors.find((row) => row.teamId === a)?.position ?? 99) -
        (state.standings.constructors.find((row) => row.teamId === b)?.position ?? 99),
    );

  for (const teamId of teamsByStanding) {
    while (raceDriversOf(state, teamId).length < GRID_SEATS_PER_TEAM) {
      /* The actual decision a team principal makes in December: the best
       * driver going, or the best kid in the feeder series. A free agent
       * is what they are today; a junior is mostly what they might be,
       * so their ceiling counts for something but not for everything.
       *
       * Taking the free agent unconditionally would be simpler and
       * wrong in both directions — the grid would fill with drivers
       * nobody rates, and every mediocre free agent would be gone
       * before the player could look at the market. */
      const signing = freeAgents(state)[0];
      const junior = bestJunior(state);

      const agentWorth = signing ? ratingOf(state, signing) : -Infinity;
      const juniorWorth = junior
        ? juniorReadiness(state, junior) + (junior.potential - juniorReadiness(state, junior)) * 0.45
        : -Infinity;

      if (signing && agentWorth >= juniorWorth) {
        joinSquad(state, signing, teamId);
        state.deals[signing] = newDeal(state, signing, teamId);
        notes.push({
          driverId: signing,
          teamId,
          from: 'FREE_AGENT',
          note: `${teamName(teamId)} sign ${effectiveDriver(state, signing)?.lastName ?? signing}, out of contract since the end of the season.`,
        });
        continue;
      }

      if (!junior) break;

      promoteJunior(state, junior, teamId);
      notes.push({
        driverId: junior.id,
        teamId,
        from: 'FEEDER_SERIES',
        note: `${teamName(teamId)} promote ${junior.firstName} ${junior.lastName} (${junior.age}) from the feeder series.`,
      });
    }
  }

  return notes;
}

/** What a junior is worth today, before any of the promise is counted. */
function juniorReadiness(state: GameState, junior: ProspectDriver): number {
  return driverRating({
    ...junior,
    teamId: '',
    country: junior.countryCode,
    carNumber: 0,
    morale: 80,
    fitness: 92,
    contract: {
      salaryPerSeason: junior.salary,
      expiresAfterSeason: state.season,
      buyoutClause: 0,
      bonusPerWin: 0,
    },
  });
}

/** The junior a team would actually pick: last year's F2 order decides. */
function bestJunior(state: GameState): ProspectDriver | null {
  const placeOf = new Map(
    (state.f2?.standings ?? []).map((row) => [row.driverId, row.position]),
  );

  const ranked = [...state.prospects]
    .filter((entry) => !state.driverTeams[entry.id])
    .sort((a, b) => {
      const pa = placeOf.get(a.id);
      const pb = placeOf.get(b.id);
      // Somebody who actually won races comes before a promising card.
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return b.potential - a.potential;
    });

  return ranked[0] ?? null;
}

/**
 * Moves a junior out of the feeder series and into an F1 seat.
 *
 * Everything a promoted junior needs happens here so it cannot be done
 * three different ways in three places: they leave the F2 field and a
 * new talent replaces them, they are copied somewhere durable, and they
 * get a contract. The record and condition are the caller's to seed.
 */
export function promoteJunior(
  state: GameState,
  junior: ProspectDriver,
  teamId: string,
): void {
  joinSquad(state, junior.id, teamId);
  state.deals[junior.id] = newDeal(state, junior.id, teamId, junior.salary);

  /* Durable copy first: the feeder field is about to stop naming them,
   * and a driver nothing can resolve holds a seat under a blank name. */
  if (!state.academyDrivers.some((entry) => entry.id === junior.id)) {
    state.academyDrivers.push({ ...junior, attributes: { ...junior.attributes } });
  }

  /* The record and the condition are what make somebody an F1 driver
   * rather than a junior: the ageing curve, the free-agent market and
   * the retirement notices all key off the record, which is exactly why
   * the feeder series does not hand them out. This is the crossing. */
  if (!state.driverRecords[junior.id]) {
    state.driverRecords[junior.id] = blankRecord(junior.id, junior.age);
  }
  if (!state.driverConditions[junior.id]) {
    // A junior arrives keen and largely unbothered by anything yet.
    state.driverConditions[junior.id] = blankCondition(junior.id, 82);
  }

  // Promoted out of the series, and the seat behind them is filled.
  state.prospects = replaceInField(state.prospects, junior.id, state.season);
}

function newDeal(
  state: GameState,
  driverId: string,
  teamId: string,
  salaryHint?: number,
): DriverDeal {
  const driver = effectiveDriver(state, driverId);
  const rating = driver ? driverRating(driver) : 70;
  const salary =
    salaryHint ?? Math.round((1_200_000 + Math.pow(Math.max(0, rating - 55), 2.1) * 5_400) / 100_000) * 100_000;

  return {
    driverId,
    teamId,
    salary,
    seasonsRemaining: 1 + Math.floor(seededUnit(state.season, `${driverId}:newterm`) * 3),
    signedInSeason: state.season,
    signingBonus: 0,
    buyoutClause: Math.round(salary * 1.6),
    role: raceDriversOf(state, teamId).includes(driverId) ? 'RACE' : 'RESERVE',
  };
}

/* ------------------------------- attrition ------------------------------ */

/** Winters a driver will wait for a seat before taking a drive elsewhere. */
const PATIENCE_SEASONS = 2;

/**
 * Free agents who never found a drive leave the sport.
 *
 * Retirement handles the old; this handles everybody else. A driver
 * dropped at twenty-seven does not sit in the paddock for a decade
 * hoping — they take a seat in another category and are not coming
 * back. Without it the free-agent list is a queue that only grows, and
 * every rival team signs from a pool of seventy names nobody recognises.
 *
 * A quick young driver gets an extra winter, because somebody would
 * genuinely have called. Run after the seats have been refilled, so
 * anybody who found a drive this winter is not counted as waiting.
 */
export function runAttrition(state: GameState): string[] {
  const retired = new Set(state.retiredDriverIds ?? []);
  const juniors = new Set(state.prospects.map((entry) => entry.id));
  const gone: string[] = [];

  for (const record of Object.values(state.driverRecords)) {
    if (retired.has(record.driverId) || juniors.has(record.driverId)) continue;

    if (state.driverTeams[record.driverId]) {
      record.seasonsWithoutSeat = 0;
      continue;
    }

    const waited = (record.seasonsWithoutSeat ?? 0) + 1;
    record.seasonsWithoutSeat = waited;

    /* Somebody worth waiting for is waited for — one winter longer, and
     * only while they are young enough for it to be worth anybody's
     * while. */
    const promising = record.age <= 28 && ratingOf(state, record.driverId) >= 76;
    if (waited < PATIENCE_SEASONS + (promising ? 1 : 0)) continue;

    record.retiredInSeason = state.season;
    state.retiredDriverIds = [...(state.retiredDriverIds ?? []), record.driverId];
    gone.push(record.driverId);
  }

  return gone;
}

/** Seats the player is short of, which is the one thing they must fix. */
export function emptyPlayerSeats(state: GameState): number {
  if (!state.playerTeamId) return 0;
  return Math.max(0, GRID_SEATS_PER_TEAM - raceDriversOf(state, state.playerTeamId).length);
}

/** Everybody on the player's books, for the "who is left" report. */
export function playerSquadSize(state: GameState): number {
  return squadOf(state, state.playerTeamId).length;
}
