import { GRID_2026_TEAMS } from './grid2026.ts';
import type { Team } from '@/types';

/** Fictional grid — no real-world constructors or drivers are modelled. */
export const TEAMS: Team[] = [
  { id: 'kaizen', name: 'Kaizen Racing', shortName: 'KAI', color: '#2ee6d6', isUserTeam: true },
  { id: 'corvara', name: 'Scuderia Corvara', shortName: 'COR', color: '#ff2d46', isUserTeam: false },
  { id: 'meridian', name: 'Meridian GP', shortName: 'MER', color: '#38bdf8', isUserTeam: false },
  { id: 'apex', name: 'Apex Dynamics', shortName: 'APX', color: '#a78bfa', isUserTeam: false },
  { id: 'northwind', name: 'Northwind Motorsport', shortName: 'NWM', color: '#7ef29d', isUserTeam: false },
  { id: 'vantara', name: 'Vantara F1', shortName: 'VAN', color: '#ffc233', isUserTeam: false },
  { id: 'sable', name: 'Sable Autosport', shortName: 'SBL', color: '#f472b6', isUserTeam: false },
  { id: 'orion', name: 'Orion Grand Prix', shortName: 'ORI', color: '#fb923c', isUserTeam: false },
  { id: 'helix', name: 'Helix Racing', shortName: 'HLX', color: '#34d399', isUserTeam: false },
  { id: 'brackwell', name: 'Brackwell Motors', shortName: 'BRK', color: '#cbd5e1', isUserTeam: false },
];

/**
 * Lookup registry covering every constructor the app can render — the
 * fictional grid used by the race-weekend and career dashboards, plus the
 * 2024 grid used by career-game saves. `TEAMS` stays fictional-only so
 * those screens are unaffected.
 */
export const TEAM_BY_ID: Record<string, Team> = Object.fromEntries(
  [...TEAMS, ...GRID_2026_TEAMS].map((t) => [t.id, t]),
);

export const USER_TEAM = TEAMS.find((t) => t.isUserTeam)!;

export function teamOf(teamId: string): Team {
  return TEAM_BY_ID[teamId] ?? TEAMS[0]!;
}
