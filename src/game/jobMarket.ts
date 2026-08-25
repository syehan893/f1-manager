import { GRID_2026_TEAMS, gridTeamOf } from '@/data/grid2026';
import type { GameState, JobApplication, JobOpening, JobRole, RaceResult } from './types';

/* =====================================================================
 * Job market.
 *
 * Every rival team advertises a role. Whether an application succeeds is
 * judged against `managerPerformanceScore`, which moves with results —
 * so the way into a front-running seat is to over-deliver in a slower car.
 * ===================================================================== */

export const ROLE_LABEL: Record<JobRole, string> = {
  TEAM_PRINCIPAL: 'Team Principal',
  TECHNICAL_DIRECTOR: 'Technical Director',
  SPORTING_DIRECTOR: 'Sporting Director',
};

/** Bigger teams advertise more senior roles and demand more. */
function roleForPrestige(prestige: number): JobRole {
  if (prestige >= 90) return 'TEAM_PRINCIPAL';
  if (prestige >= 70) return 'TECHNICAL_DIRECTOR';
  return 'SPORTING_DIRECTOR';
}

function noteFor(prestige: number, score: number, required: number): string {
  if (score >= required + 12) return 'Your record speaks for itself — they are keen.';
  if (score >= required) return 'You meet their bar. A strong application.';
  if (score >= required - 10) return 'A stretch. They would want convincing.';
  return prestige >= 90
    ? 'Far beyond your current standing.'
    : 'They are looking for a more established name.';
}

/** Openings at every team except the one the player currently runs. */
export function jobOpenings(state: GameState): JobOpening[] {
  return GRID_2026_TEAMS.filter((team) => team.id !== state.playerTeamId).map((team) => {
    const role = roleForPrestige(team.prestige);
    const budget = state.teams.find((t) => t.teamId === team.id)?.budget ?? team.budget;

    return {
      teamId: team.id,
      role,
      requiredScore: team.hiringBar,
      salary: Math.round(budget * 0.012),
      note: noteFor(team.prestige, state.managerPerformanceScore, team.hiringBar),
    };
  });
}

export interface ApplicationOutcome {
  application: JobApplication;
  /** Set when the move is accepted; the player switches teams. */
  newTeamId?: string;
}

/**
 * Resolve an application. Meeting the bar is not automatic — there is a
 * narrow band either side where the decision is a coin weighted by how
 * far above or below the bar the manager sits.
 */
export function evaluateApplication(
  state: GameState,
  opening: JobOpening,
  random: number,
): ApplicationOutcome {
  const score = state.managerPerformanceScore;
  const delta = score - opening.requiredScore;

  // 0 at -15, 1 at +15, linear in between.
  const chance = Math.max(0, Math.min(1, (delta + 15) / 30));
  const accepted = random < chance;

  const team = gridTeamOf(opening.teamId);
  const message = accepted
    ? `${team.name} have accepted your application for ${ROLE_LABEL[opening.role]}.`
    : delta < -15
      ? `${team.name} rejected your application outright — they want a rating of ${opening.requiredScore}, you are on ${Math.round(score)}.`
      : `${team.name} passed on your application this time. Keep delivering results.`;

  const application: JobApplication = {
    id: `job-${state.season}-${state.round}-${opening.teamId}-${Date.now()}`,
    teamId: opening.teamId,
    role: opening.role,
    season: state.season,
    round: state.round,
    accepted,
    scoreAtApplication: Math.round(score),
    requiredScore: opening.requiredScore,
    message,
  };

  return accepted ? { application, newTeamId: opening.teamId } : { application };
}

/**
 * Move the manager rating after a race. Beating the car's expected
 * finishing position raises it; being beaten by it costs.
 */
export function updateManagerScore(
  currentScore: number,
  result: RaceResult,
  playerTeamId: string | null,
  expectedPosition: number,
): number {
  if (!playerTeamId) return currentScore;

  const ourFinishes = result.finishers.filter((f) => f.teamId === playerTeamId);
  if (ourFinishes.length === 0) return currentScore;

  const best = Math.min(...ourFinishes.map((f) => f.position));
  const retirements = ourFinishes.filter((f) => f.status === 'DNF').length;

  // Each place better than expected is worth a little; each place worse costs.
  const delta = (expectedPosition - best) * 0.9 - retirements * 1.2;
  return Math.max(0, Math.min(100, currentScore + delta));
}

/** Where a team's car ought to finish, used as the performance baseline. */
export function expectedPositionFor(state: GameState, teamId: string | null): number {
  if (!teamId) return 10;

  const ranked = [...state.teams].sort((a, b) => {
    const carA = a.car.pace + a.car.aero + a.car.powerUnit;
    const carB = b.car.pace + b.car.aero + b.car.powerUnit;
    return carB - carA;
  });

  const index = ranked.findIndex((team) => team.teamId === teamId);
  // Two cars per team, so the leading car of team N starts around 2N-1.
  return index < 0 ? 10 : index * 2 + 1;
}
