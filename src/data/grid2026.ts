import type { Driver, DriverAttributes, Team } from '@/types';

/* =====================================================================
 * 2026 grid composition — eleven teams, twenty-two cars.
 *
 * Team and driver names reflect the announced 2026 entries. This is an
 * unofficial fan project, unaffiliated with Formula 1, the FIA or any
 * competitor. Nationalities and most car numbers are factual; numbers
 * for new entrants are provisional, and EVERY rating, budget and car
 * statistic below is INVENTED for gameplay balance.
 *
 * 2026 regulations modelled loosely: a ~50/50 split between combustion
 * and electrical power, no MGU-H, active aero, and a manual "override"
 * boost in place of DRS.
 * ===================================================================== */

export interface CarStats {
  /** 0-100 single-lap performance of the whole package. */
  pace: number;
  aero: number;
  /** Combustion side of the 2026 power unit. */
  powerUnit: number;
  /** Deployment, harvesting and battery — half the lap under 2026 rules. */
  electrical: number;
  reliability: number;
  pitCrew: number;
  /** Stopping power and stability under braking. */
  brakes: number;
  /** Mechanical grip and kerb behaviour. */
  suspension: number;
  /** Thermal headroom — how hard the package can be run before it hurts. */
  cooling: number;
}

export interface GridTeam extends Team {
  fullName: string;
  base: string;
  countryCode: string;
  principal: string;
  /** Power-unit supplier, which matters far more under the 2026 rules. */
  engineSupplier: string;
  /** Operating budget in USD for the season. */
  budget: number;
  car: CarStats;
  /** Championship pedigree; drives the job market. */
  prestige: number;
  /** Manager rating a team expects before considering an applicant. */
  hiringBar: number;
}

const a = (
  pace: number,
  cornering: number,
  braking: number,
  overtaking: number,
  consistency: number,
  reaction: number,
  stamina: number,
  wetWeather: number,
): DriverAttributes => ({
  pace,
  cornering,
  braking,
  overtaking,
  consistency,
  reaction,
  stamina,
  wetWeather,
});

