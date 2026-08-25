import { GRID_2026_DRIVERS } from './grid2026.ts';
import { seedAttributes } from './attributeSeed';
import type { AuthoredAttributes } from './attributeSeed';
import type { Driver } from '@/types';

const CURRENT_SEASON = 2026;

type Seed = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  teamId: string;
  countryCode: string;
  country: string;
  carNumber: number;
  age: number;
  morale: number;
  fitness: number;
  salary: number;
  expires: number;
  attrs: AuthoredAttributes;
};

const a = (
  pace: number,
  cornering: number,
  braking: number,
  attack: number,
  consistency: number,
  reaction: number,
  stamina: number,
  wetWeather: number,
): AuthoredAttributes => ({
  pace,
  cornering,
  braking,
  attack,
  consistency,
  reaction,
  stamina,
  wetWeather,
});

/**
 * Grid order in this array is the starting order of the race.
 * Garcia (user team) lines up directly behind Perez so the scripted
 * opening-stint overtake has somewhere to happen.
 */
const SEEDS: Seed[] = [
  {
    id: 'rossi', code: 'ROS', firstName: 'Matteo', lastName: 'Rossi', teamId: 'corvara',
    countryCode: 'IT', country: 'Italy', carNumber: 3, age: 29, morale: 92, fitness: 95,
    salary: 24_000_000, expires: 2028, attrs: a(96, 94, 92, 90, 93, 88, 91, 89),
  },
  {
    id: 'lindqvist', code: 'LNQ', firstName: 'Elias', lastName: 'Lindqvist', teamId: 'northwind',
    countryCode: 'SE', country: 'Sweden', carNumber: 22, age: 27, morale: 88, fitness: 93,
    salary: 18_500_000, expires: 2027, attrs: a(94, 91, 90, 92, 87, 91, 89, 93),
  },
  {
    id: 'vandermeer', code: 'VDM', firstName: 'Joris', lastName: 'Vandermeer', teamId: 'apex',
    countryCode: 'NL', country: 'Netherlands', carNumber: 11, age: 31, morale: 81, fitness: 90,
    salary: 21_000_000, expires: 2026, attrs: a(93, 92, 89, 88, 91, 85, 88, 86),
  },
  {
    id: 'ricci', code: 'RIC', firstName: 'Fabio', lastName: 'Ricci', teamId: 'vantara',
    countryCode: 'IT', country: 'Italy', carNumber: 5, age: 25, morale: 86, fitness: 94,
    salary: 12_000_000, expires: 2027, attrs: a(91, 89, 91, 87, 84, 90, 92, 82),
  },
  {
    id: 'perez', code: 'PRZ', firstName: 'Lucas', lastName: 'Perez', teamId: 'meridian',
    countryCode: 'ES', country: 'Spain', carNumber: 7, age: 33, morale: 74, fitness: 87,
    salary: 16_000_000, expires: 2026, attrs: a(89, 90, 86, 83, 92, 82, 85, 88),
  },
  {
    id: 'garcia', code: 'GAR', firstName: 'Rafael', lastName: 'Garcia', teamId: 'kaizen',
    countryCode: 'US', country: 'United States', carNumber: 14, age: 26, morale: 90, fitness: 96,
    salary: 9_500_000, expires: 2028, attrs: a(92, 88, 93, 95, 85, 93, 90, 91),
  },
  {
    id: 'okonkwo', code: 'OKO', firstName: 'Tunde', lastName: 'Okonkwo', teamId: 'meridian',
    countryCode: 'NG', country: 'Nigeria', carNumber: 8, age: 24, morale: 83, fitness: 95,
    salary: 6_800_000, expires: 2028, attrs: a(88, 86, 87, 89, 80, 92, 93, 84),
  },
  {
    id: 'halvorsen', code: 'HAL', firstName: 'Sigrid', lastName: 'Halvorsen', teamId: 'apex',
    countryCode: 'NO', country: 'Norway', carNumber: 12, age: 28, morale: 79, fitness: 92,
    salary: 11_200_000, expires: 2027, attrs: a(88, 90, 84, 82, 90, 84, 87, 94),
  },
  {
    id: 'bellandi', code: 'BEL', firstName: 'Dario', lastName: 'Bellandi', teamId: 'corvara',
    countryCode: 'IT', country: 'Italy', carNumber: 4, age: 30, morale: 77, fitness: 89,
    salary: 14_000_000, expires: 2026, attrs: a(89, 88, 88, 84, 88, 83, 86, 80),
  },
  {
    id: 'moreau', code: 'MOR', firstName: 'Camille', lastName: 'Moreau', teamId: 'northwind',
    countryCode: 'FR', country: 'France', carNumber: 23, age: 26, morale: 85, fitness: 93,
    salary: 8_400_000, expires: 2027, attrs: a(87, 89, 85, 86, 86, 88, 88, 90),
  },
  {
    id: 'nakamura', code: 'NAK', firstName: 'Aiko', lastName: 'Nakamura', teamId: 'kaizen',
    countryCode: 'JP', country: 'Japan', carNumber: 15, age: 23, morale: 88, fitness: 97,
    salary: 4_200_000, expires: 2029, attrs: a(86, 87, 82, 84, 78, 94, 94, 86),
  },
  {
    id: 'haddad', code: 'HAD', firstName: 'Nadim', lastName: 'Haddad', teamId: 'vantara',
    countryCode: 'LB', country: 'Lebanon', carNumber: 6, age: 29, morale: 72, fitness: 88,
    salary: 7_600_000, expires: 2026, attrs: a(85, 84, 86, 81, 85, 82, 84, 79),
  },
  {
    id: 'brennan', code: 'BRN', firstName: 'Keira', lastName: 'Brennan', teamId: 'sable',
    countryCode: 'IE', country: 'Ireland', carNumber: 31, age: 27, morale: 80, fitness: 91,
    salary: 5_900_000, expires: 2027, attrs: a(84, 86, 83, 85, 82, 87, 86, 88),
  },
  {
    id: 'tanaka', code: 'TAN', firstName: 'Yuto', lastName: 'Tanaka', teamId: 'sable',
    countryCode: 'JP', country: 'Japan', carNumber: 32, age: 32, morale: 70, fitness: 85,
    salary: 6_400_000, expires: 2026, attrs: a(83, 85, 84, 79, 88, 80, 82, 85),
  },
  {
    id: 'volkov', code: 'VLK', firstName: 'Pavel', lastName: 'Volkov', teamId: 'orion',
    countryCode: 'CZ', country: 'Czechia', carNumber: 44, age: 25, morale: 76, fitness: 92,
    salary: 3_800_000, expires: 2028, attrs: a(82, 81, 85, 83, 76, 89, 89, 81),
  },
  {
    id: 'santos', code: 'SAN', firstName: 'Gabriel', lastName: 'Santos', teamId: 'orion',
    countryCode: 'BR', country: 'Brazil', carNumber: 45, age: 22, morale: 84, fitness: 96,
    salary: 2_400_000, expires: 2029, attrs: a(81, 80, 82, 88, 72, 91, 92, 87),
  },
  {
    id: 'adeyemi', code: 'ADE', firstName: 'Rotimi', lastName: 'Adeyemi', teamId: 'helix',
    countryCode: 'GB', country: 'United Kingdom', carNumber: 77, age: 28, morale: 74, fitness: 90,
    salary: 4_600_000, expires: 2027, attrs: a(81, 83, 80, 80, 84, 83, 85, 82),
  },
  {
    id: 'kral', code: 'KRA', firstName: 'Milan', lastName: 'Kral', teamId: 'helix',
    countryCode: 'SK', country: 'Slovakia', carNumber: 78, age: 34, morale: 66, fitness: 82,
    salary: 3_100_000, expires: 2026, attrs: a(79, 82, 81, 76, 86, 76, 79, 84),
  },
  {
    id: 'sinclair', code: 'SIN', firstName: 'Owen', lastName: 'Sinclair', teamId: 'brackwell',
    countryCode: 'AU', country: 'Australia', carNumber: 9, age: 26, morale: 71, fitness: 91,
    salary: 2_900_000, expires: 2027, attrs: a(79, 80, 79, 82, 78, 85, 87, 80),
  },
  {
    id: 'weiss', code: 'WEI', firstName: 'Bruno', lastName: 'Weiss', teamId: 'brackwell',
    countryCode: 'DE', country: 'Germany', carNumber: 10, age: 30, morale: 68, fitness: 86,
    salary: 3_400_000, expires: 2026, attrs: a(78, 79, 82, 77, 83, 79, 81, 83),
  },
];

