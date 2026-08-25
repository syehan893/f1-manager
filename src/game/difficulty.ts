import type { Difficulty } from './types';

/* =====================================================================
 * Difficulty.
 *
 * One table, read by qualifying, by the race engine, and by the between-
 * rounds development pass, so a setting means the same thing everywhere.
 *
 * The lever is deliberately not "give the AI free lap time and nothing
 * else". A harder field is quicker *and* races differently: it commits to
 * more moves, makes fewer mistakes, times its stops better, differentiates
 * its strategies from one team to the next, and develops its cars between
 * rounds instead of standing still. That is what makes the top settings
 * feel like better opponents rather than like a handicap.
 * ===================================================================== */

export interface DifficultyProfile {
  /** 0-1, handed to the race engine. 0.5 is neutral. */
  aiSkill: number;
  /**
   * Multiplier on the random spread in qualifying. Below 1 the field
   * converges on what the car and driver deserve, so a quick package can
   * no longer be beaten by a lucky lap.
   */
  qualifyingSpread: number;
  /**
   * Lap-time edge given to every car the player does not run, as a
   * fraction of a lap. Negative would be a handicap for the AI.
   */
  aiLapEdge: number;
  /**
   * 0-1. How far rival teams diverge from the nominal race plan. At zero
   * every AI car runs the same stop window; at one a slow car will gamble
   * on an undercut while the quick car covers, and the two will be on
   * different compounds doing it.
   */
  aiStrategyVariance: number;
  /**
   * Car-stat points a rival team adds per round, before its own budget
   * and prestige are taken into account. Standing still stops being a
   * viable plan once this is meaningfully above zero.
   */
  aiDevelopmentPerRound: number;
  /**
   * 0-1. How well the AI manages its own tyres, energy and attack modes
   * — the equivalent of the player answering their driver's radio well.
   */
  aiRacecraft: number;
  label: string;
  blurb: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  ROOKIE: {
    aiSkill: 0.18,
    qualifyingSpread: 1.35,
    aiLapEdge: -0.004,
    aiStrategyVariance: 0,
    aiDevelopmentPerRound: 0,
    aiRacecraft: 0.2,
    label: 'Rookie',
    blurb:
      'The field is scrappy and a little slow, runs one obvious strategy, and never develops its cars. Mistakes are cheap.',
  },
  PRO: {
    aiSkill: 0.55,
    qualifyingSpread: 1.0,
    aiLapEdge: 0.0016,
    aiStrategyVariance: 0.25,
    aiDevelopmentPerRound: 0.18,
    aiRacecraft: 0.5,
    label: 'Pro',
    blurb:
      'The grid races to its potential and improves slowly across a season. Car performance decides most weekends, driver skill the rest.',
  },
  EXPERT: {
    aiSkill: 0.8,
    qualifyingSpread: 0.84,
    aiLapEdge: 0.0038,
    aiStrategyVariance: 0.7,
    aiDevelopmentPerRound: 0.42,
    aiRacecraft: 0.82,
    label: 'Expert',
    blurb:
      'Rival teams now develop their cars hard between rounds, split onto genuinely different strategies, and use push, energy and the pit lane properly. Standing still loses ground.',
  },
  LEGEND: {
    aiSkill: 1,
    qualifyingSpread: 0.7,
    aiLapEdge: 0.0062,
    aiStrategyVariance: 1,
    aiDevelopmentPerRound: 0.62,
    aiRacecraft: 1,
    label: 'Legend',
    blurb:
      'The field extracts everything from its machinery, develops relentlessly, and every team races its own plan. You will need the car and the calls to match.',
  },
};

export function profileFor(difficulty: Difficulty): DifficultyProfile {
  return DIFFICULTY[difficulty] ?? DIFFICULTY.PRO;
}

/** Presentation order, easiest first. */
export const DIFFICULTY_ORDER: Difficulty[] = ['ROOKIE', 'PRO', 'EXPERT', 'LEGEND'];
