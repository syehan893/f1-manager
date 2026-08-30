import { effectiveDriver } from './driverDevelopment';
import { carStatsOf } from './carModel';
import type { CarStats } from '@/data/grid2026';
import type { GameState, TeamSeasonState } from './types';

/* =====================================================================
 * Who is on the books, and who is in the car.
 *
 * `driverTeams` says which team a driver belongs to and nothing else. It
 * always could have held three, four, five drivers against one team —
 * nothing in its shape forbade it — but every seat change in the game
 * was written as a swap, so a squad could never actually grow. Promoting
 * a junior meant an established driver was posted out of the door in the
 * same breath, which is not what promoting somebody means.
 *
 * So the squad and the entry list are separated here:
 *
 *   squad     everyone under contract to a team, however many that is
 *   race seats the first two of them, and only ever two
 *   reserves  the rest — they train, they are paid, they wait
 *
 * `lineups` is the running order within a squad. The first two names are
 * the ones that take the grid on Sunday; promoting somebody moves them
 * up that list rather than moving anybody out of the team. A squad with
 * no stored order falls back to the order the seat map yields, so an old
 * save and a fresh one both read as a sane two-car team.
 * ===================================================================== */

/** Cars a team may enter. The regulations, not a preference. */
export const GRID_SEATS_PER_TEAM = 2;

/** Most drivers one team may hold contracts with at once. */
export const MAX_SQUAD_SIZE = 4;

/** Everyone contracted to a team, race drivers first, in lineup order. */
export function squadOf(state: GameState, teamId: string | null): string[] {
  if (!teamId) return [];

  const members = Object.entries(state.driverTeams)
    .filter(([, entry]) => entry === teamId)
    .map(([driverId]) => driverId);

  const order = state.lineups?.[teamId] ?? [];
  const membership = new Set(members);

  /* The stored order can name drivers who have since left, and the seat
   * map can hold drivers the order has never heard of — a mid-season
   * signing, or a save written before line-ups existed. Take the stored
   * order for as far as it still applies, then append the rest. */
  const ranked = order.filter((driverId) => membership.has(driverId));
  const ranking = new Set(ranked);
  const unranked = members.filter((driverId) => !ranking.has(driverId));

  return [...ranked, ...unranked];
}

/** The two drivers this team actually enters. */
export function raceDriversOf(state: GameState, teamId: string | null): string[] {
  return squadOf(state, teamId).slice(0, GRID_SEATS_PER_TEAM);
}

/** Everyone else on the books: paid, developing, not racing. */
export function reserveDriversOf(state: GameState, teamId: string | null): string[] {
  return squadOf(state, teamId).slice(GRID_SEATS_PER_TEAM);
}

export function isRaceDriver(state: GameState, driverId: string): boolean {
  const teamId = state.driverTeams[driverId];
  return teamId ? raceDriversOf(state, teamId).includes(driverId) : false;
}

export function isReserveDriver(state: GameState, driverId: string): boolean {
  const teamId = state.driverTeams[driverId];
  return teamId ? reserveDriversOf(state, teamId).includes(driverId) : false;
}

/** Free race seats at a team — 0 once two drivers are entered. */
export function openSeatsAt(state: GameState, teamId: string): number {
  return Math.max(0, GRID_SEATS_PER_TEAM - raceDriversOf(state, teamId).length);
}

/** Room for another contract at all, race seat or not. */
export function squadHasRoom(state: GameState, teamId: string): boolean {
  return squadOf(state, teamId).length < MAX_SQUAD_SIZE;
}

/**
 * Every driver who takes the grid, in no particular order. This is the
 * entry list: two cars per team and not one more, whatever the squads
 * behind them look like.
 */
export function gridDriverIds(state: GameState): string[] {
  const teamIds = new Set(Object.values(state.driverTeams));
  const entries: string[] = [];
  for (const teamId of teamIds) entries.push(...raceDriversOf(state, teamId));
  return entries;
}