export const GRID_2026_TEAMS: GridTeam[] = [
  {
    id: 'redbull',
    name: 'Red Bull Racing',
    fullName: 'Oracle Red Bull Racing',
    shortName: 'RBR',
    color: '#3671C6',
    isUserTeam: false,
    base: 'Milton Keynes',
    countryCode: 'GB',
    principal: 'Laurent Mekies',
    engineSupplier: 'Red Bull Ford Powertrains',
    budget: 142_000_000,
    car: { pace: 92, aero: 93, powerUnit: 87, electrical: 86, reliability: 84, pitCrew: 95, brakes: 92, suspension: 92, cooling: 85 },
    prestige: 95,
    hiringBar: 87,
  },
  {
    id: 'ferrari',
    name: 'Ferrari',
    fullName: 'Scuderia Ferrari',
    shortName: 'FER',
    color: '#E8002D',
    isUserTeam: false,
    base: 'Maranello',
    countryCode: 'IT',
    principal: 'Frédéric Vasseur',
    engineSupplier: 'Ferrari',
    budget: 140_000_000,
    car: { pace: 93, aero: 91, powerUnit: 92, electrical: 90, reliability: 88, pitCrew: 89, brakes: 92, suspension: 91, cooling: 89 },
    prestige: 97,
    hiringBar: 86,
  },
  {
    id: 'mercedes',
    name: 'Mercedes',
    fullName: 'Mercedes-AMG PETRONAS F1 Team',
    shortName: 'MER',
    color: '#27F4D2',
    isUserTeam: false,
    base: 'Brackley',
    countryCode: 'GB',
    principal: 'Toto Wolff',
    engineSupplier: 'Mercedes',
    budget: 139_000_000,
    car: { pace: 94, aero: 90, powerUnit: 95, electrical: 94, reliability: 90, pitCrew: 91, brakes: 92, suspension: 91, cooling: 92 },
    prestige: 94,
    hiringBar: 85,
  },
  {
    id: 'mclaren',
    name: 'McLaren',
    fullName: 'McLaren Formula 1 Team',
    shortName: 'MCL',
    color: '#FF8000',
    isUserTeam: false,
    base: 'Woking',
    countryCode: 'GB',
    principal: 'Andrea Stella',
    engineSupplier: 'Mercedes',
    budget: 138_000_000,
    car: { pace: 95, aero: 95, powerUnit: 93, electrical: 92, reliability: 91, pitCrew: 93, brakes: 95, suspension: 94, cooling: 92 },
    prestige: 93,
    hiringBar: 84,
  },
  {
    id: 'astonmartin',
    name: 'Aston Martin',
    fullName: 'Aston Martin Aramco F1 Team',
    shortName: 'AMR',
    color: '#229971',
    isUserTeam: false,
    base: 'Silverstone',
    countryCode: 'GB',
    principal: 'Andy Cowell',
    engineSupplier: 'Honda',
    budget: 128_000_000,
    car: { pace: 87, aero: 89, powerUnit: 86, electrical: 85, reliability: 83, pitCrew: 85, brakes: 88, suspension: 87, cooling: 84 },
    prestige: 76,
    hiringBar: 72,
  },
  {
    id: 'williams',
    name: 'Williams',
    fullName: 'Atlassian Williams Racing',
    shortName: 'WIL',
    color: '#64C4FF',
    isUserTeam: false,
    base: 'Grove',
    countryCode: 'GB',
    principal: 'James Vowles',
    engineSupplier: 'Mercedes',
    budget: 110_000_000,
    car: { pace: 86, aero: 84, powerUnit: 94, electrical: 92, reliability: 82, pitCrew: 82, brakes: 85, suspension: 84, cooling: 86 },
    prestige: 74,
    hiringBar: 64,
  },
  {
    id: 'audi',
    name: 'Audi',
    fullName: 'Audi F1 Team',
    shortName: 'AUD',
    color: '#00505C',
    isUserTeam: false,
    base: 'Hinwil',
    countryCode: 'CH',
    principal: 'Jonathan Wheatley',
    engineSupplier: 'Audi',
    budget: 125_000_000,
    car: { pace: 84, aero: 83, powerUnit: 82, electrical: 84, reliability: 79, pitCrew: 80, brakes: 84, suspension: 82, cooling: 80 },
    prestige: 66,
    hiringBar: 60,
  },
  {
    id: 'racingbulls',
    name: 'Racing Bulls',
    fullName: 'Visa Cash App Racing Bulls',
    shortName: 'RB',
    color: '#6692FF',
    isUserTeam: false,
    base: 'Faenza',
    countryCode: 'IT',
    principal: 'Alan Permane',
    engineSupplier: 'Red Bull Ford Powertrains',
    budget: 98_000_000,
    car: { pace: 84, aero: 83, powerUnit: 87, electrical: 85, reliability: 84, pitCrew: 84, brakes: 84, suspension: 82, cooling: 85 },
    prestige: 62,
    hiringBar: 56,
  },
  {
    id: 'haas',
    name: 'Haas',
    fullName: 'MoneyGram Haas F1 Team',
    shortName: 'HAA',
    color: '#B6BABD',
    isUserTeam: false,
    base: 'Kannapolis',
    countryCode: 'US',
    principal: 'Ayao Komatsu',
    engineSupplier: 'Ferrari',
    budget: 92_000_000,
    car: { pace: 81, aero: 79, powerUnit: 92, electrical: 89, reliability: 81, pitCrew: 79, brakes: 80, suspension: 79, cooling: 84 },
    prestige: 56,
    hiringBar: 50,
  },
  {
    id: 'alpine',
    name: 'Alpine',
    fullName: 'BWT Alpine F1 Team',
    shortName: 'ALP',
    color: '#FF87BC',
    isUserTeam: false,
    base: 'Enstone',
    countryCode: 'FR',
    principal: 'Steve Nielsen',
    engineSupplier: 'Mercedes',
    budget: 106_000_000,
    car: { pace: 80, aero: 80, powerUnit: 93, electrical: 91, reliability: 78, pitCrew: 81, brakes: 80, suspension: 79, cooling: 82 },
    prestige: 64,
    hiringBar: 54,
  },
  {
    id: 'cadillac',
    name: 'Cadillac',
    fullName: 'Cadillac Formula 1 Team',
    shortName: 'CAD',
    color: '#C8102E',
    isUserTeam: false,
    base: 'Silverstone / Indianapolis',
    countryCode: 'US',
    principal: 'Graeme Lowdon',
    engineSupplier: 'Ferrari',
    budget: 118_000_000,
    car: { pace: 74, aero: 72, powerUnit: 92, electrical: 88, reliability: 71, pitCrew: 70, brakes: 73, suspension: 72, cooling: 77 },
    prestige: 44,
    hiringBar: 38,
  },
];

interface DriverSeed {
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
  salary: number;
  expires: number;
  attrs: DriverAttributes;
}