export const DRIVERS: Driver[] = SEEDS.map((s) => ({
  id: s.id,
  code: s.code,
  firstName: s.firstName,
  lastName: s.lastName,
  teamId: s.teamId,
  countryCode: s.countryCode,
  country: s.country,
  carNumber: s.carNumber,
  age: s.age,
  attributes: seedAttributes(s.id, s.age, s.attrs),
  morale: s.morale,
  fitness: s.fitness,
  contract: {
    salaryPerSeason: s.salary,
    expiresAfterSeason: s.expires,
    buyoutClause: Math.round(s.salary * 1.75),
    bonusPerWin: Math.round(s.salary * 0.06),
  },
}));

/**
 * Lookup registry covering every driver the app can render — the fictional
 * roster used by the race-weekend and career dashboards, plus the 2024 grid
 * used by career-game races. `DRIVERS` itself stays fictional-only.
 */
export const DRIVER_BY_ID: Record<string, Driver> = Object.fromEntries(
  [...DRIVERS, ...GRID_2026_DRIVERS].map((d) => [d.id, d]),
);

export function driverOf(driverId: string): Driver {
  return DRIVER_BY_ID[driverId] ?? DRIVERS[0]!;
}

export const USER_DRIVER_IDS = DRIVERS.filter((d) => d.teamId === 'kaizen').map((d) => d.id);

/** Overall rating used across the team/driver screens. */
export function overallRating(d: Driver): number {
  const v = d.attributes;
  return Math.round(
    (v.pace * 1.5 +
      v.cornering * 1.3 +
      v.braking * 1.1 +
      v.attack * 1.1 +
      v.consistency * 1.2 +
      v.reaction * 0.8 +
      v.stamina * 0.8 +
      v.wetWeather * 0.7) /
      8.5,
  );
}

export { CURRENT_SEASON };
