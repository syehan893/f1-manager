import { GRID_2026_TEAMS, driverRating } from '@/data/grid2026';
import { effectiveDriver } from './driverDevelopment';
import type { GameState, TransferMove } from './types';

/* =====================================================================
 * The silly season.
 *
 * At the end of a championship the rest of the grid reshuffles itself.
 * Without this the paddock is frozen: the same twenty-two drivers sit in
 * the same twenty-two seats forever, an ageing driver never loses a
 * drive, and a bad season costs nobody anything.
 *
 * The model is deliberately simple and legible, because the player has to
 * be able to see why a move happened:
 *
 *   1. Every driver is scored on the season they just had, measured
 *      against what their car should have delivered, and on their age.
 *   2. Teams rank their own two drivers and consider dropping the worse
 *      one if that score is bad enough.
 *   3. A dropped driver swaps seats with the best available driver at a
 *      team below them in the constructors' table — so moves are always
 *      two-way and the grid always has twenty-two cars on it.
 *
 * The player's own team is never touched: those are the player's calls to
 * make on the driver market screen.
 *
 * Everything is deterministic on (season, driverId), so reloading a save
 * cannot reroll the silly season into a better outcome.
 * ===================================================================== */

/** Age past which a decline starts to weigh against a driver. */
const DECLINE_AGE = 33;
/** Age past which a seat is genuinely at risk regardless of results. */
const RETIREMENT_AGE = 38;
/** Below this score a team starts looking for a replacement. */
const DROP_THRESHOLD = 42;
/** Most seats that may change hands in one off-season. */
const MAX_MOVES_PER_SEASON = 4;

