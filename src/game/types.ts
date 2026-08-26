import type { CarStats } from '@/data/grid2026';
import type { SponsorTier } from '@/data/sponsors';
import type { StaffRole } from '@/data/staff';
import type { DriverAttributes } from '@/types';
import type { TyreCompound } from '@/types';

/* =====================================================================
 * Career-game domain model.
 *
 * `GamePhase` is the single source of truth for what the player sees.
 * Every screen change is a transition in `src/game/machine.ts`, and the
 * whole `GameState` is what gets written to the single save slot.
 * ===================================================================== */

export type GamePhase =
  | 'MAIN_MENU'
  | 'SETUP_CAREER'
  | 'TEAM_SELECTION'
  | 'PRE_SEASON'
  | 'HUB'
  | 'QUALIFYING'
  /** Tyres and stints are locked in here before the grid forms. */
  | 'RACE_STRATEGY'
  | 'RACE_COUNTDOWN'
  | 'RACE_SESSION'
  | 'POST_RACE'
  /** End of the championship: settle the books and sign for next year. */
  | 'SEASON_REVIEW';

/** Phases that require an active save; the rest are pre-career screens. */
export const IN_CAREER_PHASES: GamePhase[] = [
  'PRE_SEASON',
  'HUB',
  'QUALIFYING',
  'RACE_STRATEGY',
  'RACE_COUNTDOWN',
  'RACE_SESSION',
  'POST_RACE',
  'SEASON_REVIEW',
];

export type Difficulty = 'ROOKIE' | 'PRO' | 'EXPERT' | 'LEGEND';
export type RaceLengthPct = 25 | 50 | 75 | 100;

export interface SeasonSettings {
  raceLengthPct: RaceLengthPct;
  difficulty: Difficulty;
  /** Rounds in the championship, 4-12. */
  seasonLength: number;
  /** Fixed at 5 by the qualifying format. */
  qualifyingLaps: number;
  /** Award a point for the fastest lap when finishing in the points. */
  fastestLapPoint: boolean;
}

/* ------------------------------- sessions ----------------------------- */

export interface QualifyingLap {
  lap: number;
  timeMs: number;
  /** True for the lap that ended up being the driver's best. */
  isBest: boolean;
}

export interface QualifyingEntry {
  position: number;
  driverId: string;
  teamId: string;
  /** All five laps, retained so the UI can show the run. */
  laps: QualifyingLap[];
  bestLapMs: number;
  /** Gap to pole in ms; 0 for the pole-sitter. */
  gapToPoleMs: number;
}

export interface QualifyingResult {
  season: number;
  round: number;
  trackId: string;
  /** Ordered by best lap, ascending. This becomes the starting grid. */
  entries: QualifyingEntry[];
  completedAt: string;
}

export interface RaceFinish {
  position: number;
  driverId: string;
  teamId: string;
  /** Grid slot the driver started from, straight out of qualifying. */
  gridPosition: number;
  points: number;
  /** Positions gained (positive) or lost (negative) versus the grid. */
  positionsGained: number;
  status: 'FINISHED' | 'DNF';
  fastestLap: boolean;
  bestLapMs: number | null;
  gapToWinnerMs: number;
}

export interface RaceResult {
  season: number;
  round: number;
  trackId: string;
  totalLaps: number;
  finishers: RaceFinish[];
  completedAt: string;
}

/* ----------------------------- championship ---------------------------- */

export interface DriverStanding {
  position: number;
  driverId: string;
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
}

export interface ConstructorStanding {
  position: number;
  teamId: string;
  points: number;
  wins: number;
}

export interface Standings {
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}

/* --------------------------------- R&D --------------------------------- */

export type RndArea =
  | 'aero'
  | 'powerUnit'
  | 'electrical'
  | 'reliability'
  | 'pitCrew'
  | 'brakes'
  | 'suspension'
  | 'cooling';

/** Live progress of one tech-tree variant inside a save. */
export interface RndProject {
  variantId: string;
  componentId: string;
  status: 'IN_DEVELOPMENT' | 'INSTALLED';
  weeksRemaining: number;
  startedInWeek: number;
  tokensSpent: number;
  /** Cash committed to the build, so a cancellation can refund part of it. */
  cashSpent: number;
}

/** Component development, persisted per save. */
export interface RndState {
  developmentTokens: number;
  seasonalCapTokens: number;
  seasonalTokensUsed: number;
  projects: Record<string, RndProject>;
  installedVariantIds: string[];
}

