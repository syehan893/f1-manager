import type { Point, WeatherKind } from './index';

/* =====================================================================
 * Career mode domain model.
 *
 * This is the wire contract between the dashboard and the career
 * backend (`server/`). Every REST payload is one of these shapes, so a
 * simulation engine can replace the seeded MongoDB documents without
 * the UI changing.
 * ===================================================================== */

/* ------------------------------- Tracks ------------------------------ */

export type TrackProfile = 'HIGH_DOWNFORCE' | 'POWER' | 'BALANCED' | 'STREET';

/** Every axis is 0-100 and drives both setup advice and race simulation. */
export interface TrackCharacteristics {
  downforce: number;
  power: number;
  tyreStress: number;
  braking: number;
  overtaking: number;
}

export interface WeatherForecast {
  kind: WeatherKind;
  airTempC: number;
  trackTempC: number;
  rainChancePct: number;
  windKph: number;
}

/** Anchor points + frame, consumed by `splinePath` to draw the layout. */
export interface TrackLayout {
  anchors: Point[];
  viewBox: { x: number; y: number; width: number; height: number };
}

export interface Track {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  lengthKm: number;
  laps: number;
  cornerCount: number;
  drsZones: number;
  lapRecordMs: number;
  profile: TrackProfile;
  characteristics: TrackCharacteristics;
  forecast: WeatherForecast;
  layout: TrackLayout;
  /** The circuit shipped with the base game, as opposed to a new venue. */
  isBaseTrack: boolean;
}

/* ------------------------------ Calendar ----------------------------- */

export type RoundStatus = 'COMPLETED' | 'NEXT' | 'UPCOMING';

export interface RoundResult {
  position: number;
  points: number;
  fastestLap: boolean;
}

export interface CalendarEntry {
  round: number;
  trackId: string;
  /** ISO-ish display date, e.g. "Mar 08". */
  date: string;
  status: RoundStatus;
  result?: RoundResult;
}

/* --------------------------- Season settings -------------------------- */

export type RaceLengthPct = 25 | 50 | 75 | 100;
export type QualifyingFormat = 'ONE_SHOT' | 'SHORT' | 'FULL';
export type AiDifficulty = 'ROOKIE' | 'PRO' | 'EXPERT' | 'LEGEND';

export interface SeasonRules {
  raceLengthPct: RaceLengthPct;
  qualifyingFormat: QualifyingFormat;
  aiDifficulty: AiDifficulty;
  tyreWearMultiplier: number;
  fuelConsumptionMultiplier: number;
  budgetCapEnabled: boolean;
  damageModel: 'OFF' | 'REDUCED' | 'FULL';
  safetyCarFrequency: 'LOW' | 'NORMAL' | 'HIGH';
}

/* ------------------------------- Drivers ------------------------------ */

export type MarketStatus = 'CONTRACTED' | 'FREE_AGENT' | 'JUNIOR_ACADEMY';

export type FormTrend = 'RISING' | 'PEAK' | 'STABLE' | 'DECLINING';

/** The three headline attributes surfaced across the career screens. */
export interface CareerStats {
  pace: number;
  consistency: number;
  racecraft: number;
}

export interface DriverProgression {
  /** Ceiling this driver can reach; drives scouting value. */
  potential: number;
  peakAge: number;
  trend: FormTrend;
  /** Projected season-over-season change. Negative values are decay. */
  delta: CareerStats;
  /** Seasons before retirement is forced. */
  seasonsRemaining: number;
}

export interface CareerDriver {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  country: string;
  countryCode: string;
  age: number;
  carNumber: number | null;
  /** null while a free agent or unsigned academy prospect. */
  teamId: string | null;
  teamName: string | null;
  isUserTeam: boolean;
  stats: CareerStats;
  overall: number;
  progression: DriverProgression;
  marketStatus: MarketStatus;
  salaryPerSeason: number;
  askingPrice: number;
  contractSeasonsRemaining: number;
  /** Season the prospect was produced by the scouting network. */
  scoutedInSeason?: number;
}

/* --------------------------- Engineering / R&D ------------------------ */

export type ComponentGroup = 'POWER_UNIT' | 'AERODYNAMICS' | 'MECHANICAL';

