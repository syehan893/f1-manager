import { ROLES, ROLE_BY_ID, buildStaffMarket } from '@/data/staff';
import type { StaffCandidate, StaffRole } from '@/data/staff';
import type { GameState, RndArea, StaffAppointment } from './types';

/* =====================================================================
 * Staffing.
 *
 * The bridge between "you hired somebody" and "a number changed". Every
 * effect here is read by the same helper the rest of the game already
 * uses — R&D efficiency, build weeks, sponsor payouts, pit-stop time —
 * so an appointment compounds with the facility that covers the same
 * ground rather than living in a parallel universe.
 *
 * Ratings are converted to effects around a neutral 60: a 60-rated hire
 * changes nothing, better is a gain, worse is an active drag. That is
 * what makes leaving a seat empty a real cost rather than a saving.
 * ===================================================================== */

/** The rating at which a hire is exactly neutral. */
const NEUTRAL_RATING = 60;

/** An empty seat is worse than a mediocre hire, but not catastrophic. */
const VACANT_RATING = 44;

export function effectiveRating(state: GameState, role: StaffRole): number {
  const appointment = state.staff.find((entry) => entry.role === role);
  return appointment?.rating ?? VACANT_RATING;
}

/** −1..+1 how far above or below neutral this role is staffed. */
function edge(state: GameState, role: StaffRole): number {
  return (effectiveRating(state, role) - NEUTRAL_RATING) / 40;
}

/* ------------------------------- effects ------------------------------- */

/**
 * Multiplier on R&D points bought in an area, from the people rather than
 * the buildings. The technical director lifts everything; the discipline
 * leads lift their own ground on top.
 */
export function staffRndEfficiency(state: GameState, area: RndArea): number {
  let multiplier = 1 + edge(state, 'TECHNICAL_DIRECTOR') * 0.14;

  if (area === 'aero' || area === 'suspension') {
    multiplier += edge(state, 'AERODYNAMICIST') * 0.16;
  }
  if (area === 'powerUnit' || area === 'electrical' || area === 'cooling') {
    multiplier += edge(state, 'POWER_UNIT_ENGINEER') * 0.16;
  }
  if (area === 'reliability' || area === 'brakes') {
    multiplier += edge(state, 'CHIEF_MECHANIC') * 0.12;
  }
  if (area === 'pitCrew') {
    multiplier += edge(state, 'CHIEF_MECHANIC') * 0.2;
  }

  return Math.max(0.55, multiplier);
}

/** Weeks a strong technical director takes off a component build. */
export function staffBuildTimeReduction(state: GameState): number {
  return effectiveRating(state, 'TECHNICAL_DIRECTOR') >= 85 ? 1 : 0;
}

/** Multiplier on sponsor money, from the principal fronting the team. */
export function staffMarketingMultiplier(state: GameState): number {
  return Math.max(0.75, 1 + edge(state, 'TEAM_PRINCIPAL') * 0.16);
}

/** Fractional single-lap gain in qualifying from the analysis group. */
export function staffQualifyingEdge(state: GameState): number {
  return edge(state, 'DATA_ANALYST') * 0.006;
}

/** Fractional race-pace gain applied to the player's cars. */
export function staffRacePaceEdge(state: GameState): number {
  return edge(state, 'RACE_ENGINEER') * 0.004;
}

/** Points added to the effective pit-crew rating on a Sunday. */
export function staffPitCrewBonus(state: GameState): number {
  return Math.round(edge(state, 'CHIEF_MECHANIC') * 12);
}

/** Points added to the car's effective reliability during a race. */
export function staffReliabilityBonus(state: GameState): number {
  return Math.round(edge(state, 'CHIEF_MECHANIC') * 8);
}

/**
 * Multiplier on tyre wear. A good strategist gets more out of a set by
 * finding the setup and the delta that looks after it.
 */
export function staffTyreWearMultiplier(state: GameState): number {
  return Math.max(0.8, 1 - edge(state, 'STRATEGIST') * 0.09);
}

/** Extra reputation growth per round from a well-regarded principal. */
export function staffReputationBonus(state: GameState): number {
  return edge(state, 'TEAM_PRINCIPAL') * 0.8;
}

/* -------------------------------- money -------------------------------- */

/** Combined staff salary bill for the season. */
export function seasonStaffBill(state: GameState): number {
  return state.staff.reduce((sum, entry) => sum + entry.salary, 0);
}

/** Staff salary charged per round, alongside the drivers'. */
export function roundStaffBill(state: GameState): number {
  return Math.round(seasonStaffBill(state) / Math.max(1, state.settings.seasonLength));
}

/** Releasing someone early costs the remainder of the year, halved. */
export function severanceFor(appointment: StaffAppointment, state: GameState): number {
  const roundsLeft = Math.max(0, state.settings.seasonLength - state.round + 1);
  const perRound = appointment.salary / Math.max(1, state.settings.seasonLength);
  return Math.round(perRound * roundsLeft * 0.5);
}

/* ------------------------------- the market ---------------------------- */

export interface StaffAvailability {
  ok: boolean;
  reason?: string;
}

