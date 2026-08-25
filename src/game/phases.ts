import type { GamePhase } from './types';

/**
 * Phases that take over the whole display. Only the pre-career screens
 * qualify: once a career exists the player stays in the dashboard shell,
 * and the race itself is run from Pitwall Live.
 */
export const FULLSCREEN_PHASES: GamePhase[] = [
  'MAIN_MENU',
  'SETUP_CAREER',
  'TEAM_SELECTION',
];

/** Phases where a race session is live and Pitwall Live is the cockpit. */
export const RACE_PHASES: GamePhase[] = ['RACE_COUNTDOWN', 'RACE_SESSION'];

export function isRacePhase(phase: GamePhase): boolean {
  return RACE_PHASES.includes(phase);
}

export function isFullscreenPhase(phase: GamePhase): boolean {
  return FULLSCREEN_PHASES.includes(phase);
}

/** Human-readable phase label for headers and the save slot. */
export const PHASE_LABEL: Record<GamePhase, string> = {
  MAIN_MENU: 'Main Menu',
  SETUP_CAREER: 'Career Setup',
  TEAM_SELECTION: 'Team Selection',
  PRE_SEASON: 'Pre-Season',
  HUB: 'Manager Hub',
  QUALIFYING: 'Qualifying',
  RACE_COUNTDOWN: 'Race Countdown',
  RACE_SESSION: 'Race',
  RACE_STRATEGY: 'Strategy',
  SEASON_REVIEW: 'Season Review',
  POST_RACE: 'Post-Race',
};
