import type { GameState } from './types';

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
