import { GRID_2026_DRIVERS, GRID_2026_TEAMS } from '@/data/grid2026';
import { buildComponents, buildTracks } from '@/lib/careerGen';
import { sponsorById } from '@/data/sponsors';
import { RND_COST_PER_POINT, RND_STAT_CEILING } from './machineConstants';
import {
  ENGINE_ALLOCATION,
  ENGINE_WEAR_PER_RACE_LAP,
  PART_BY_ID,
  buildPowerUnit,
  enginePenaltyPlaces,
  fittedUnit,
  powerUnitCost,
  refreshCar,
  seedParts,
  unitSpecRating,
} from './carModel';
import {
  PART_AREA,
  advanceDevelopment,
  canDevelop,
  developmentCost,
  developmentGain,
  developmentWeeks,
  partLevel,
} from './partDevelopment';
import { applyTransferMoves, runSillySeason } from './transferMarket';
import {
  advanceDriverSeason,
  buildProspects,
  seedDriverRecords,
} from './driverDevelopment';
import { developAiCars, developAiPreSeason } from './aiDevelopment';
import {
  CONDITION_EVENTS,
  applyConditionEvent,
  applyRaceFatigue,
  blankCondition,
  recoverBetweenRounds,
} from './driverCondition';
import type { ConditionEvent } from './driverCondition';
import { archiveSeason } from './seasonArchive';
import {
  appointmentFrom,
  canHire,
  hireCost,
  roundStaffBill,
  severanceFor,
  staffMarket,
  staffMarketingMultiplier,
  staffReputationBonus,
  staffBuildTimeReduction,
} from './staffing';
import { applyRaceResult, emptyStandings } from './championship';
import { DRIVER_BY_ID } from '@/data/drivers';
import {
  DEFAULT_FACILITIES,
  FACILITY_BY_ID,
  academyDiscount,
  buildTimeReduction,
  facilityUpgradeCost,
  logisticsMultiplier,
  marketingMultiplier,
  pitCrewGainPerLevel,
} from './facilities';
import {
  activeContracts,
  canSignSponsor,
  contractFromSponsor,
  post,
  quoteTransfer,
  racePayout,
  roundOperatingCost,
  roundWageBill,
  settleSeason,
  upgradeCashCost,
} from './finance';
import {
  evaluateApplication,
  expectedPositionFor,
  jobOpenings,
  updateManagerScore,
} from './jobMarket';
import { SAVE_VERSION } from './types';
import type { ComponentVariant } from '@/types/career';
import type {
  GameEvent,
  GameEventType,
  GamePhase,
  GameState,
  QualifyingEntry,
  RndArea,
  SeasonSettings,
  StrategyPlan,
  TransitionResult,
} from './types';

/* =====================================================================
 * The game-flow state machine.
 *
 * Two tables define the whole flow:
 *   PHASE_TRANSITIONS  — events that move the player to a new phase
 *   PHASE_ACTIONS      — events allowed *within* a phase, no phase change
 *
 * Anything not in one of those tables for the current phase is refused
 * with a reason rather than silently ignored, so an out-of-order screen
 * transition is impossible to trigger from the UI.
 * ===================================================================== */

export const PHASE_TRANSITIONS: Record<
  GamePhase,
  Partial<Record<GameEventType, GamePhase>>
> = {
  MAIN_MENU: {
    NEW_GAME: 'SETUP_CAREER',
    CONTINUE: 'HUB', // overridden by the phase stored in the save
  },
  SETUP_CAREER: {
    CONFIRM_SETUP: 'TEAM_SELECTION',
    RETURN_TO_MENU: 'MAIN_MENU',
  },
  TEAM_SELECTION: {
    CONFIRM_TEAM: 'PRE_SEASON',
    RETURN_TO_MENU: 'MAIN_MENU',
  },
  PRE_SEASON: {
    START_SEASON: 'HUB',
    RETURN_TO_MENU: 'MAIN_MENU',
  },
  HUB: {
    PROCEED_TO_QUALIFYING: 'QUALIFYING',
    RETURN_TO_MENU: 'MAIN_MENU',
  },
  QUALIFYING: {
    // Qualifying does not lead straight to the grid: the tyres have to
    // be chosen first, and that choice is a screen of its own.
    PROCEED_TO_RACE: 'RACE_STRATEGY',
  },
  RACE_STRATEGY: {
    CONFIRM_STRATEGY: 'RACE_COUNTDOWN',
  },
  RACE_COUNTDOWN: {
    COUNTDOWN_COMPLETE: 'RACE_SESSION',
  },
  RACE_SESSION: {
    RACE_COMPLETE: 'POST_RACE',
  },
  POST_RACE: {
    // Retargeted to SEASON_REVIEW by the reducer on the final round.
    CONTINUE_TO_NEXT_WEEK: 'HUB',
  },
  SEASON_REVIEW: {
    CONFIRM_SPONSORS: 'PRE_SEASON',
    RETURN_TO_MENU: 'MAIN_MENU',
  },
};

/**
 * Management actions available from the sidebar. The dashboard shell is
 * on screen for every phase except the pre-career screens and a live
 * race, so these are legal wherever the player can actually reach the
 * menu that triggers them.
 */
const MANAGEMENT_ACTIONS: GameEventType[] = [
  'DEVELOP_PART',
  'CANCEL_PART_DEVELOPMENT',
  'BUILD_POWER_UNIT',
  'FIT_POWER_UNIT',
  'SET_PHILOSOPHY',
  'START_UPGRADE',
  'CANCEL_UPGRADE',
  'UPGRADE_FACILITY',
  'SWAP_DRIVER',
  'SIGN_PROSPECT',
  'HIRE_STAFF',
  'RELEASE_STAFF',
  'SET_STRATEGY',
  'SET_STARTING_TYRE',
  'CONDITION_EVENT',
  'SET_SETTINGS',
];

