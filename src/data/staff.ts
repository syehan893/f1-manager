/* =====================================================================
 * Staff.
 *
 * A Formula 1 team is a few hundred people, and the handful at the top of
 * it decide what the rest are capable of. This is that handful: the roles
 * a manager actually hires for, each one attached to a number somewhere
 * else in the game.
 *
 * The design rule is the same as for facilities — no role exists purely
 * to be filled. Every appointment moves something the player can watch
 * change: how far R&D money goes, how long a build takes, how quick the
 * stop is, what the sponsors pay.
 *
 * All names and figures are invented for this project.
 * ===================================================================== */

export type StaffRole =
  | 'TEAM_PRINCIPAL'
  | 'TECHNICAL_DIRECTOR'
  | 'AERODYNAMICIST'
  | 'POWER_UNIT_ENGINEER'
  | 'RACE_ENGINEER'
  | 'STRATEGIST'
  | 'CHIEF_MECHANIC'
  | 'DATA_ANALYST';

export interface RoleDefinition {
  id: StaffRole;
  label: string;
  /** What the job is. */
  description: string;
  /** What holding it well actually does, in one line. */
  effect: string;
  /** Typical salary for a 70-rated candidate. Scales with rating. */
  baseSalary: number;
  /** Seniority, which drives how expensive the very best get. */
  seniority: number;
}

export const ROLES: RoleDefinition[] = [
  {
    id: 'TEAM_PRINCIPAL',
    label: 'Team Principal',
    description: 'Runs the operation and fronts it to the paddock and the partners.',
    effect: 'Lifts every sponsor payment and grows your reputation faster.',
    baseSalary: 9_000_000,
    seniority: 1.6,
  },
  {
    id: 'TECHNICAL_DIRECTOR',
    label: 'Technical Director',
    description: 'Owns the concept of the car and the direction of the whole programme.',
    effect: 'Improves R&D return across every department and shortens builds.',
    baseSalary: 8_000_000,
    seniority: 1.5,
  },
  {
    id: 'AERODYNAMICIST',
    label: 'Chief Aerodynamicist',
    description: 'Runs the tunnel and CFD programmes and owns the aero map.',
    effect: 'Sharpens aerodynamic and suspension development.',
    baseSalary: 4_200_000,
    seniority: 1.15,
  },
  {
    id: 'POWER_UNIT_ENGINEER',
    label: 'Power Unit Engineer',
    description: 'Combustion, deployment and the thermal envelope around them.',
    effect: 'Sharpens power unit, energy and cooling development.',
    baseSalary: 3_900_000,
    seniority: 1.12,
  },
  {
    id: 'RACE_ENGINEER',
    label: 'Head of Race Engineering',
    description: 'The voice on the radio and the setup the driver races with.',
    effect: 'Small but constant gain to race pace on both cars.',
    baseSalary: 2_600_000,
    seniority: 1,
  },
  {
    id: 'STRATEGIST',
    label: 'Chief Strategist',
    description: 'Models the race before it happens and again every lap of it.',
    effect: 'Gets more life out of every set of tyres.',
    baseSalary: 2_400_000,
    seniority: 1,
  },
  {
    id: 'CHIEF_MECHANIC',
    label: 'Chief Mechanic',
    description: 'The garage, the build quality, and the crew over the wall.',
    effect: 'Faster pit stops and a more reliable car.',
    baseSalary: 2_100_000,
    seniority: 0.95,
  },
  {
    id: 'DATA_ANALYST',
    label: 'Head of Performance Analysis',
    description: 'Turns the telemetry into the answer before Saturday.',
    effect: 'Improves single-lap performance in qualifying.',
    baseSalary: 1_800_000,
    seniority: 0.9,
  },
];

export const ROLE_BY_ID = new Map(ROLES.map((role) => [role.id, role]));

export const ROLE_LABEL: Record<StaffRole, string> = Object.fromEntries(
  ROLES.map((role) => [role.id, role.label]),
) as Record<StaffRole, string>;

/* ---------------------------- the candidates --------------------------- */

export interface StaffCandidate {
  id: string;
  name: string;
  role: StaffRole;
  /** 0-100 overall. */
  rating: number;
  age: number;
  countryCode: string;
  /** Asking salary per season. */
  salary: number;
  /** One-off fee to bring them in. Higher when poaching. */
  signingFee: number;
  /**
   * Team they currently work for, or null for a free agent. Poaching
   * someone under contract costs considerably more.
   */
  currentTeamId: string | null;
  /** Flavour, generated from the rating and role. */
  note: string;
}