const DRIVER_SEEDS: DriverSeed[] = [
  { id: 'verstappen', code: 'VER', firstName: 'Max', lastName: 'Verstappen', teamId: 'redbull', countryCode: 'NL', country: 'Netherlands', carNumber: 1, age: 28, morale: 90, salary: 60_000_000, expires: 2028, attrs: a(98, 97, 95, 96, 96, 93, 94, 98) },
  { id: 'hadjar', code: 'HAD', firstName: 'Isack', lastName: 'Hadjar', teamId: 'redbull', countryCode: 'FR', country: 'France', carNumber: 6, age: 21, morale: 88, salary: 4_000_000, expires: 2028, attrs: a(87, 87, 85, 84, 80, 90, 92, 84) },

  { id: 'leclerc', code: 'LEC', firstName: 'Charles', lastName: 'Leclerc', teamId: 'ferrari', countryCode: 'MC', country: 'Monaco', carNumber: 16, age: 28, morale: 84, salary: 34_000_000, expires: 2029, attrs: a(95, 96, 91, 89, 88, 92, 90, 91) },
  { id: 'hamilton', code: 'HAM', firstName: 'Lewis', lastName: 'Hamilton', teamId: 'ferrari', countryCode: 'GB', country: 'United Kingdom', carNumber: 44, age: 41, morale: 76, salary: 55_000_000, expires: 2026, attrs: a(90, 92, 94, 95, 93, 86, 83, 97) },

  { id: 'russell', code: 'RUS', firstName: 'George', lastName: 'Russell', teamId: 'mercedes', countryCode: 'GB', country: 'United Kingdom', carNumber: 63, age: 28, morale: 89, salary: 30_000_000, expires: 2028, attrs: a(93, 92, 90, 87, 91, 90, 90, 89) },
  { id: 'antonelli', code: 'ANT', firstName: 'Kimi', lastName: 'Antonelli', teamId: 'mercedes', countryCode: 'IT', country: 'Italy', carNumber: 12, age: 19, morale: 87, salary: 5_000_000, expires: 2029, attrs: a(89, 89, 86, 85, 78, 93, 94, 87) },

  { id: 'norris', code: 'NOR', firstName: 'Lando', lastName: 'Norris', teamId: 'mclaren', countryCode: 'GB', country: 'United Kingdom', carNumber: 4, age: 26, morale: 93, salary: 32_000_000, expires: 2028, attrs: a(95, 95, 91, 89, 91, 91, 92, 90) },
  { id: 'piastri', code: 'PIA', firstName: 'Oscar', lastName: 'Piastri', teamId: 'mclaren', countryCode: 'AU', country: 'Australia', carNumber: 81, age: 25, morale: 90, salary: 20_000_000, expires: 2028, attrs: a(94, 93, 91, 88, 92, 89, 92, 88) },

  { id: 'alonso', code: 'ALO', firstName: 'Fernando', lastName: 'Alonso', teamId: 'astonmartin', countryCode: 'ES', country: 'Spain', carNumber: 14, age: 44, morale: 79, salary: 22_000_000, expires: 2026, attrs: a(88, 92, 95, 96, 94, 83, 79, 95) },
  { id: 'stroll', code: 'STR', firstName: 'Lance', lastName: 'Stroll', teamId: 'astonmartin', countryCode: 'CA', country: 'Canada', carNumber: 18, age: 27, morale: 68, salary: 12_000_000, expires: 2027, attrs: a(78, 79, 78, 76, 78, 80, 82, 79) },

  { id: 'albon', code: 'ALB', firstName: 'Alexander', lastName: 'Albon', teamId: 'williams', countryCode: 'TH', country: 'Thailand', carNumber: 23, age: 30, morale: 84, salary: 9_000_000, expires: 2027, attrs: a(87, 88, 84, 83, 87, 85, 86, 86) },
  { id: 'sainz', code: 'SAI', firstName: 'Carlos', lastName: 'Sainz', teamId: 'williams', countryCode: 'ES', country: 'Spain', carNumber: 55, age: 31, morale: 81, salary: 14_000_000, expires: 2027, attrs: a(90, 90, 92, 88, 92, 87, 88, 88) },

  { id: 'hulkenberg', code: 'HUL', firstName: 'Nico', lastName: 'Hülkenberg', teamId: 'audi', countryCode: 'DE', country: 'Germany', carNumber: 27, age: 38, morale: 78, salary: 8_000_000, expires: 2027, attrs: a(85, 84, 84, 81, 88, 82, 80, 87) },
  { id: 'bortoleto', code: 'BOR', firstName: 'Gabriel', lastName: 'Bortoleto', teamId: 'audi', countryCode: 'BR', country: 'Brazil', carNumber: 5, age: 21, morale: 83, salary: 3_000_000, expires: 2029, attrs: a(84, 85, 82, 82, 77, 89, 92, 83) },

  { id: 'lawson', code: 'LAW', firstName: 'Liam', lastName: 'Lawson', teamId: 'racingbulls', countryCode: 'NZ', country: 'New Zealand', carNumber: 30, age: 24, morale: 76, salary: 3_500_000, expires: 2027, attrs: a(84, 83, 85, 84, 79, 87, 88, 82) },
  { id: 'lindblad', code: 'LIN', firstName: 'Arvid', lastName: 'Lindblad', teamId: 'racingbulls', countryCode: 'GB', country: 'United Kingdom', carNumber: 38, age: 18, morale: 85, salary: 1_500_000, expires: 2029, attrs: a(82, 82, 80, 80, 73, 91, 93, 79) },

  { id: 'ocon', code: 'OCO', firstName: 'Esteban', lastName: 'Ocon', teamId: 'haas', countryCode: 'FR', country: 'France', carNumber: 31, age: 29, morale: 73, salary: 7_000_000, expires: 2027, attrs: a(84, 85, 83, 80, 85, 83, 85, 84) },
  { id: 'bearman', code: 'BEA', firstName: 'Oliver', lastName: 'Bearman', teamId: 'haas', countryCode: 'GB', country: 'United Kingdom', carNumber: 87, age: 20, morale: 82, salary: 2_500_000, expires: 2028, attrs: a(84, 84, 83, 83, 76, 89, 91, 83) },

  { id: 'gasly', code: 'GAS', firstName: 'Pierre', lastName: 'Gasly', teamId: 'alpine', countryCode: 'FR', country: 'France', carNumber: 10, age: 30, morale: 72, salary: 9_000_000, expires: 2027, attrs: a(86, 86, 85, 83, 84, 85, 86, 87) },
  { id: 'colapinto', code: 'COL', firstName: 'Franco', lastName: 'Colapinto', teamId: 'alpine', countryCode: 'AR', country: 'Argentina', carNumber: 43, age: 22, morale: 74, salary: 2_000_000, expires: 2027, attrs: a(81, 81, 80, 82, 73, 87, 90, 80) },

  { id: 'perez', code: 'PER', firstName: 'Sergio', lastName: 'Pérez', teamId: 'cadillac', countryCode: 'MX', country: 'Mexico', carNumber: 11, age: 36, morale: 75, salary: 15_000_000, expires: 2028, attrs: a(84, 86, 84, 83, 82, 82, 82, 83) },
  { id: 'bottas', code: 'BOT', firstName: 'Valtteri', lastName: 'Bottas', teamId: 'cadillac', countryCode: 'FI', country: 'Finland', carNumber: 77, age: 36, morale: 74, salary: 12_000_000, expires: 2028, attrs: a(83, 84, 82, 78, 88, 82, 81, 84) },
];