export function isOnGrid(state: GameState, driverId: string): boolean {
  return isRaceDriver(state, driverId);
}

/* ------------------------------ which car ------------------------------ */

/**
 * Which of the team's two cars a driver is in, or -1 if they are not
 * racing. One driver, one car: the first name in the line-up drives car
 * 1, the second drives car 2.
 */
export function carIndexOf(state: GameState, driverId: string): number {
  const teamId = state.driverTeams[driverId];
  if (!teamId) return -1;
  return raceDriversOf(state, teamId).indexOf(driverId);
}

/**
 * The statistics of the car this driver is actually in.
 *
 * Two cars in the same garage are two different machines once a season
 * has worn them unevenly, so anything that decides lap time has to ask
 * about the car rather than about the constructor.
 */
export function statsForDriver(
  state: GameState,
  driverId: string,
  team?: TeamSeasonState,
): CarStats {
  const resolved =
    team ?? state.teams.find((entry) => entry.teamId === state.driverTeams[driverId]);
  if (!resolved) return { ...FALLBACK_CAR };

  const index = carIndexOf(state, driverId);
  return carStatsOf(resolved, index < 0 ? 0 : index);
}

/** Used only when a driver has no team at all — a free agent on a screen. */
const FALLBACK_CAR: CarStats = {
  pace: 70, aero: 70, powerUnit: 70, electrical: 70, reliability: 70,
  pitCrew: 70, brakes: 70, suspension: 70, cooling: 70,
};

/* ---------------------------- how they drive --------------------------- */

/**
 * How hard one driver is on the car, as a multiplier on part wear.
 *
 * This is what makes two cars in the same garage need rebuilding on
 * different weekends. Three things feed it, and they are the three
 * things a driver is actually judged on by the mechanics:
 *
 *   smoothness   tyre management and consistency, which is the same
 *                mechanical sympathy that saves a set of brakes
 *   aggression   attack, which is worth lap time and costs the car
 *   the orders   the push level the pit wall gave them, because being
 *                told to race flat out is not free
 *
 * Roughly 0.75 for a smooth driver on a conservative plan to 1.35 for an
 * aggressive one being told to push — so a front wing that lasts three
 * weekends on one side of the garage lasts barely two on the other.
 */
export function driverWearFactor(state: GameState, driverId: string): number {
  const driver = effectiveDriver(state, driverId);
  if (!driver) return 1;

  const { tyreManagement, consistency, attack } = driver.attributes;

  /* Centred on 70, which is an average driver and therefore exactly 1.
   * Above it they save the car, below it they use it up. */
  const smoothness = ((tyreManagement + consistency) / 2 - 70) / 100;
  const aggression = (attack - 70) / 100;

  /* Push is the pit wall's own contribution, and the only part of this
   * the player can change without changing driver. 3 is neutral. */
  const push = (state.strategies[driverId]?.pushLevel ?? 3) - 3;

  /* A driver who is wound up is heavier on the car than the same driver
   * settled — the stress number finally doing something mechanical. */
  const stress = ((state.driverConditions[driverId]?.stress ?? 30) - 30) / 100;

  const factor = 1 - smoothness * 0.55 + aggression * 0.35 + push * 0.06 + stress * 0.25;
  return Math.max(0.7, Math.min(1.4, Math.round(factor * 100) / 100));
}

/* ------------------------------ mutation ------------------------------ */

/**
 * Rewrites one team's running order. Mutates, so pass a clone.
 *
 * Only drivers actually contracted to the team survive, so a stale name
 * can never hold a seat, and anybody the caller forgot is appended
 * rather than dropped — losing a driver by omission would be the same
 * bug in a new place.
 */