/** A facility the team can upgrade between rounds. */
export interface FacilityState {
  id: string;
  level: number;
  maxLevel: number;
}

/** Per-driver race plan, edited on the Race Strategy screen. */
export interface StintPlan {
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET';
  plannedLaps: number;
}

export interface StrategyPlan {
  driverId: string;
  stints: StintPlan[];
  /**
   * 1-5. How hard the driver is asked to race. This is the pit wall's
   * standing instruction on aggression: it moves their willingness to
   * attack, what it costs in tyres, and how much stress it builds.
   */
  pushLevel: number;
  /** The compound the car actually starts the race on. */
  startingCompound: TyreCompound;
  /**
   * The round this plan was signed off for. The race cannot start until
   * every car the player runs has a plan stamped for the current round,
   * which is what forces a tyre choice before the grid forms.
   */
  confirmedForRound: number | null;
}

/* ------------------------------- the car ------------------------------- */

export type PartCategory =
  | 'ICE'
  | 'TURBO'
  | 'MGU_K'
  | 'MGU_H'
  | 'ENERGY_STORE'
  | 'CHASSIS'
  | 'SUSPENSION'
  | 'BRAKES'
  | 'GEARBOX'
  | 'FRONT_WING'
  | 'REAR_WING'
  | 'FLOOR'
  | 'ACTIVE_AERO'
  | 'COOLING';

/** One part of the car, and how far it has been developed. */
export interface PartState {
  category: PartCategory;
  /** 0-99 on the same scale as the statistics it feeds. */
  level: number;
  /** Tech-tree variant fitted to this part, if any. */
  variantId: string | null;
}

/** A physical power unit: a spec, and mileage on it. */
export interface PowerUnitState {
  id: string;
  builtInSeason: number;
  /** Frozen at build time — later development does not improve it. */
  spec: Record<'ICE' | 'TURBO' | 'MGU_K' | 'MGU_H' | 'ENERGY_STORE', number>;
  mileageLaps: number;
  /** 100 fresh, 0 finished. */
  healthPct: number;
  status: 'FITTED' | 'POOL' | 'RETIRED';
}

/** Work in progress on one part. */
export interface DevelopmentProject {
  id: string;
  teamId: string;
  category: PartCategory;
  /** Levels this project will add when it completes. */
  gain: number;
  weeksRemaining: number;
  totalWeeks: number;
  cost: number;
  startedInWeek: number;
}

/**
 * How a team spends. The player picks theirs; every rival is assigned one
 * from its situation and the quality of its technical staff.
 */
export type DevelopmentPhilosophy =
  | 'BALANCED'
  | 'AERO_LED'
  | 'POWER_LED'
  | 'RELIABILITY_FIRST'
  | 'IN_SEASON_PUSH';

export interface TeamSeasonState {
  teamId: string;
  budget: number;
  /** Derived from `parts` and the fitted unit. Never edited directly. */
  car: CarStats;
  parts: PartState[];
  powerUnits: PowerUnitState[];
  fittedPowerUnitId: string | null;
  development: DevelopmentProject[];
  philosophy: DevelopmentPhilosophy;
}

/* --------------------------------- staff ------------------------------- */

/** Somebody the player has actually appointed. */
export interface StaffAppointment {
  /** Id of the market candidate they were hired from. */
  candidateId: string;
  role: StaffRole;
  name: string;
  /** Locked at hiring, so a later market reroll cannot change the deal. */
  rating: number;
  salary: number;
  countryCode: string;
  hiredInSeason: number;
}

/* --------------------------- driver condition -------------------------- */

/** The dominant feeling right now. Derived, never stored on its own. */
export type DriverEmotion =
  | 'CONFIDENT'
  | 'FOCUSED'
  | 'FIRED_UP'
  | 'FRUSTRATED'
  | 'RATTLED'
  | 'DEJECTED';

/**
 * The part of a driver that moves. Four numbers on different clocks:
 * morale over a season, mood over a session, stress over a stint, and
 * fitness over a weekend.
 */
export interface DriverCondition {
  driverId: string;
  /** 0-100, slow moving. Where they stand with the team. */
  morale: number;
  /** 0-100. Physical readiness; drains across a weekend. */
  fitness: number;
  /** 0-100, fast moving. Swings on a single session. */
  mood: number;
  /** 0-100. Accumulated pressure — this is what makes mistakes. */
  stress: number;
}

/* ---------------------------- driver careers --------------------------- */