/** Events that mutate state but leave the phase alone. */
export const PHASE_ACTIONS: Record<GamePhase, GameEventType[]> = {
  MAIN_MENU: ['RESET'],
  SETUP_CAREER: ['SET_SETTINGS', 'SET_MANAGER_NAME'],
  TEAM_SELECTION: ['PREVIEW_TEAM'],
  // The calendar is only editable before the championship starts.
  PRE_SEASON: [...MANAGEMENT_ACTIONS, 'SET_CALENDAR', 'SIGN_SPONSOR'],
  HUB: [...MANAGEMENT_ACTIONS, 'APPLY_FOR_JOB', 'SIGN_SPONSOR'],
  QUALIFYING: [...MANAGEMENT_ACTIONS, 'QUALIFYING_COMPLETE'],
  RACE_STRATEGY: MANAGEMENT_ACTIONS,
  RACE_COUNTDOWN: [],
  // Condition moves during the race, so this one event is legal in-session.
  RACE_SESSION: ['CONDITION_EVENT'],
  POST_RACE: MANAGEMENT_ACTIONS,
  // Signing is the whole point of the screen; management stays open so
  // the player can look at the car and the books while they decide.
  SEASON_REVIEW: [...MANAGEMENT_ACTIONS, 'SIGN_SPONSOR'],
};

export const DEFAULT_SETTINGS: SeasonSettings = {
  raceLengthPct: 25,
  difficulty: 'PRO',
  seasonLength: 8,
  qualifyingLaps: 5,
  fastestLapPoint: true,
};

/* Cost per R&D point and the stat ceiling live in `machineConstants` so
 * modules the reducer calls can read them without importing the reducer. */
export { RND_COST_PER_POINT, RND_STAT_CEILING };

/** Regulatory ceiling on component development tokens per season. */
export const SEASONAL_CAP_TOKENS = 48;
export const STARTING_DEV_TOKENS = 60;
/** Cancelling a project recovers half of what was committed. */
export const CANCEL_REFUND_RATE = 0.5;

const COMPONENT_CATALOG = buildComponents();

export function findVariant(variantId: string): ComponentVariant | undefined {
  for (const component of COMPONENT_CATALOG) {
    const found = component.variants.find((variant) => variant.id === variantId);
    if (found) return found;
  }
  return undefined;
}

export { COMPONENT_CATALOG };

export { DEFAULT_FACILITIES, facilityUpgradeCost };


/**
 * Drops the given drivers a number of grid places and closes the gap
 * behind them. Positions are renumbered from the resulting order, so the
 * grid stays 1..n with no holes however many cars are penalised.
 */
function applyGridPenalty(
  entries: QualifyingEntry[],
  penalisedIds: string[],
  places: number,
): QualifyingEntry[] {
  const order = [...entries].sort((a, b) => a.position - b.position);

  for (const driverId of penalisedIds) {
    const from = order.findIndex((entry) => entry.driverId === driverId);
    if (from < 0) continue;
    const [moved] = order.splice(from, 1);
    if (!moved) continue;
    order.splice(Math.min(order.length, from + places), 0, moved);
  }

  return order.map((entry, index) => ({ ...entry, position: index + 1 }));
}

export function createNewGame(managerName = 'New Manager'): GameState {
  const now = new Date().toISOString();
  const driverTeams = Object.fromEntries(
    GRID_2026_DRIVERS.map((driver) => [driver.id, driver.teamId]),
  );
  /* Every team is assembled from parts rather than handed a set of
   * statistics, and starts the season with one power unit fitted and the
   * rest of its allocation still on the shelf. */
  const teams = GRID_2026_TEAMS.map((team) => {
    const parts = seedParts(team.car);
    const first = buildPowerUnit(parts, 2026, 0);
    first.status = 'FITTED' as const;

    return {
      teamId: team.id,
      budget: team.budget,
      car: { ...team.car },
      parts,
      powerUnits: [first],
      fittedPowerUnitId: first.id,
      development: [],
      philosophy: 'BALANCED' as const,
    };
  });

  // Fold the seeded parts back into the cached statistics.
  for (const team of teams) refreshCar(team);

  return {
    version: SAVE_VERSION,
    phase: 'SETUP_CAREER',
    createdAt: now,
    updatedAt: now,
    managerName,
    managerPerformanceScore: 45,
    settings: { ...DEFAULT_SETTINGS },
    playerTeamId: null,
    pendingTeamId: null,
    season: 2026,
    round: 1,
    week: 1,
    calendarTrackIds: buildTracks()
      .slice(0, DEFAULT_SETTINGS.seasonLength)
      .map((track) => track.id),
    teams,
    driverTeams,
    qualifying: null,
    lastRace: null,
    standings: emptyStandings(
      driverTeams,
      GRID_2026_TEAMS.map((team) => team.id),
    ),
    history: [],
    rndSpent: {
      aero: 0,
      powerUnit: 0,
      electrical: 0,
      reliability: 0,
      pitCrew: 0,
      brakes: 0,
      suspension: 0,
      cooling: 0,
    },
    jobApplications: [],
    rnd: {
      developmentTokens: STARTING_DEV_TOKENS,
      seasonalCapTokens: SEASONAL_CAP_TOKENS,
      seasonalTokensUsed: 0,
      projects: {},
      installedVariantIds: [],
    },
    facilities: DEFAULT_FACILITIES.map((facility) => ({ ...facility })),
    strategies: {},
    finance: {
      // A new team starts with no deals at all. The first season is run
      // on the war chest, and the season review is where that changes.
      contracts: [],
      ledger: [],
      seasonIncome: 0,
      seasonExpenditure: 0,
    },
    lastTransferWindow: [],
    // Every seat starts empty, which is a real handicap rather than a
    // neutral starting point: the market is the first thing to fix.
    staff: [],
    driverRecords: seedDriverRecords(GRID_2026_DRIVERS.map((driver) => driver.id)),
    driverConditions: Object.fromEntries(
      GRID_2026_DRIVERS.map((driver) => [driver.id, blankCondition(driver.id, driver.morale)]),
    ),
    prospects: buildProspects(2026),
    academyDrivers: [],
    seasonArchive: [],
    pendingGridPenalty: 0,
  };
}

export type UpgradeStatus =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'IN_DEVELOPMENT'
  | 'INSTALLED'
  | 'BLOCKED';

/**
 * Where a variant sits for this save: already fitted, under construction,
 * ruled out by an earlier philosophy choice, gated behind a prerequisite,
 * or ready to start.
 */