export function setLineup(state: GameState, teamId: string, order: string[]): void {
  const members = new Set(
    Object.entries(state.driverTeams)
      .filter(([, entry]) => entry === teamId)
      .map(([driverId]) => driverId),
  );

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const driverId of order) {
    if (!members.has(driverId) || seen.has(driverId)) continue;
    seen.add(driverId);
    cleaned.push(driverId);
  }
  for (const driverId of members) {
    if (!seen.has(driverId)) cleaned.push(driverId);
  }

  state.lineups = { ...state.lineups, [teamId]: cleaned };
}

/**
 * Adds a driver to a team's books. They take a race seat if one is free
 * and sit in reserve if not — nobody is displaced either way, which is
 * the entire point of the reserve bench.
 */
export function joinSquad(state: GameState, driverId: string, teamId: string): void {
  state.driverTeams[driverId] = teamId;
  setLineup(state, teamId, [...(state.lineups?.[teamId] ?? []), driverId]);
}

/** Takes a driver off a team's books, leaving the rest of the order intact. */
export function leaveSquad(state: GameState, driverId: string): void {
  const teamId = state.driverTeams[driverId];
  delete state.driverTeams[driverId];
  if (!teamId) return;
  setLineup(
    state,
    teamId,
    (state.lineups?.[teamId] ?? []).filter((entry) => entry !== driverId),
  );
}

/**
 * Moves a driver into a race seat, and whoever they displace into
 * reserve. This is what promotion means now: the demoted driver stays on
 * the books, on their contract, available again next weekend.
 *
 * Returns the driver who lost the seat, if anybody did.
 */
export function promoteToRaceSeat(
  state: GameState,
  driverId: string,
): { ok: false; reason: string } | { ok: true; demotedDriverId: string | null } {
  const teamId = state.driverTeams[driverId];
  if (!teamId) return { ok: false, reason: 'That driver is not under contract to anybody.' };

  const squad = squadOf(state, teamId);
  const current = squad.indexOf(driverId);
  if (current < 0) return { ok: false, reason: 'That driver is not in the squad.' };
  if (current < GRID_SEATS_PER_TEAM) {
    return { ok: false, reason: 'That driver already has a race seat.' };
  }

  /* The last race seat is the one that gives way — the team's number one
   * is not dropped because somebody was promoted past their team-mate. */
  const demotedDriverId = squad[GRID_SEATS_PER_TEAM - 1] ?? null;
  const rest = squad.filter((entry) => entry !== driverId && entry !== demotedDriverId);

  setLineup(state, teamId, [
    ...squad.slice(0, GRID_SEATS_PER_TEAM - 1),
    driverId,
    ...(demotedDriverId ? [demotedDriverId] : []),
    ...rest.filter((entry) => !squad.slice(0, GRID_SEATS_PER_TEAM - 1).includes(entry)),
  ]);

  return { ok: true, demotedDriverId };
}

/** Drops a race driver to the bench, pulling the first reserve up. */
export function demoteToReserve(
  state: GameState,
  driverId: string,
): { ok: false; reason: string } | { ok: true; promotedDriverId: string | null } {
  const teamId = state.driverTeams[driverId];
  if (!teamId) return { ok: false, reason: 'That driver is not under contract to anybody.' };

  const squad = squadOf(state, teamId);
  if (!squad.includes(driverId)) return { ok: false, reason: 'That driver is not in the squad.' };
  if (!raceDriversOf(state, teamId).includes(driverId)) {
    return { ok: false, reason: 'That driver is already a reserve.' };
  }

  const reserves = squad.slice(GRID_SEATS_PER_TEAM);
  const promotedDriverId = reserves[0] ?? null;
  if (!promotedDriverId) {
    /* Benching the second of two drivers would enter one car, and a
     * team that enters one car has forfeited half its season. */
    return { ok: false, reason: 'You need a reserve to put in the car before benching anybody.' };
  }

  setLineup(state, teamId, [
    ...squad.slice(0, GRID_SEATS_PER_TEAM).filter((entry) => entry !== driverId),
    promotedDriverId,
    driverId,
    ...reserves.filter((entry) => entry !== promotedDriverId),
  ]);

  return { ok: true, promotedDriverId };
}