function seededUnit(season: number, key: string): number {
  let hash = season * 2654435761;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

/**
 * How the season went for one driver, 0-100. The comparison that matters
 * is against their own team-mate in the same machinery — that is the only
 * fair read on whether a driver under-delivered or was simply in a bad
 * car.
 */
export function seasonScore(state: GameState, driverId: string): number {
  // Their rating as it is now, not as the data file first described it —
  // ageing and form are exactly what the paddock is judging.
  const driver = effectiveDriver(state, driverId);
  if (!driver) return 50;

  const teamId = state.driverTeams[driverId];
  const row = state.standings.drivers.find((entry) => entry.driverId === driverId);
  const points = row?.points ?? 0;

  const mate = Object.entries(state.driverTeams).find(
    ([id, team]) => team === teamId && id !== driverId,
  )?.[0];
  const matePoints = mate
    ? (state.standings.drivers.find((entry) => entry.driverId === mate)?.points ?? 0)
    : 0;

  /* Share of the team's points. 0.5 is level with the team-mate, which is
   * a perfectly respectable season whatever the car. */
  const teamPoints = points + matePoints;
  const share = teamPoints > 0 ? points / teamPoints : 0.5;

  // Raw ability still counts — a quick driver in a bad car keeps a seat.
  const ability = driverRating(driver);

  // Age is a slow, then sudden, decline.
  const agePenalty =
    driver.age <= DECLINE_AGE
      ? 0
      : Math.pow(driver.age - DECLINE_AGE, 1.6) * (driver.age >= RETIREMENT_AGE ? 2.4 : 1.1);

  return Math.max(0, Math.min(100, share * 58 + ability * 0.46 - agePenalty));
}

/** Constructors' position, used to rank which seats are worth having. */
function standingOf(state: GameState, teamId: string): number {
  return (
    state.standings.constructors.find((row) => row.teamId === teamId)?.position ??
    state.teams.length
  );
}

/**
 * Runs the off-season for every team except the player's. Returns the
 * moves; applying them is the machine's job.
 */
export function runSillySeason(state: GameState): TransferMove[] {
  const season = state.season;
  const moves: TransferMove[] = [];
  const settled = new Set<string>();

  /* Rank every seat on the grid, worst score first — the most obviously
   * unearned drive is the one the paddock deals with first. */
  const seats = Object.entries(state.driverTeams)
    .filter(([, teamId]) => teamId !== state.playerTeamId)
    .map(([driverId, teamId]) => ({
      driverId,
      teamId,
      score: seasonScore(state, driverId),
      age: state.driverRecords[driverId]?.age ?? effectiveDriver(state, driverId)?.age ?? 28,
      standing: standingOf(state, teamId),
    }))
    .sort((a, b) => a.score - b.score);

  for (const seat of seats) {
    if (moves.length >= MAX_MOVES_PER_SEASON) break;
    if (settled.has(seat.driverId)) continue;

    const ageing = seat.age >= RETIREMENT_AGE;
    const underperforming = seat.score < DROP_THRESHOLD;
    if (!ageing && !underperforming) continue;

    /* Teams do not clear a seat on a coin toss — a marginal case survives
     * more often than not, so the grid changes without churning. */
    const conviction = seededUnit(season, `${seat.driverId}:${seat.teamId}`);
    const pressure = ageing ? 0.75 : (DROP_THRESHOLD - seat.score) / DROP_THRESHOLD;
    if (conviction > pressure) continue;

    /* The replacement comes from a team lower down the order who would
     * take the promotion, and who is scoring better than the incumbent.
     * That keeps every move two-way and every team on two cars. */
    const candidate = seats
      .filter(
        (other) =>
          !settled.has(other.driverId) &&
          other.driverId !== seat.driverId &&
          other.teamId !== seat.teamId &&
          other.standing > seat.standing &&
          other.score > seat.score + 8,
      )
      .sort((a, b) => b.score - a.score)[0];

    if (!candidate) continue;

    settled.add(seat.driverId);
    settled.add(candidate.driverId);

    const incoming = effectiveDriver(state, candidate.driverId);
    const outgoing = effectiveDriver(state, seat.driverId);
    const team = GRID_2026_TEAMS.find((entry) => entry.id === seat.teamId);
    const fromTeam = GRID_2026_TEAMS.find((entry) => entry.id === candidate.teamId);

    moves.push({
      season,
      incomingDriverId: candidate.driverId,
      outgoingDriverId: seat.driverId,
      fromTeamId: candidate.teamId,
      toTeamId: seat.teamId,
      reason: ageing ? 'AGE' : 'PERFORMANCE',
      note: ageing
        ? `${team?.name ?? seat.teamId} move on from ${outgoing?.lastName ?? seat.driverId} at ${seat.age}, promoting ${incoming?.lastName ?? candidate.driverId} from ${fromTeam?.name ?? candidate.teamId}.`
        : `${team?.name ?? seat.teamId} replace ${outgoing?.lastName ?? seat.driverId} after a poor season with ${incoming?.lastName ?? candidate.driverId} of ${fromTeam?.name ?? candidate.teamId}.`,
    });
  }

  /* ---- juniors ---------------------------------------------------- *
   * A team that has cleared a seat and cannot find anybody better on the
   * grid takes a chance on the intake instead. This is what stops the
   * junior class being a shop window only the player ever buys from, and
   * it means a prospect the player passes on can turn up in a rival car
   * the following year. */
  const unsignedProspects = state.prospects
    .filter((prospect) => !state.driverTeams[prospect.id])
    .sort((a, b) => b.potential - a.potential);

  if (unsignedProspects.length > 0 && moves.length < MAX_MOVES_PER_SEASON) {
    for (const seat of seats) {
      if (moves.length >= MAX_MOVES_PER_SEASON) break;
      if (settled.has(seat.driverId)) continue;
      // Only the genuinely poor seats, and only from the back of the grid
      // where a rookie is a smaller gamble than another year of the same.
      if (seat.score >= DROP_THRESHOLD - 6 && seat.age < RETIREMENT_AGE) continue;
      if (seat.standing <= 4) continue;

      const conviction = seededUnit(season + 1, `${seat.driverId}:junior`);
      if (conviction > 0.45) continue;

      const prospect = unsignedProspects.shift();
      if (!prospect) break;

      settled.add(seat.driverId);
      settled.add(prospect.id);

      const team = GRID_2026_TEAMS.find((entry) => entry.id === seat.teamId);
      moves.push({
        season,
        incomingDriverId: prospect.id,
        outgoingDriverId: seat.driverId,
        // A dropped driver with nowhere to go becomes a free agent.
        fromTeamId: '',
        toTeamId: seat.teamId,
        reason: 'YOUTH',
        note: `${team?.name ?? seat.teamId} promote ${prospect.firstName} ${prospect.lastName} (${prospect.age}) from the junior programme, ending ${effectiveDriver(state, seat.driverId)?.lastName ?? seat.driverId}'s run.`,
      });
    }
  }

  return moves;
}

/** Applies the moves to a save's seat map. Mutates, so pass a clone. */
export function applyTransferMoves(state: GameState, moves: TransferMove[]): void {
  for (const move of moves) {
    state.driverTeams[move.incomingDriverId] = move.toTeamId;

    if (move.fromTeamId) {
      state.driverTeams[move.outgoingDriverId] = move.fromTeamId;
    } else {
      // Nowhere to go: the seat is lost and they leave the grid.
      delete state.driverTeams[move.outgoingDriverId];
    }

    // A promoted junior needs a career record like anybody else.
    if (!state.driverRecords[move.incomingDriverId]) {
      const prospect = state.prospects.find((entry) => entry.id === move.incomingDriverId);
      if (prospect) {
        state.driverRecords[prospect.id] = {
          driverId: prospect.id,
          age: prospect.age,
          deltas: {},
          seasonsRun: 0,
          careerPoints: 0,
          careerWins: 0,
          careerPodiums: 0,
        };
      }
    }
  }
}