const FIRST_NAMES = [
  'Marco', 'Elena', 'Tobias', 'Priya', 'Anders', 'Ines', 'Rafael', 'Yuki',
  'Clara', 'Bastien', 'Nadia', 'Owen', 'Sofia', 'Dieter', 'Amara', 'Lucas',
  'Hana', 'Gustav', 'Camille', 'Idris', 'Marta', 'Fabien', 'Leena', 'Otto',
];

const LAST_NAMES = [
  'Brandt', 'Okafor', 'Ferreira', 'Lindqvist', 'Marchetti', 'Duval', 'Nakamura',
  'Weiss', 'Castellan', 'Halvorsen', 'Rahman', 'Petrov', 'Moreau', 'Sandoval',
  'Kowalski', 'Ashworth', 'Bergmann', 'Novak', 'Delacroix', 'Ibarra', 'Vance',
  'Strand', 'Okonjo', 'Rossi',
];

const COUNTRIES = [
  'GB', 'IT', 'DE', 'FR', 'ES', 'NL', 'AT', 'CH', 'BE', 'SE', 'JP', 'BR',
  'US', 'AU', 'PL', 'PT',
];

const NOTES_HIGH = [
  'A genuine title-winning appointment. Everybody wants them.',
  'Widely regarded as the best available in this discipline.',
  'Has done it before, at the front, and can do it again.',
];

const NOTES_MID = [
  'Solid, experienced, and will not embarrass you.',
  'Coming into their prime and looking for the right project.',
  'A dependable pair of hands with a good reputation.',
];

const NOTES_LOW = [
  'Cheap, keen, and learning on the job.',
  'Untested at this level, but the potential is there.',
  'Available immediately, and it shows in the price.',
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * What a candidate of this quality is worth per season. Talent is priced
 * steeply, which is what forces the player to choose which departments
 * they can afford to be excellent in.
 */
export function salaryFor(role: RoleDefinition, rating: number): number {
  const excess = Math.max(0, rating - 55) / 45;
  return Math.round(
    (role.baseSalary * (0.45 + Math.pow(excess, 1.9) * 2.4) * role.seniority) / 100_000,
  ) * 100_000;
}

/**
 * The market for one season. Deterministic on the season, so reloading a
 * save cannot reroll a better shortlist — the same discipline the driver
 * market and the silly season follow.
 */
export function buildStaffMarket(season: number, teamIds: string[]): StaffCandidate[] {
  const candidates: StaffCandidate[] = [];
  /* Two candidates drawing the same first and last name is a coin flip
   * away across a shortlist this size, and reads as a bug on screen even
   * though it is only chance. Names are nudged along until unique. */
  const usedNames = new Set<string>();

  for (const role of ROLES) {
    // Four names per role: enough to be a choice, not so many it is a list.
    for (let index = 0; index < 4; index++) {
      const key = `${season}:${role.id}:${index}`;
      const r1 = hash(key + 'a');
      const r2 = hash(key + 'b');
      const r3 = hash(key + 'c');
      const r4 = hash(key + 'd');

      /* One standout, one poor, two in between — a real shortlist shape.
       * The standout band still varies, so the best candidate for every
       * role is not the same number eight times over. */
      const band =
        index === 0 ? 0.78 + r4 * 0.16 : index === 3 ? 0.26 + r4 * 0.12 : 0.5 + r1 * 0.26;
      const rating = Math.round(38 + band * 58 + (r2 - 0.5) * 6);

      const first = FIRST_NAMES[Math.floor(r1 * FIRST_NAMES.length)]!;
      let lastIndex = Math.floor(r2 * LAST_NAMES.length);
      let last = LAST_NAMES[lastIndex]!;
      for (let attempt = 0; usedNames.has(`${first} ${last}`) && attempt < LAST_NAMES.length; attempt++) {
        lastIndex = (lastIndex + 1) % LAST_NAMES.length;
        last = LAST_NAMES[lastIndex]!;
      }
      usedNames.add(`${first} ${last}`);

      // The better they are, the more likely somebody already has them.
      const contracted = r3 < (rating - 45) / 70;
      const currentTeamId = contracted
        ? (teamIds[Math.floor(r4 * teamIds.length)] ?? null)
        : null;

      const salary = salaryFor(role, rating);
      const notes = rating >= 82 ? NOTES_HIGH : rating >= 62 ? NOTES_MID : NOTES_LOW;

      candidates.push({
        id: `staff-${season}-${role.id}-${index}`,
        name: `${first} ${last}`,
        role: role.id,
        rating,
        age: Math.round(31 + r3 * 26),
        countryCode: COUNTRIES[Math.floor(r4 * COUNTRIES.length)]!,
        salary,
        // Poaching someone mid-contract means buying them out of it.
        signingFee: Math.round(salary * (contracted ? 0.85 : 0.25)),
        currentTeamId,
        note: notes[Math.floor(r1 * notes.length)]!,
      });
    }
  }

  return candidates;
}