/** Mutable, per-save state for one driver on the grid. */
export interface DriverRecord {
  driverId: string;
  age: number;
  /**
   * Signed drift per attribute since the career began. Each one moves on
   * its own curve, so a veteran can be down on pace and up on racecraft
   * at the same time.
   */
  deltas: Partial<Record<keyof DriverAttributes, number>>;
  seasonsRun: number;
  careerPoints: number;
  careerWins: number;
  careerPodiums: number;
}

/** A junior generated for one season's intake. */
export interface ProspectDriver {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  age: number;
  /** The ceiling they are signed on, not what they are today. */
  potential: number;
  attributes: DriverAttributes;
  salary: number;
  scoutedInSeason: number;
}

/* --------------------------- season archive ---------------------------- */

export interface ArchivedStanding {
  position: number;
  /** Driver id for the drivers' table, team id for the constructors'. */
  id: string;
  teamId: string;
  points: number;
  wins: number;
}

/** A completed championship, kept so a career has a past to read. */
export interface SeasonRecord {
  season: number;
  playerTeamId: string | null;
  /** Where the player's constructor finished. */
  playerPosition: number;
  playerPoints: number;
  championDriverId: string | null;
  championTeamId: string | null;
  drivers: ArchivedStanding[];
  constructors: ArchivedStanding[];
  /** Prize money banked for the year. */
  prizeMoney: number;
  /** Every round the player contested that year. */
  rounds: RoundRecord[];
  /** Reputation at the end of the year. */
  managerScore: number;
}

/* ------------------------------ silly season --------------------------- */

export interface TransferMove {
  season: number;
  incomingDriverId: string;
  outgoingDriverId: string;
  fromTeamId: string;
  toTeamId: string;
  reason: 'PERFORMANCE' | 'AGE' | 'AMBITION' | 'YOUTH';
  note: string;
}

/* -------------------------------- finance ------------------------------ */

export type LedgerKind =
  | 'SPONSOR'
  | 'PRIZE'
  | 'SIGNING_BONUS'
  | 'SALARY'
  | 'OPERATIONS'
  | 'RND'
  | 'UPGRADE'
  | 'FACILITY'
  | 'TRANSFER'
  | 'STAFF'
  | 'PENALTY';

export interface LedgerEntry {
  id: string;
  season: number;
  round: number;
  kind: LedgerKind;
  label: string;
  /** Positive is income, negative is expenditure. */
  amount: number;
}

/**
 * A signed deal. The commercial terms are copied out of the catalogue at
 * signing, so re-tuning a sponsor later never rewrites a contract the
 * player already agreed to.
 */
export interface SponsorContract {
  sponsorId: string;
  tier: SponsorTier;
  signedInSeason: number;
  seasonsRemaining: number;
  perRaceFee: number;
  pointsBonus: number;
  podiumBonus: number;
  winBonus: number;
  targetPosition: number;
  penalty: number;
}

export interface FinanceState {
  contracts: SponsorContract[];
  /** Newest first, capped. Every transaction in the save is here. */
  ledger: LedgerEntry[];
  seasonIncome: number;
  seasonExpenditure: number;
}

/* ------------------------------ job market ----------------------------- */

export type JobRole = 'TEAM_PRINCIPAL' | 'TECHNICAL_DIRECTOR' | 'SPORTING_DIRECTOR';

export interface JobOpening {
  teamId: string;
  role: JobRole;
  /** Manager rating the team expects before it will consider an applicant. */
  requiredScore: number;
  salary: number;
  /** Free text shown on the listing. */
  note: string;
}

export interface JobApplication {
  id: string;
  teamId: string;
  role: JobRole;
  season: number;
  round: number;
  accepted: boolean;
  /** The score the application was judged against. */
  scoreAtApplication: number;
  requiredScore: number;
  message: string;
}

/* ------------------------------ game state ----------------------------- */

export interface RoundRecord {
  season: number;
  round: number;
  trackId: string;
  /** The player's best finishing position that weekend. */
  bestFinish: number | null;
  pointsScored: number;
}

export const SAVE_VERSION = 11;

export interface GameState {
  /** Bumped when the shape changes; older saves are discarded on load. */
  version: number;
  phase: GamePhase;
  createdAt: string;
  updatedAt: string;

  managerName: string;
  /** 0-100. Drives job-market outcomes; moves with results. */
  managerPerformanceScore: number;

  settings: SeasonSettings;

  /** null until TEAM_SELECTION is confirmed. */
  playerTeamId: string | null;
  /** Highlighted-but-unconfirmed choice on the team selection screen. */
  pendingTeamId: string | null;