export type ComponentCategory =
  | 'ICE'
  | 'TURBOCHARGER'
  | 'MGU_K'
  | 'MGU_H'
  | 'ENERGY_STORE'
  | 'CHASSIS'
  | 'FRONT_WING'
  | 'REAR_WING'
  | 'FLOOR'
  | 'BRAKES'
  | 'SUSPENSION'
  | 'GEARBOX'
  | 'COOLING'
  | 'ACTIVE_AERO';

export type DesignPhilosophy =
  | 'BALANCED'
  | 'HIGH_REV'
  | 'FUEL_EFFICIENT'
  | 'HIGH_DOWNFORCE'
  | 'LOW_DRAG'
  | 'STIFF'
  | 'COMPLIANT'
  /** Built to survive the season rather than to win one Saturday. */
  | 'ENDURANT'
  /** Everything sacrificed for one flying lap. */
  | 'AGGRESSIVE';

/** Signed point deltas applied to the car's performance profile. */
export interface PerformanceDelta {
  power: number;
  aero: number;
  reliability: number;
  fuelEfficiency: number;
  driveability: number;
}

export type UpgradeStatus =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'IN_DEVELOPMENT'
  | 'INSTALLED'
  | 'BLOCKED';

export interface ComponentVariant {
  id: string;
  componentId: string;
  name: string;
  description: string;
  philosophy: DesignPhilosophy;
  /** Depth in the tech tree, 1 = root. */
  tier: number;
  tokenCost: number;
  weeksRequired: number;
  delta: PerformanceDelta;
  /** Variant ids that must be installed first. Empty for tier-1 roots. */
  requires: string[];
  /** Taking this variant permanently rules these out — philosophy lock-in. */
  excludes: string[];
}

export interface EngineComponent {
  id: string;
  category: ComponentCategory;
  group: ComponentGroup;
  name: string;
  description: string;
  baseRating: number;
  variants: ComponentVariant[];
}

/** Live progress for one variant inside a career save. */
export interface RndProject {
  variantId: string;
  componentId: string;
  status: 'IN_DEVELOPMENT' | 'INSTALLED';
  weeksRemaining: number;
  startedInWeek: number;
  tokensSpent: number;
}

export interface RndState {
  /** Tokens the regulations permit this team to spend this season. */
  seasonalCapTokens: number;
  seasonalTokensUsed: number;
  /** Keyed by variant id. */
  projects: Record<string, RndProject>;
  installedVariantIds: string[];
  /** Running totals from every installed variant. */
  performance: PerformanceDelta;
}

/* ----------------------------- Career state --------------------------- */

export type SeasonStatus = 'PRE_SEASON' | 'IN_SEASON' | 'OFF_SEASON';

export interface CareerState {
  careerId: string;
  teamId: string;
  teamName: string;
  currentSeason: number;
  /** 1-52; R&D projects complete on a week boundary. */
  currentWeek: number;
  seasonStatus: SeasonStatus;
  teamBudget: number;
  developmentTokens: number;
  rules: SeasonRules;
  calendar: CalendarEntry[];
  rnd: RndState;
  drivers: CareerDriver[];
  updatedAt: string;
}

/** Reference data that does not change during a career. */
export interface CareerCatalog {
  tracks: Track[];
  components: EngineComponent[];
}

export interface CareerBundle {
  state: CareerState;
  catalog: CareerCatalog;
}

/* ------------------------------ Transport ----------------------------- */

export type CareerSource = 'mongodb' | 'local';

export type CareerConnection = 'CHECKING' | 'ONLINE' | 'OFFLINE';

/** Every mutation the dashboard can request of the backend. */
export type CareerAction =
  | { type: 'SET_RULES'; rules: Partial<SeasonRules> }
  | { type: 'SET_CALENDAR'; trackIds: string[] }
  | { type: 'SCOUT_DRIVER' }
  | { type: 'SIGN_DRIVER'; driverId: string }
  | { type: 'RELEASE_DRIVER'; driverId: string }
  | { type: 'START_UPGRADE'; variantId: string }
  | { type: 'CANCEL_UPGRADE'; variantId: string }
  | { type: 'ADVANCE_WEEKS'; weeks: number }
  | { type: 'RESET_CAREER' };

export interface CareerActionResult {
  ok: boolean;
  /** Human-readable reason when `ok` is false — surfaced as a toast. */
  message?: string;
  state?: CareerState;
}
