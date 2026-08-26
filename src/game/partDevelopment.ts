import { rndEfficiency } from './facilities';
import { driverFeedbackBonus } from './driverDevelopment';
import { PART_BY_ID } from './carModel';
import { staffRndEfficiency } from './staffing';
import type { GameState, PartCategory, RndArea, TeamSeasonState } from './types';

/* =====================================================================
 * Part development.
 *
 * Money no longer buys statistics. It commissions work on a specific
 * part, that work takes weeks, and when it lands the part is better —
 * which is the only way the car improves.
 *
 * The consequences are the point:
 *
 *   - development has lead time, so what you commission in round three
 *     arrives in round six and a season has to be planned, not steered
 *   - the same money goes further in the departments your buildings and
 *     your people are strong in, so hiring and facilities compound into
 *     the car rather than sitting beside it
 *   - a part already at a high level costs progressively more to move,
 *     so nobody develops one number to ninety-nine and ignores the rest
 * ===================================================================== */

/** How hard a programme is pushed, and what that trades. */
export const DEVELOPMENT_INTENSITY = {
  1: { label: 'Steady', costFactor: 1, weekFactor: 1.35, gainFactor: 1 },
  2: { label: 'Normal', costFactor: 1.45, weekFactor: 1, gainFactor: 1.25 },
  3: { label: 'Maximum', costFactor: 2.3, weekFactor: 0.75, gainFactor: 1.45 },
} as const;

export type DevelopmentIntensity = keyof typeof DEVELOPMENT_INTENSITY;

/**
 * Intensity comes off an event, so it can arrive as anything. Falling
 * back to the standard programme keeps a malformed payload a refusal
 * rather than a crash inside the reducer.
 */
function settingsFor(intensity: DevelopmentIntensity) {
  return DEVELOPMENT_INTENSITY[intensity] ?? DEVELOPMENT_INTENSITY[2];
}

/** Base spend for one development step on an average part. */
const BASE_STEP_COST = 3_400_000;
/** Levels an average programme adds before efficiency is applied. */
const BASE_STEP_GAIN = 2.6;

/** Which R&D department a part belongs to, for efficiency lookups. */
export const PART_AREA: Record<PartCategory, RndArea> = {
  ICE: 'powerUnit',
  TURBO: 'powerUnit',
  MGU_K: 'electrical',
  MGU_H: 'electrical',
  ENERGY_STORE: 'electrical',
  CHASSIS: 'suspension',
  SUSPENSION: 'suspension',
  BRAKES: 'brakes',
  GEARBOX: 'reliability',
  FRONT_WING: 'aero',
  REAR_WING: 'aero',
  FLOOR: 'aero',
  ACTIVE_AERO: 'aero',
  COOLING: 'cooling',
};

/**
 * Diminishing returns. Moving a part from 60 to 62 is ordinary work;
 * moving it from 92 to 94 is a season's programme, and the cost curve
 * has to say so or every team converges on a maximum car.
 */
function difficultyAt(level: number): number {
  return 1 + Math.pow(Math.max(0, level - 55) / 45, 2.1) * 4.5;
}

export function developmentCost(
  category: PartCategory,
  level: number,
  intensity: DevelopmentIntensity,
): number {
  const part = PART_BY_ID.get(category);
  const cost =
    BASE_STEP_COST *
    (part?.costFactor ?? 1) *
    difficultyAt(level) *
    settingsFor(intensity).costFactor;
  return Math.round(cost / 100_000) * 100_000;
}

export function developmentWeeks(
  category: PartCategory,
  intensity: DevelopmentIntensity,
  weekReduction = 0,
): number {
  const part = PART_BY_ID.get(category);
  const weeks = (part?.baseWeeks ?? 5) * settingsFor(intensity).weekFactor;
  return Math.max(1, Math.round(weeks) - weekReduction);
}

/**
 * Levels a programme will add. This is where the facilities and the
 * people show up: the same cheque buys more in a department that is
 * properly equipped and properly run.
 */
export function developmentGain(
  state: GameState,
  category: PartCategory,
  level: number,
  intensity: DevelopmentIntensity,
): number {
  const area = PART_AREA[category];
  /* The drivers are part of the development programme too: what they can
   * tell the engineers is the difference between a cheque that lands and
   * one that is spent guessing. */
  const efficiency =
    rndEfficiency(state, area) * staffRndEfficiency(state, area) * driverFeedbackBonus(state);
  const raw =
    (BASE_STEP_GAIN * settingsFor(intensity).gainFactor * efficiency) /
    difficultyAt(level);
  return Math.round(raw * 10) / 10;
}

/** Level of one part on a team's car. */
export function partLevel(team: TeamSeasonState, category: PartCategory): number {
  return team.parts.find((part) => part.category === category)?.level ?? 60;
}

export interface DevelopmentCheck {
  ok: boolean;
  reason?: string;
}

/** Shared gate, so the button and the reducer never disagree. */
export function canDevelop(
  team: TeamSeasonState,
  category: PartCategory,
  intensity: DevelopmentIntensity,
): DevelopmentCheck {
  if (!PART_BY_ID.has(category)) {
    return { ok: false, reason: 'No such part.' };
  }
  if (team.development.some((project) => project.category === category)) {
    return { ok: false, reason: 'Already in development. Cancel it first.' };
  }
  const level = partLevel(team, category);
  if (level >= 99) {
    return { ok: false, reason: 'At the regulatory ceiling.' };
  }
  const cost = developmentCost(category, level, intensity);
  if (team.budget < cost) {
    return {
      ok: false,
      reason: `Costs $${(cost / 1_000_000).toFixed(1)}M; you have $${(team.budget / 1_000_000).toFixed(1)}M.`,
    };
  }
  return { ok: true };
}

/**
 * Tick every in-progress programme forward and fit whatever finishes.
 * Returns the parts that landed, so the week summary can report them.
 */
export function advanceDevelopment(
  team: TeamSeasonState,
  weeks: number,
): Array<{ category: PartCategory; gain: number }> {
  const landed: Array<{ category: PartCategory; gain: number }> = [];

  for (const project of [...team.development]) {
    project.weeksRemaining -= weeks;
    if (project.weeksRemaining > 0) continue;

    const part = team.parts.find((entry) => entry.category === project.category);
    if (part) {
      part.level = Math.min(99, Math.round((part.level + project.gain) * 10) / 10);
      landed.push({ category: project.category, gain: project.gain });
    }
    team.development = team.development.filter((entry) => entry.id !== project.id);
  }

  return landed;
}