  season: number;
  /** 1-based index into `calendarTrackIds`. */
  round: number;
  week: number;

  calendarTrackIds: string[];
  teams: TeamSeasonState[];
  /** driverId -> teamId. Mutable, so transfers are reflected everywhere. */
  driverTeams: Record<string, string>;

  qualifying: QualifyingResult | null;
  lastRace: RaceResult | null;
  standings: Standings;
  history: RoundRecord[];

  rndSpent: Record<RndArea, number>;
  jobApplications: JobApplication[];

  /** Component tech tree progress for this save. */
  rnd: RndState;
  /** Facility levels for the player's team. */
  facilities: FacilityState[];
  /** Race plans keyed by driver id. */
  strategies: Record<string, StrategyPlan>;
  /** Sponsorship, the ledger and the season's running totals. */
  finance: FinanceState;
  /** Driver moves the rest of the grid made in the last off-season. */
  lastTransferWindow: TransferMove[];
  /** The senior people the player has appointed, one per role. */
  staff: StaffAppointment[];
  /** Age and form for every driver in the game, updated each off-season. */
  driverRecords: Record<string, DriverRecord>;
  /** Mood, stress, morale and fitness for every driver on the grid. */
  driverConditions: Record<string, DriverCondition>;
  /** This season's junior intake. Regenerated every year. */
  prospects: ProspectDriver[];
  /** Completed championships, newest last. */
  seasonArchive: SeasonRecord[];
  /**
   * Grid places the player will drop at the next race for exceeding the
   * power-unit allocation. Applied when the grid forms, then cleared.
   */
  pendingGridPenalty: number;
}

/* -------------------------------- events -------------------------------- */

export type GameEvent =
  | { type: 'NEW_GAME' }
  | { type: 'CONTINUE'; save: GameState }
  | { type: 'RESET' }
  | { type: 'RETURN_TO_MENU' }
  | { type: 'SET_SETTINGS'; settings: Partial<SeasonSettings> }
  | { type: 'SET_MANAGER_NAME'; name: string }
  | { type: 'CONFIRM_SETUP' }
  | { type: 'PREVIEW_TEAM'; teamId: string }
  | { type: 'CONFIRM_TEAM' }
  | { type: 'DEVELOP_PART'; category: PartCategory; intensity: 1 | 2 | 3 }
  | { type: 'CANCEL_PART_DEVELOPMENT'; projectId: string }
  | { type: 'BUILD_POWER_UNIT' }
  | { type: 'FIT_POWER_UNIT'; unitId: string }
  | { type: 'SET_PHILOSOPHY'; philosophy: DevelopmentPhilosophy }
  | { type: 'START_UPGRADE'; variantId: string }
  | { type: 'CANCEL_UPGRADE'; variantId: string }
  | { type: 'UPGRADE_FACILITY'; facilityId: string }
  | { type: 'SET_STRATEGY'; plan: StrategyPlan }
  | { type: 'SET_CALENDAR'; trackIds: string[] }
  | { type: 'SWAP_DRIVER'; incomingDriverId: string; outgoingDriverId: string }
  | { type: 'START_SEASON' }
  | { type: 'APPLY_FOR_JOB'; teamId: string; role: JobRole }
  | { type: 'PROCEED_TO_QUALIFYING' }
  | { type: 'QUALIFYING_COMPLETE'; result: QualifyingResult }
  | { type: 'PROCEED_TO_RACE' }
  | { type: 'SET_STARTING_TYRE'; driverId: string; compound: TyreCompound }
  | { type: 'CONDITION_EVENT'; driverId: string; event: string }
  | { type: 'CONFIRM_STRATEGY' }
  | { type: 'SIGN_SPONSOR'; sponsorId: string }
  | { type: 'HIRE_STAFF'; candidateId: string }
  | { type: 'RELEASE_STAFF'; role: StaffRole }
  | { type: 'SIGN_PROSPECT'; prospectId: string; outgoingDriverId: string }
  | { type: 'CONFIRM_SPONSORS' }
  | { type: 'COUNTDOWN_COMPLETE' }
  | { type: 'RACE_COMPLETE'; result: RaceResult }
  | { type: 'CONTINUE_TO_NEXT_WEEK' };

export type GameEventType = GameEvent['type'];

/** Result of feeding an event to the machine. */
export interface TransitionResult {
  state: GameState | null;
  ok: boolean;
  /** Why a transition was refused — surfaced in the UI, not thrown. */
  message?: string;
}