/** Every candidate on the market this season, with the seat they'd fill. */
export function staffMarket(state: GameState): StaffCandidate[] {
  return buildStaffMarket(
    state.season,
    state.teams.map((team) => team.teamId),
  ).filter((candidate) => candidate.currentTeamId !== state.playerTeamId);
}

/**
 * Whether this appointment can be made right now. Cost is checked by the
 * reducer, which owns the money; this is about the seat itself.
 */
export function canHire(state: GameState, candidate: StaffCandidate): StaffAvailability {
  if (state.staff.some((entry) => entry.candidateId === candidate.id)) {
    return { ok: false, reason: 'Already on your staff.' };
  }
  const incumbent = state.staff.find((entry) => entry.role === candidate.role);
  if (incumbent) {
    return {
      ok: false,
      reason: `${ROLE_BY_ID.get(candidate.role)?.label ?? candidate.role} is filled by ${incumbent.name}. Release them first.`,
    };
  }
  return { ok: true };
}

/** Total cash needed today to bring someone in. */
export function hireCost(candidate: StaffCandidate): number {
  return candidate.signingFee;
}

export function appointmentFrom(
  candidate: StaffCandidate,
  season: number,
): StaffAppointment {
  return {
    candidateId: candidate.id,
    role: candidate.role,
    name: candidate.name,
    rating: candidate.rating,
    salary: candidate.salary,
    countryCode: candidate.countryCode,
    hiredInSeason: season,
  };
}

/** Roles with nobody in them — the ones actively costing performance. */
export function vacantRoles(state: GameState): StaffRole[] {
  const filled = new Set(state.staff.map((entry) => entry.role));
  return ROLES.filter((role) => !filled.has(role.id)).map((role) => role.id);
}

export interface ContributionLine {
  role: StaffRole;
  label: string;
  /** What this appointment is doing right now, stated as an outcome. */
  effect: string;
  /** Signed percentage-style figure for the headline number. */
  value: number;
  /** How `value` should be read. */
  unit: '%' | 'pts' | 'wk';
  filled: boolean;
}

/**
 * What every seat is actually contributing, computed from the same
 * helpers the rest of the game reads. This is the answer to "what did
 * hiring them buy me" — and, when a seat is empty, to "what is that
 * costing me", which is the harder question to see.
 */
export function contributions(state: GameState): ContributionLine[] {
  const filled = (role: StaffRole) => state.staff.some((entry) => entry.role === role);
  const pct = (multiplier: number) => Math.round((multiplier - 1) * 1000) / 10;

  return [
    {
      role: 'TEAM_PRINCIPAL',
      label: 'Sponsor income',
      effect: 'Applied to every retainer, bonus and signing fee.',
      value: pct(staffMarketingMultiplier(state)),
      unit: '%',
      filled: filled('TEAM_PRINCIPAL'),
    },
    {
      role: 'TECHNICAL_DIRECTOR',
      label: 'R&D return, all areas',
      effect: 'How far every pound spent on the car goes.',
      value: pct(1 + (effectiveRating(state, 'TECHNICAL_DIRECTOR') - 60) / 40 * 0.14),
      unit: '%',
      filled: filled('TECHNICAL_DIRECTOR'),
    },
    {
      role: 'AERODYNAMICIST',
      label: 'Aero & suspension R&D',
      effect: 'On top of the technical director, in those departments.',
      value: pct(staffRndEfficiency(state, 'aero') / staffRndEfficiency(state, 'reliability')),
      unit: '%',
      filled: filled('AERODYNAMICIST'),
    },
    {
      role: 'POWER_UNIT_ENGINEER',
      label: 'Power unit & energy R&D',
      effect: 'On top of the technical director, in those departments.',
      value: pct(
        staffRndEfficiency(state, 'powerUnit') / staffRndEfficiency(state, 'reliability'),
      ),
      unit: '%',
      filled: filled('POWER_UNIT_ENGINEER'),
    },
    {
      role: 'RACE_ENGINEER',
      label: 'Race pace',
      effect: 'A constant gain on both cars, every lap of every race.',
      value: Math.round(staffRacePaceEdge(state) * 10000) / 10,
      unit: '%',
      filled: filled('RACE_ENGINEER'),
    },
    {
      role: 'STRATEGIST',
      label: 'Tyre life',
      effect: 'Wear rate on every set the team runs.',
      value: -pct(staffTyreWearMultiplier(state)),
      unit: '%',
      filled: filled('STRATEGIST'),
    },
    {
      role: 'CHIEF_MECHANIC',
      label: 'Pit crew & reliability',
      effect: 'Points added to the crew rating and to the car it builds.',
      value: staffPitCrewBonus(state),
      unit: 'pts',
      filled: filled('CHIEF_MECHANIC'),
    },
    {
      role: 'DATA_ANALYST',
      label: 'Qualifying pace',
      effect: 'Single-lap performance when the grid is set.',
      value: Math.round(staffQualifyingEdge(state) * 10000) / 10,
      unit: '%',
      filled: filled('DATA_ANALYST'),
    },
  ];
}

/** Average quality of the technical group, for a headline number. */
export function departmentStrength(state: GameState): number {
  const total = ROLES.reduce((sum, role) => sum + effectiveRating(state, role.id), 0);
  return Math.round(total / ROLES.length);
}