export function variantStatus(variant: ComponentVariant, state: GameState): UpgradeStatus {
  const { installedVariantIds, projects } = state.rnd;

  if (installedVariantIds.includes(variant.id)) return 'INSTALLED';
  if (projects[variant.id]?.status === 'IN_DEVELOPMENT') return 'IN_DEVELOPMENT';

  const committed = new Set([...installedVariantIds, ...Object.keys(projects)]);
  if (variant.excludes.some((id) => committed.has(id))) return 'BLOCKED';
  if (!variant.requires.every((id) => installedVariantIds.includes(id))) return 'LOCKED';

  return 'AVAILABLE';
}

export interface UpgradeCheck {
  ok: boolean;
  reason?: string;
}

/** Shared gate used by the UI (to disable a node) and by the reducer. */
export function canStartUpgrade(variant: ComponentVariant, state: GameState): UpgradeCheck {
  const status = variantStatus(variant, state);

  if (status === 'INSTALLED') return { ok: false, reason: 'Already fitted to the car.' };
  if (status === 'IN_DEVELOPMENT') return { ok: false, reason: 'Already in development.' };
  if (status === 'BLOCKED') {
    return { ok: false, reason: 'Ruled out by the design philosophy already committed to.' };
  }
  if (status === 'LOCKED') {
    return { ok: false, reason: 'Requires the previous upgrade in this branch to be fitted.' };
  }

  const capRemaining = state.rnd.seasonalCapTokens - state.rnd.seasonalTokensUsed;
  if (capRemaining <= 0) {
    return { ok: false, reason: 'Seasonal development cap reached. No further upgrades this season.' };
  }
  if (variant.tokenCost > capRemaining) {
    return {
      ok: false,
      reason: `Only ${capRemaining} tokens left under the seasonal cap; this costs ${variant.tokenCost}.`,
    };
  }
  if (variant.tokenCost > state.rnd.developmentTokens) {
    return { ok: false, reason: 'Not enough development tokens in the pool.' };
  }

  return { ok: true };
}

/** Fold a fitted variant's performance delta into the player's car. */
function applyVariantToCar(state: GameState, variantId: string): void {
  const variant = findVariant(variantId);
  const team = state.teams.find((entry) => entry.teamId === state.playerTeamId);
  if (!variant || !team) return;

  const clampStat = (value: number) => Math.max(1, Math.min(RND_STAT_CEILING, value));

  team.car.aero = clampStat(team.car.aero + variant.delta.aero * 0.5);
  team.car.powerUnit = clampStat(team.car.powerUnit + variant.delta.power * 0.5);
  team.car.electrical = clampStat(team.car.electrical + variant.delta.fuelEfficiency * 0.4);
  team.car.reliability = clampStat(team.car.reliability + variant.delta.reliability * 0.6);
  team.car.pace = clampStat(
    team.car.pace + (variant.delta.power + variant.delta.aero) * 0.22,
  );
}

/** Money in a refusal message reads better rounded than exact. */
function formatMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

export const AREA_LABEL: Record<RndArea, string> = {
  aero: 'Aerodynamics',
  powerUnit: 'Power Unit',
  electrical: 'Energy Systems',
  reliability: 'Reliability',
  pitCrew: 'Pit Crew',
  brakes: 'Brakes',
  suspension: 'Suspension',
  cooling: 'Cooling',
};

/** The player's two race drivers, in roster order. */
export function playerDriverIds(state: GameState): string[] {
  return Object.entries(state.driverTeams)
    .filter(([, teamId]) => teamId === state.playerTeamId)
    .map(([driverId]) => driverId);
}

/**
 * A default plan, so a driver always has something to edit. The figures
 * match the Race Strategy planner's own scales — stints in laps, push on
 * a 1-5 scale — because this is what that screen loads when a driver has
 * never been planned for.
 */
export function blankStrategy(driverId: string): StrategyPlan {
  return {
    driverId,
    stints: [
      { compound: 'MEDIUM', plannedLaps: 8 },
      { compound: 'HARD', plannedLaps: 6 },
    ],
    pushLevel: 3,
    startingCompound: 'MEDIUM',
    confirmedForRound: null,
  };
}

/**
 * Which of the player's cars still have no signed-off plan for this
 * round. The race cannot start while this is non-empty, which is the
 * whole mechanism behind the strategy gate.
 */
export function unconfirmedDrivers(state: GameState): string[] {
  return playerDriverIds(state).filter(
    (driverId) => state.strategies[driverId]?.confirmedForRound !== state.round,
  );
}

function refuse(message: string): TransitionResult {
  return { state: null, ok: false, message };
}

function clone(state: GameState): GameState {
  return {
    ...state,
    settings: { ...state.settings },
    teams: state.teams.map((team) => ({
      ...team,
      car: { ...team.car },
      parts: team.parts.map((part) => ({ ...part })),
      powerUnits: team.powerUnits.map((unit) => ({ ...unit, spec: { ...unit.spec } })),
      development: team.development.map((project) => ({ ...project })),
    })),
    driverTeams: { ...state.driverTeams },
    calendarTrackIds: [...state.calendarTrackIds],
    standings: {
      drivers: state.standings.drivers.map((row) => ({ ...row })),
      constructors: state.standings.constructors.map((row) => ({ ...row })),
    },
    history: [...state.history],
    rndSpent: { ...state.rndSpent },
    jobApplications: [...state.jobApplications],
    rnd: {
      ...state.rnd,
      projects: Object.fromEntries(
        Object.entries(state.rnd.projects).map(([key, project]) => [key, { ...project }]),
      ),
      installedVariantIds: [...state.rnd.installedVariantIds],
    },
    facilities: state.facilities.map((facility) => ({ ...facility })),
    strategies: Object.fromEntries(
      Object.entries(state.strategies).map(([key, plan]) => [
        key,
        { ...plan, stints: plan.stints.map((stint) => ({ ...stint })) },
      ]),
    ),
    finance: {
      ...state.finance,
      contracts: state.finance.contracts.map((contract) => ({ ...contract })),
      ledger: [...state.finance.ledger],
    },
    lastTransferWindow: state.lastTransferWindow.map((move) => ({ ...move })),
    staff: state.staff.map((entry) => ({ ...entry })),
    driverRecords: Object.fromEntries(
      Object.entries(state.driverRecords).map(([key, record]) => [key, { ...record }]),
    ),
    driverConditions: Object.fromEntries(
      Object.entries(state.driverConditions).map(([key, entry]) => [key, { ...entry }]),
    ),
    prospects: state.prospects.map((entry) => ({
      ...entry,
      attributes: { ...entry.attributes },
    })),
    academyDrivers: (state.academyDrivers ?? []).map((entry) => ({
      ...entry,
      attributes: { ...entry.attributes },
    })),
    seasonArchive: state.seasonArchive.map((entry) => ({
      ...entry,
      drivers: entry.drivers.map((row) => ({ ...row })),
      constructors: entry.constructors.map((row) => ({ ...row })),
      rounds: entry.rounds.map((row) => ({ ...row })),
    })),
  };
}