export const GRID_2026_DRIVERS: Driver[] = DRIVER_SEEDS.map((seed) => ({
  id: seed.id,
  code: seed.code,
  firstName: seed.firstName,
  lastName: seed.lastName,
  teamId: seed.teamId,
  countryCode: seed.countryCode,
  country: seed.country,
  carNumber: seed.carNumber,
  age: seed.age,
  attributes: seed.attrs,
  morale: seed.morale,
  fitness: Math.max(70, 100 - Math.max(0, seed.age - 30) * 2),
  contract: {
    salaryPerSeason: seed.salary,
    expiresAfterSeason: seed.expires,
    buyoutClause: Math.round(seed.salary * 1.8),
    bonusPerWin: Math.round(seed.salary * 0.05),
  },
}));

export const GRID_2026_TEAM_BY_ID: Record<string, GridTeam> = Object.fromEntries(
  GRID_2026_TEAMS.map((team) => [team.id, team]),
);

export function gridTeamOf(teamId: string): GridTeam {
  return GRID_2026_TEAM_BY_ID[teamId] ?? GRID_2026_TEAMS[0]!;
}

export function driversOfTeam(teamId: string): Driver[] {
  return GRID_2026_DRIVERS.filter((driver) => driver.teamId === teamId);
}

/** Blended 0-100 rating of a driver, used for qualifying and race pace. */
export function driverRating(driver: Driver): number {
  const v = driver.attributes;
  return Math.round(
    v.pace * 0.34 +
      v.cornering * 0.22 +
      v.braking * 0.12 +
      v.consistency * 0.16 +
      v.overtaking * 0.1 +
      v.reaction * 0.06,
  );
}

/** Blended 0-100 rating of a car package under the 2026 rules. */
export function carRating(car: CarStats): number {
  return Math.round(
    car.pace * 0.28 +
      car.aero * 0.19 +
      car.powerUnit * 0.16 +
      car.electrical * 0.15 +
      car.reliability * 0.08 +
      car.brakes * 0.05 +
      car.suspension * 0.05 +
      car.cooling * 0.04,
  );
}