/** True when the event is legal in the current phase. */
export function canDispatch(phase: GamePhase, event: GameEventType): boolean {
  if (event === 'NEW_GAME' || event === 'CONTINUE') return phase === 'MAIN_MENU';
  // Deleting the save is always permitted, from any screen.
  if (event === 'RESET') return true;
  return (
    Boolean(PHASE_TRANSITIONS[phase][event]) || PHASE_ACTIONS[phase].includes(event)
  );
}

/**
 * The reducer. Pure: (state, event) -> next state or a refusal.
 * `state` is null only before a game exists (the main menu).
 */
export function transition(state: GameState | null, event: GameEvent): TransitionResult {
  /* ---- events that do not need an existing save ---- */

  if (event.type === 'NEW_GAME') {
    return { state: createNewGame(), ok: true };
  }

  if (event.type === 'CONTINUE') {
    if (event.save.version !== SAVE_VERSION) {
      return refuse('That save was made by an older version and cannot be loaded.');
    }
    // Resume exactly where the player left off, except mid-session phases,
    // which cannot be meaningfully restored — fall back to the hub.
    const resumable: GamePhase[] =
      event.save.phase === 'RACE_COUNTDOWN' || event.save.phase === 'RACE_SESSION'
        ? ['HUB']
        : [event.save.phase];
    return { state: { ...event.save, phase: resumable[0]! }, ok: true };
  }

  if (event.type === 'RESET') {
    return { state: null, ok: true };
  }

  if (!state) {
    return refuse('No game in progress.');
  }

  const phase = state.phase;

  if (!canDispatch(phase, event.type)) {
    return refuse(`"${event.type}" is not available during ${phase.replace('_', ' ')}.`);
  }

  const next = clone(state);
  const target = PHASE_TRANSITIONS[phase][event.type];
  /** Set by a case that needs a destination the table cannot express. */
  let overridePhase: GamePhase | null = null;

  switch (event.type) {
    /* ------------------------------ setup ------------------------------ */

    case 'SET_SETTINGS': {
      next.settings = { ...next.settings, ...event.settings };
      if (event.settings.seasonLength != null) {
        next.calendarTrackIds = buildTracks()
          .slice(0, next.settings.seasonLength)
          .map((track) => track.id);
      }
      break;
    }

    case 'SET_MANAGER_NAME': {
      next.managerName = event.name.slice(0, 32);
      break;
    }

    case 'CONFIRM_SETUP': {
      if (next.managerName.trim().length === 0) {
        return refuse('Enter a manager name before continuing.');
      }
      break;
    }

    case 'PREVIEW_TEAM': {
      next.pendingTeamId = event.teamId;
      break;
    }

    case 'CONFIRM_TEAM': {
      if (!next.pendingTeamId) return refuse('Select a team before continuing.');
      next.playerTeamId = next.pendingTeamId;
      break;
    }

    /* ---------------------------- pre-season --------------------------- */

    case 'DEVELOP_PART': {
      const team = next.teams.find((t) => t.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const level = partLevel(team, event.category);
      const check = canDevelop(team, event.category, event.intensity);
      if (!check.ok) return refuse(check.reason ?? 'Cannot start that programme.');

      const cost = developmentCost(event.category, level, event.intensity);
      const gain = developmentGain(next, event.category, level, event.intensity);
      const weeks = developmentWeeks(
        event.category,
        event.intensity,
        buildTimeReduction(next) + staffBuildTimeReduction(next),
      );

      team.development = [
        ...team.development,
        {
          id: `dev-${next.season}-${next.week}-${event.category}-${team.development.length}`,
          teamId: team.teamId,
          category: event.category,
          gain,
          weeksRemaining: weeks,
          totalWeeks: weeks,
          cost,
          startedInWeek: next.week,
        },
      ];

      next.rndSpent[PART_AREA[event.category]] += cost;
      post(
        next,
        'RND',
        `${PART_BY_ID.get(event.category)?.label ?? event.category} development`,
        -cost,
      );
      break;
    }

    case 'CANCEL_PART_DEVELOPMENT': {
      const team = next.teams.find((t) => t.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const project = team.development.find((entry) => entry.id === event.projectId);
      if (!project) return refuse('No such programme in progress.');

      // Work already done is money already spent; the rest comes back.
      const doneShare = 1 - project.weeksRemaining / Math.max(1, project.totalWeeks);
      const refund = Math.floor(project.cost * (1 - doneShare) * CANCEL_REFUND_RATE);

      team.development = team.development.filter((entry) => entry.id !== event.projectId);
      if (refund > 0) {
        post(
          next,
          'RND',
          `Cancelled: ${PART_BY_ID.get(project.category)?.label ?? project.category}`,
          refund,
        );
      }
      break;
    }

    case 'BUILD_POWER_UNIT': {
      const team = next.teams.find((t) => t.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const cost = powerUnitCost(team);
      if (team.budget < cost) {
        return refuse(
          `A fresh power unit costs ${formatMillions(cost)}; you have ${formatMillions(team.budget)}.`,
        );
      }

      const builtThisSeason = team.powerUnits.filter(
        (unit) => unit.builtInSeason === next.season,
      ).length;

      const unit = buildPowerUnit(team.parts, next.season, team.powerUnits.length);
      team.powerUnits = [...team.powerUnits, unit];
      post(next, 'UPGRADE', 'Power unit build', -cost);

      /* Beyond the allocation the unit is still legal — it just costs a
       * Saturday. Saying so at the moment of building is the only way the
       * player can weigh it. */
      if (builtThisSeason >= ENGINE_ALLOCATION) {
        /* Beyond the allocation the unit is still legal — it just costs a
         * Saturday, and `enginePenaltyPlaces` is what the grid reads. */
        next.pendingGridPenalty = enginePenaltyPlaces(team, next.season);
      }
      break;
    }

    case 'FIT_POWER_UNIT': {
      const team = next.teams.find((t) => t.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const unit = team.powerUnits.find((entry) => entry.id === event.unitId);
      if (!unit) return refuse('No such power unit.');
      if (unit.status === 'RETIRED') return refuse('That unit is beyond use.');
      if (team.fittedPowerUnitId === unit.id) return refuse('That unit is already in the car.');

      for (const entry of team.powerUnits) {
        if (entry.status === 'FITTED') entry.status = 'POOL';
      }
      unit.status = 'FITTED';
      team.fittedPowerUnitId = unit.id;
      refreshCar(team);
      break;
    }

    case 'SET_PHILOSOPHY': {
      const team = next.teams.find((t) => t.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');
      team.philosophy = event.philosophy;
      break;
    }

    case 'SWAP_DRIVER': {
      const { incomingDriverId, outgoingDriverId } = event;
      const incomingTeam = next.driverTeams[incomingDriverId];
      const outgoingTeam = next.driverTeams[outgoingDriverId];

      if (!incomingTeam || !outgoingTeam) return refuse('Unknown driver.');
      if (outgoingTeam !== next.playerTeamId) {
        return refuse('You can only release a driver from your own team.');
      }
      if (incomingTeam === next.playerTeamId) {
        return refuse('That driver already races for you.');
      }

      /* A transfer is a purchase like any other. The fee for the driver
       * coming in is offset by what the other team pays for the one going
       * the other way, and a strong academy negotiates the balance down. */
      const quote = quoteTransfer(incomingDriverId, outgoingDriverId, next);
      const fee = Math.round(quote.net * academyDiscount(next));
      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');
      if (team.budget < fee) {
        return refuse(
          `That transfer costs ${formatMillions(fee)}; you have ${formatMillions(team.budget)}.`,
        );
      }

      // A straight swap keeps both teams on two cars.
      next.driverTeams[incomingDriverId] = next.playerTeamId!;
      next.driverTeams[outgoingDriverId] = incomingTeam;

      const incomingName =
        DRIVER_BY_ID[incomingDriverId]?.lastName ??
        next.academyDrivers.find((entry) => entry.id === incomingDriverId)?.lastName ??
        incomingDriverId;
      post(next, 'TRANSFER', `Signed ${incomingName}`, -fee);
      break;
    }

    /* ------------------------- component R&D --------------------------- */

    case 'START_UPGRADE': {
      const variant = findVariant(event.variantId);
      if (!variant) return refuse('Unknown component variant.');

      const check = canStartUpgrade(variant, next);
      if (!check.ok) return refuse(check.reason ?? 'Cannot start this upgrade.');

      // Tokens are the regulator's limit; the build still has to be paid
      // for out of the same bank account as everything else.
      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');
      const cash = upgradeCashCost(variant.tokenCost);
      if (team.budget < cash) {
        return refuse(
          `Building ${variant.name} costs ${formatMillions(cash)}; you have ${formatMillions(
            team.budget,
          )}.`,
        );
      }

      next.rnd.developmentTokens -= variant.tokenCost;
      next.rnd.seasonalTokensUsed += variant.tokenCost;
      next.rnd.projects[variant.id] = {
        variantId: variant.id,
        componentId: variant.componentId,
        status: 'IN_DEVELOPMENT',
        weeksRemaining: Math.max(
          1,
          variant.weeksRequired - buildTimeReduction(next) - staffBuildTimeReduction(next),
        ),
        startedInWeek: next.week,
        tokensSpent: variant.tokenCost,
        cashSpent: cash,
      };
      post(next, 'UPGRADE', `Build: ${variant.name}`, -cash);
      break;
    }

    case 'CANCEL_UPGRADE': {
      const project = next.rnd.projects[event.variantId];
      if (!project) return refuse('No such project in development.');
      if (project.status === 'INSTALLED') return refuse('That upgrade is already fitted.');

      const refund = Math.floor(project.tokensSpent * CANCEL_REFUND_RATE);
      next.rnd.developmentTokens += refund;
      next.rnd.seasonalTokensUsed = Math.max(0, next.rnd.seasonalTokensUsed - refund);

      // Half the money comes back too; the rest is already in the parts.
      const cashBack = Math.floor((project.cashSpent ?? 0) * CANCEL_REFUND_RATE);
      if (cashBack > 0) {
        post(next, 'UPGRADE', `Cancelled: ${findVariant(event.variantId)?.name ?? 'project'}`, cashBack);
      }
      delete next.rnd.projects[event.variantId];
      break;
    }

    case 'UPGRADE_FACILITY': {
      const facility = next.facilities.find((entry) => entry.id === event.facilityId);
      if (!facility) return refuse('Unknown facility.');
      if (facility.level >= facility.maxLevel) return refuse('Already at maximum level.');

      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const cost = facilityUpgradeCost(facility);
      if (team.budget < cost) {
        return refuse(
          `That expansion costs ${formatMillions(cost)}; you have ${formatMillions(team.budget)}.`,
        );
      }

      facility.level += 1;
      post(next, 'FACILITY', `${FACILITY_BY_ID.get(facility.id)?.name ?? facility.id} expansion`, -cost);

      // The pit bay is the one building whose effect is a car stat, so it
      // is applied the moment the works are done.
      if (facility.id === 'pitcrew-bay') {
        team.car.pitCrew = Math.min(RND_STAT_CEILING, team.car.pitCrew + pitCrewGainPerLevel());
      }
      break;
    }

    case 'SET_STRATEGY': {
      if (next.driverTeams[event.plan.driverId] !== next.playerTeamId) {
        return refuse('You can only set strategy for your own drivers.');
      }
      next.strategies[event.plan.driverId] = {
        ...event.plan,
        stints: event.plan.stints.map((stint) => ({ ...stint })),
      };
      break;
    }

    case 'SET_CALENDAR': {
      const unique = [...new Set(event.trackIds)];
      if (unique.length !== event.trackIds.length) {
        return refuse('A circuit cannot appear twice in one season.');
      }
      if (event.trackIds.length !== next.settings.seasonLength) {
        return refuse(`The calendar must hold exactly ${next.settings.seasonLength} rounds.`);
      }
      next.calendarTrackIds = [...event.trackIds];
      break;
    }

    /* -------------------------------- hub ------------------------------ */

    case 'APPLY_FOR_JOB': {
      const opening = jobOpenings(next).find(
        (item) => item.teamId === event.teamId && item.role === event.role,
      );
      if (!opening) return refuse('That vacancy is no longer listed.');

      const alreadyApplied = next.jobApplications.some(
        (application) =>
          application.teamId === event.teamId &&
          application.season === next.season &&
          application.round === next.round,
      );
      if (alreadyApplied) {
        return refuse('You have already applied to that team this week.');
      }

      // Deterministic per team/season/round, so reloading cannot reroll it.
      const seed = (next.season * 97 + next.round * 31 + event.teamId.length * 7) % 100;
      const outcome = evaluateApplication(next, opening, seed / 100);

      next.jobApplications = [outcome.application, ...next.jobApplications].slice(0, 20);
      if (outcome.newTeamId) next.playerTeamId = outcome.newTeamId;
      break;
    }

    /* ----------------------------- sessions ---------------------------- */

    case 'PROCEED_TO_QUALIFYING': {
      next.qualifying = null;
      break;
    }

    case 'QUALIFYING_COMPLETE': {
      /* A power-unit penalty is served here, at the moment the qualifying
       * order becomes the starting grid. Without this the allocation rule
       * has no teeth at all: the player could build a fifth engine every
       * round and never pay the Saturday it is supposed to cost. */
      if (next.pendingGridPenalty > 0) {
        next.qualifying = {
          ...event.result,
          entries: applyGridPenalty(
            event.result.entries,
            playerDriverIds(next),
            next.pendingGridPenalty,
          ),
        };
        next.pendingGridPenalty = 0;
      } else {
        next.qualifying = event.result;
      }

      /* Saturday is the first thing that moves a driver all weekend, and
       * it moves them hard: being out-qualified by a team-mate is the
       * comparison every driver actually measures themselves against. */
      const entries = event.result.entries;
      for (const entry of entries) {
        const condition = next.driverConditions[entry.driverId];
        if (!condition) continue;

        let updated = condition;

        const mate = entries.find(
          (other) => other.teamId === entry.teamId && other.driverId !== entry.driverId,
        );
        if (mate) {
          updated = applyConditionEvent(
            updated,
            entry.position < mate.position ? 'OUT_QUALIFIED_MATE' : 'BEATEN_BY_MATE',
            // A thrashing hurts more than being pipped.
            Math.min(1.6, 0.6 + Math.abs(entry.position - mate.position) * 0.18),
          );
        }

        /* And where they ended up on the grid in absolute terms — the
         * front row lifts anybody, the back of it deflates anybody. */
        if (entry.position <= 3) {
          updated = applyConditionEvent(updated, 'QUALIFIED_WELL', entry.position === 1 ? 1.4 : 1);
        } else if (entry.position >= entries.length - 4) {
          updated = applyConditionEvent(updated, 'QUALIFIED_POORLY');
        }

        next.driverConditions[entry.driverId] = updated;
      }
      break;
    }

    case 'PROCEED_TO_RACE': {
      if (!next.qualifying) {
        return refuse('Qualifying must be completed before the race.');
      }
      /* Entering the strategy room clears last round's sign-off, so the
       * tyre choice is made again for this circuit rather than inherited.
       * A driver who has never been planned for is left without a plan at
       * all, so the strategy screen seeds its own sensible defaults for
       * the race length rather than inheriting placeholder stints. */
      for (const driverId of playerDriverIds(next)) {
        const plan = next.strategies[driverId];
        if (plan) next.strategies[driverId] = { ...plan, confirmedForRound: null };
      }
      break;
    }

    case 'SET_STARTING_TYRE': {
      if (next.driverTeams[event.driverId] !== next.playerTeamId) {
        return refuse('You can only set tyres for your own drivers.');
      }
      const plan = next.strategies[event.driverId] ?? blankStrategy(event.driverId);
      const stints = plan.stints.map((stint) => ({ ...stint }));
      if (stints[0]) stints[0].compound = event.compound;

      next.strategies[event.driverId] = {
        ...plan,
        stints,
        startingCompound: event.compound,
        // Choosing the tyre *is* the sign-off for this round.
        confirmedForRound: next.round,
      };
      break;
    }

    case 'CONDITION_EVENT': {
      const condition = next.driverConditions[event.driverId];
      if (!condition) return refuse('No condition tracked for that driver.');
      if (!(event.event in CONDITION_EVENTS)) return refuse('Unknown condition event.');

      next.driverConditions[event.driverId] = applyConditionEvent(
        condition,
        event.event as ConditionEvent,
      );
      break;
    }

    case 'CONFIRM_STRATEGY': {
      const missing = unconfirmedDrivers(next);
      if (missing.length > 0) {
        const names = missing
          .map((driverId) => DRIVER_BY_ID[driverId]?.lastName ?? driverId)
          .join(' and ');
        return refuse(`Choose a starting compound for ${names} before going to the grid.`);
      }
      break;
    }

    case 'SIGN_PROSPECT': {
      const prospect = next.prospects.find((entry) => entry.id === event.prospectId);
      if (!prospect) return refuse('That prospect is no longer available.');
      if (next.driverTeams[prospect.id]) return refuse('That driver already has a seat.');
      if (next.driverTeams[event.outgoingDriverId] !== next.playerTeamId) {
        return refuse('You can only release one of your own drivers.');
      }

      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      /* A junior costs a fraction of an established driver, which is the
       * entire appeal — and the entire risk, since you are buying the
       * ceiling rather than what is on the timing screen today. */
      const fee = Math.round(prospect.salary * 1.2 * academyDiscount(next));
      if (team.budget < fee) {
        return refuse(
          `Signing ${prospect.lastName} costs ${formatMillions(fee)}; you have ${formatMillions(team.budget)}.`,
        );
      }

      // The released driver becomes a free agent rather than vanishing.
      delete next.driverTeams[event.outgoingDriverId];
      next.driverTeams[prospect.id] = next.playerTeamId!;

      /* The intake is rebuilt every season, so a graduate has to be kept
       * somewhere that survives the new year — otherwise they hold a seat
       * that names nobody and disappear from every screen. */
      if (!next.academyDrivers.some((entry) => entry.id === prospect.id)) {
        next.academyDrivers.push({ ...prospect, attributes: { ...prospect.attributes } });
      }

      if (!next.driverConditions[prospect.id]) {
        // A junior arrives keen and largely unbothered by anything yet.
        next.driverConditions[prospect.id] = blankCondition(prospect.id, 82);
      }

      if (!next.driverRecords[prospect.id]) {
        next.driverRecords[prospect.id] = {
          driverId: prospect.id,
          age: prospect.age,
          deltas: {},
          seasonsRun: 0,
          careerPoints: 0,
          careerWins: 0,
          careerPodiums: 0,
        };
      }

      post(next, 'TRANSFER', `Signed ${prospect.firstName} ${prospect.lastName}`, -fee);
      break;
    }

    /* -------------------------------- staff ---------------------------- */

    case 'HIRE_STAFF': {
      const candidate = staffMarket(next).find((entry) => entry.id === event.candidateId);
      if (!candidate) return refuse('That candidate is no longer on the market.');

      const availability = canHire(next, candidate);
      if (!availability.ok) return refuse(availability.reason ?? 'Cannot make that hire.');

      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      const fee = hireCost(candidate);
      if (team.budget < fee) {
        return refuse(
          `${candidate.name} costs ${formatMillions(fee)} to sign; you have ${formatMillions(
            team.budget,
          )}.`,
        );
      }

      next.staff = [...next.staff, appointmentFrom(candidate, next.season)];
      post(next, 'STAFF', `Signed ${candidate.name}`, -fee);
      break;
    }

    case 'RELEASE_STAFF': {
      const appointment = next.staff.find((entry) => entry.role === event.role);
      if (!appointment) return refuse('Nobody holds that role.');

      const team = next.teams.find((entry) => entry.teamId === next.playerTeamId);
      if (!team) return refuse('No team selected.');

      // Tearing up a contract costs the balance of the year, halved.
      const severance = severanceFor(appointment, next);
      if (team.budget < severance) {
        return refuse(
          `Releasing ${appointment.name} costs ${formatMillions(severance)} in severance; you have ${formatMillions(team.budget)}.`,
        );
      }

      next.staff = next.staff.filter((entry) => entry.role !== event.role);
      if (severance > 0) {
        post(next, 'STAFF', `${appointment.name} released`, -severance);
      }
      break;
    }

    /* ------------------------------ sponsors --------------------------- */

    case 'SIGN_SPONSOR': {
      const sponsor = sponsorById(event.sponsorId);
      if (!sponsor) return refuse('No such sponsor.');

      const eligibility = canSignSponsor(next, sponsor);
      if (!eligibility.ok) return refuse(eligibility.reason ?? 'That deal is not available.');

      next.finance.contracts = [
        contractFromSponsor(sponsor, next.season),
        ...next.finance.contracts,
      ];
      // The signing bonus lands immediately; the retainer starts next race.
      post(
        next,
        'SIGNING_BONUS',
        `${sponsor.name} signing bonus`,
        Math.round(sponsor.signingBonus * marketingMultiplier(next) * staffMarketingMultiplier(next)),
      );
      break;
    }

    case 'CONFIRM_SPONSORS': {
      if (activeContracts(next).length === 0) {
        return refuse('Sign at least one partner before starting the season.');
      }
      break;
    }

    case 'RACE_COMPLETE': {
      next.lastRace = event.result;
      next.standings = applyRaceResult(next.standings, event.result);

      /* The result is the biggest single thing that moves a driver, and
       * it is judged against the grid slot they started from rather than
       * against the absolute position — a recovery drive from P18 to P11
       * is a good day, and a P2 that started on pole is not. */
      for (const finish of event.result.finishers) {
        const condition = next.driverConditions[finish.driverId];
        if (!condition) continue;

        let updated = condition;

        if (finish.status === 'DNF') {
          updated = applyConditionEvent(updated, 'MECHANICAL_FAILURE');
        } else {
          const gained = finish.gridPosition - finish.position;
          const podium = finish.position <= 3;

          if (podium || gained >= 5) {
            updated = applyConditionEvent(updated, 'RESULT_EXCELLENT');
          } else if (finish.points > 0 || gained >= 2) {
            updated = applyConditionEvent(updated, 'RESULT_GOOD');
          } else if (gained <= -5) {
            updated = applyConditionEvent(updated, 'RESULT_TERRIBLE');
          } else if (gained < 0) {
            updated = applyConditionEvent(updated, 'RESULT_POOR');
          }
        }

        next.driverConditions[finish.driverId] = applyRaceFatigue(
          updated,
          event.result.totalLaps,
        );
      }

      const expected = expectedPositionFor(next, next.playerTeamId);
      /* A well-regarded principal fronts the team to the paddock, which
       * is the other half of what that appointment is sold on — the
       * sponsor multiplier was already wired, this was not. */
      next.managerPerformanceScore = Math.max(
        0,
        Math.min(
          100,
          updateManagerScore(
            next.managerPerformanceScore,
            event.result,
            next.playerTeamId,
            expected,
          ) + staffReputationBonus(next),
        ),
      );

      const ourFinishes = event.result.finishers.filter(
        (finish) => finish.teamId === next.playerTeamId,
      );
      next.history = [
        ...next.history,
        {
          season: next.season,
          round: next.round,
          trackId: event.result.trackId,
          bestFinish: ourFinishes.length
            ? Math.min(...ourFinishes.map((finish) => finish.position))
            : null,
          pointsScored: ourFinishes.reduce((sum, finish) => sum + finish.points, 0),
        },
      ];

      /* ---- power-unit mileage ------------------------------------- *
       * Every car on the grid ran the same race, so every fitted unit
       * takes the same mileage. A unit that has run itself out stops
       * giving back what its spec says it should. */
      for (const team of next.teams) {
        const unit = fittedUnit(team);
        if (!unit) continue;

        unit.mileageLaps += event.result.totalLaps;

        /* Wear scales with how fragile the unit is: a well-built engine
         * survives a season, a poor one does not see out four races. */
        const quality = Math.max(20, unitSpecRating(unit));
        const wear = event.result.totalLaps * ENGINE_WEAR_PER_RACE_LAP * (1.45 - quality / 100);
        unit.healthPct = Math.max(0, Math.round((unit.healthPct - wear) * 10) / 10);
        if (unit.healthPct <= 0) unit.status = 'RETIRED';

        refreshCar(team);
      }

      /* ---- the weekend's books ------------------------------------ *
       * Income and outgoings are both settled here, on the round the
       * race actually happened, so the ledger reads like a season
       * rather than a lump sum at the end of it. */
      if (next.playerTeamId) {
        const payout = racePayout(next, event.result);
        const marketing = marketingMultiplier(next) * staffMarketingMultiplier(next);

        if (payout.retainer > 0) {
          post(next, 'SPONSOR', 'Partner retainers', Math.round(payout.retainer * marketing));
        }
        if (payout.results > 0) {
          post(
            next,
            'SPONSOR',
            `Result bonuses — ${payout.points} pts` +
              (payout.wins > 0 ? `, ${payout.wins} win${payout.wins > 1 ? 's' : ''}` : '') +
              (payout.podiums > 0 ? `, ${payout.podiums} podium` : ''),
            Math.round(payout.results * marketing),
          );
        }

        const wages = roundWageBill(next);
        if (wages > 0) post(next, 'SALARY', 'Driver salaries', -wages);

        const staffWages = roundStaffBill(next);
        if (staffWages > 0) post(next, 'STAFF', 'Staff salaries', -staffWages);

        const operations = Math.round(roundOperatingCost(next) * logisticsMultiplier(next));
        post(next, 'OPERATIONS', 'Race weekend operations', -operations);
      }
      break;
    }

    case 'CONTINUE_TO_NEXT_WEEK': {
      const weeksElapsed = 2;
      next.week += weeksElapsed;

      /* A fortnight away from the circuit pulls everyone back towards
       * the middle: nobody stays furious, and nobody stays euphoric. */
      for (const [driverId, condition] of Object.entries(next.driverConditions)) {
        next.driverConditions[driverId] = recoverBetweenRounds(condition);
      }

      /* Part programmes tick down and fit themselves when ready. Every
       * team runs them, so the grid moves whether or not the player is
       * paying attention. */
      for (const team of next.teams) {
        const landed = advanceDevelopment(team, weeksElapsed);
        if (landed.length > 0) refreshCar(team);
      }

      // Tech-tree projects tick down and fit themselves when ready.
      for (const project of Object.values(next.rnd.projects)) {
        if (project.status !== 'IN_DEVELOPMENT') continue;
        project.weeksRemaining -= weeksElapsed;
        if (project.weeksRemaining <= 0) {
          project.weeksRemaining = 0;
          project.status = 'INSTALLED';
          if (!next.rnd.installedVariantIds.includes(project.variantId)) {
            next.rnd.installedVariantIds.push(project.variantId);
          }
          applyVariantToCar(next, project.variantId);
        }
      }

      if (next.round >= next.settings.seasonLength) {
        /* ---- season settlement ----------------------------------- *
         * Prize money in, sponsor penalties out, contracts wound down
         * a year. This happens before the phase flips to the review
         * screen so the player sees the finished books, not a preview. */
        if (next.playerTeamId) {
          const settlement = settleSeason(next);
          post(
            next,
            'PRIZE',
            `Constructors' prize money — P${settlement.position}`,
            settlement.prize,
          );
          for (const penalty of settlement.penalties) {
            post(
              next,
              'PENALTY',
              `${penalty.name} missed target (P${penalty.target})`,
              -penalty.penalty,
            );
          }
        }

        /* The championship that just finished is written down before
         * anything is cleared — it is the only record of it there will be. */
        next.seasonArchive = [...next.seasonArchive, archiveSeason(next)].slice(-40);

        /* The rest of the grid reshuffles itself: teams move on from
         * drivers who under-delivered or who are simply too old, promote
         * from further down the order, and take a chance on a junior.
         * Run before the standings are cleared, because last season's
         * results are the evidence. */
        const moves = runSillySeason(next);
        applyTransferMoves(next, moves);
        next.lastTransferWindow = moves;

        /* Everyone gets a year older and moves along their curve. This
         * has to happen after the silly season, which judges drivers on
         * the season they just had rather than on next year's numbers. */
        advanceDriverSeason(next);

        // Deals age a year; anything that runs out frees its slot.
        next.finance.contracts = next.finance.contracts
          .map((contract) => ({ ...contract, seasonsRemaining: contract.seasonsRemaining - 1 }))
          .filter((contract) => contract.seasonsRemaining > 0);

        // Championship over: roll into a fresh season, keeping the career.
        next.season += 1;
        next.round = 1;
        next.week = 1;
        next.standings = emptyStandings(
          next.driverTeams,
          next.teams.map((team) => team.teamId),
        );
        // New regulations year: the development cap resets.
        next.rnd.seasonalCapTokens = SEASONAL_CAP_TOKENS;
        next.rnd.seasonalTokensUsed = 0;
        next.finance.seasonIncome = 0;
        next.finance.seasonExpenditure = 0;

        /* A new year, a new intake and a new set of people looking for
         * work. Both markets are keyed on the season, so passing on a
         * class means it is genuinely gone. */
        next.prospects = buildProspects(next.season);

        /* The winter. Rival teams spend heavily and land it all before
         * the first race, so round one of a new year is genuinely a new
         * competitive picture rather than the last one carried over. */
        developAiPreSeason(next);

        // The books are closed; the player now has to fund the next year.
        overridePhase = 'SEASON_REVIEW';
      } else {
        next.round += 1;
      }

      /* Rival teams develop their cars between rounds. At the easier
       * settings this does nothing; at Expert and Legend it means a lead
       * built in the winter is not a lead you keep by standing still. */
      developAiCars(next, weeksElapsed);

      next.qualifying = null;
      break;
    }

    default:
      break;
  }

  if (overridePhase) next.phase = overridePhase;
  else if (target) next.phase = target;
  next.updatedAt = new Date().toISOString();

  return { state: next, ok: true };
}
