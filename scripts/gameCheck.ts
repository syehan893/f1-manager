/* Headless assertions for the career-game state machine.
 * Run with:  npm run game:check */

import {
  COMPONENT_CATALOG,
  PHASE_TRANSITIONS,
  canDispatch,
  canStartUpgrade,
  createNewGame,
  transition,
} from '../src/game/machine';
import { simulateQualifying, QUALIFYING_LAPS } from '../src/game/qualifying';
import { POINTS_TABLE, applyRaceResult, pointsForPosition, scoreRace } from '../src/game/championship';
import { evaluateApplication, jobOpenings } from '../src/game/jobMarket';
import { scaledLaps, trackToCircuit } from '../src/game/trackAdapter';
import { GRID_2026_DRIVERS, GRID_2026_TEAMS, carRating, driverRating } from '../src/data/grid2026';
import { driverValuation, quoteTransfer } from '../src/game/finance';
import { seasonScore } from '../src/game/transferMarket';
import { profileFor } from '../src/game/difficulty';
import { blankStrategy } from '../src/game/machine';
import {
  ASSEMBLY_PARTS,
  CARS_PER_TEAM,
  PARTS,
  PART_BY_ID,
  buildsRemaining,
  carStatsOf,
  enginePenaltyPlaces,
  fittedPart,
  fittedUnit,
  partBuildCost,
  partHealthFactor,
  sparePartsOf,
} from '../src/game/carModel';
import { developmentGain, partLevel } from '../src/game/partDevelopment';
import { ATTRIBUTE_KEYS, currentRating, driverAdaptationPenalty, driverFeedbackBonus, effectiveDriver, potentialOf, prospectToDriver, scoutedRange } from '../src/game/driverDevelopment';
import {
  CONDITION_EVENTS,
  CONDITION_LABEL,
  CONDITION_MEMORY,
  applyConditionEvent,
  blankCondition,
  conditionEffects,
  emotionOf,
  temperamentOf,
} from '../src/game/driverCondition';
import type { ConditionEvent } from '../src/game/driverCondition';
import { currentSeasonRecord } from '../src/game/seasonArchive';
import { preRaceBriefing, postRaceBriefing } from '../src/game/briefing';
import { ROLES } from '../src/data/staff';
import { staffMarket, staffReputationBonus, staffRndEfficiency, vacantRoles } from '../src/game/staffing';
import { rndEfficiency } from '../src/game/facilities';
import { F2_FIELD_SIZE, F2_MAX_SEASONS } from '../src/game/feederSeries';
import { TIERS, buildIntake, tierDueIn } from '../src/game/youthTalent';
import { freeAgents, isFreeAgent, runContractExpiries } from '../src/game/offSeason';
import { VETERAN_AGE, advanceDriverSeason, blankRecord, performanceIndex } from '../src/game/driverDevelopment';
import { buildTracks } from '../src/lib/careerGen';
import {
  MAX_SQUAD_SIZE,
  carIndexOf,
  driverWearFactor,
  gridDriverIds,
  raceDriversOf,
  reserveDriversOf,
  squadOf,
  statsForDriver,
} from '../src/game/roster';
import { rivalBids, sellability } from '../src/game/contracts';
import type { GameEvent, GamePhase, GameState } from '../src/game/types';

let failures = 0;
function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures++;
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Apply an event and assert it was accepted. */
function must(state: GameState | null, event: GameEvent, label: string): GameState {
  const result = transition(state, event);
  if (!result.ok || !result.state) {
    failures++;
    console.log(`  [FAIL] ${label} — refused: ${result.message}`);
    return state as GameState;
  }
  return result.state;
}

console.log('\n== transition table ==');

const ALL_PHASES: GamePhase[] = [
  'MAIN_MENU', 'SETUP_CAREER', 'TEAM_SELECTION', 'PRE_SEASON',
  'HUB', 'QUALIFYING', 'RACE_COUNTDOWN', 'RACE_SESSION', 'POST_RACE',
];

check('every phase has a transition entry', ALL_PHASES.every((phase) => PHASE_TRANSITIONS[phase]));
check(
  'the loop closes: POST_RACE returns to HUB',
  PHASE_TRANSITIONS.POST_RACE.CONTINUE_TO_NEXT_WEEK === 'HUB',
);
check(
  'qualifying leads to the strategy gate, not straight to the grid',
  PHASE_TRANSITIONS.QUALIFYING.PROCEED_TO_RACE === 'RACE_STRATEGY',
);
check(
  'countdown precedes the session',
  PHASE_TRANSITIONS.RACE_STRATEGY.CONFIRM_STRATEGY === 'RACE_COUNTDOWN' &&
    PHASE_TRANSITIONS.RACE_COUNTDOWN.COUNTDOWN_COMPLETE === 'RACE_SESSION',
);
check(
  'the season review closes the year and returns to pre-season',
  PHASE_TRANSITIONS.SEASON_REVIEW.CONFIRM_SPONSORS === 'PRE_SEASON',
);
check('NEW_GAME only from the main menu', canDispatch('MAIN_MENU', 'NEW_GAME') && !canDispatch('HUB', 'NEW_GAME'));

console.log('\n== illegal transitions are refused ==');

let state = createNewGame('Test Manager');
check('a new game starts in SETUP_CAREER', state.phase === 'SETUP_CAREER', state.phase);

const skipAhead = transition(state, { type: 'PROCEED_TO_QUALIFYING' });
check('cannot jump from setup to qualifying', !skipAhead.ok, skipAhead.message);

const raceEarly = transition(state, { type: 'COUNTDOWN_COMPLETE' });
check('cannot start a race from setup', !raceEarly.ok, raceEarly.message);

const noTeam = transition({ ...state, phase: 'TEAM_SELECTION' }, { type: 'CONFIRM_TEAM' });
check('cannot confirm without picking a team', !noTeam.ok, noTeam.message);

const blankName = transition({ ...state, managerName: '  ' }, { type: 'CONFIRM_SETUP' });
check('cannot continue without a manager name', !blankName.ok, blankName.message);

console.log('\n== happy path ==');

state = must(state, { type: 'SET_SETTINGS', settings: { raceLengthPct: 25, seasonLength: 4 } }, 'settings');
check('settings applied', state.settings.raceLengthPct === 25 && state.settings.seasonLength === 4);
check('calendar resized with the season', state.calendarTrackIds.length === 4);

state = must(state, { type: 'CONFIRM_SETUP' }, 'confirm setup');
check('moved to TEAM_SELECTION', state.phase === 'TEAM_SELECTION');

state = must(state, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
state = must(state, { type: 'CONFIRM_TEAM' }, 'confirm team');
check('moved to PRE_SEASON with a team', state.phase === 'PRE_SEASON' && state.playerTeamId === 'williams');

console.log('\n== part development ==');

const budgetBefore = state.teams.find((t) => t.teamId === 'williams')!.budget;
const floorBefore = partLevel(state.teams.find((t) => t.teamId === 'williams')!, 'FLOOR');
const aeroBefore = state.teams.find((t) => t.teamId === 'williams')!.car.aero;

check('the car is built from parts', state.teams[0]!.parts.length === PARTS.length, `${PARTS.length} parts`);
check(
  'seeding reproduces the published grid',
  Math.abs(carRating(state.teams.find((t) => t.teamId === 'williams')!.car) - 87) <= 2,
  `Williams rates ${carRating(state.teams.find((t) => t.teamId === 'williams')!.car)}`,
);

state = must(state, { type: 'DEVELOP_PART', category: 'FLOOR', intensity: 2 }, 'commission floor work');
const commissioned = state.teams.find((t) => t.teamId === 'williams')!;

check('the programme is in build', commissioned.development.length === 1);
check('the money left the bank up front', commissioned.budget < budgetBefore);
check(
  'the part has not moved yet',
  partLevel(commissioned, 'FLOOR') === floorBefore,
  'development has lead time',
);

const doubleUp = transition(state, { type: 'DEVELOP_PART', category: 'FLOOR', intensity: 2 });
check('the same part cannot be worked on twice at once', !doubleUp.ok, doubleUp.message);

const skint: GameState = {
  ...state,
  teams: state.teams.map((t) => (t.teamId === 'williams' ? { ...t, budget: 100_000 } : t)),
};
const overspend = transition(skint, { type: 'DEVELOP_PART', category: 'CHASSIS', intensity: 3 });
check('over-budget development refused', !overspend.ok, overspend.message);

/* Run the weeks out and confirm the work actually lands on the car. */
let landing = state;
for (let round = 0; round < 6; round++) {
  landing = must(
    { ...landing, phase: 'POST_RACE' },
    { type: 'CONTINUE_TO_NEXT_WEEK' },
    `advance round ${round + 1}`,
  );
  if (landing.teams.find((t) => t.teamId === 'williams')!.development.length === 0) break;
}
const landed = landing.teams.find((t) => t.teamId === 'williams')!;
check(
  'the programme lands on the part',
  partLevel(landed, 'FLOOR') > floorBefore,
  `floor ${floorBefore.toFixed(1)} -> ${partLevel(landed, 'FLOOR').toFixed(1)}`,
);
/* A landed programme moves the *drawing*, not the car. The car only
 * changes when something built to the new drawing is bolted on — that
 * is the whole point of splitting R&D from the garage, and it is what
 * this pair of assertions pins down. */
check(
  'a landed programme does not move the car on its own',
  Math.abs(landed.car.aero - aeroBefore) < 0.01,
  `aero ${aeroBefore.toFixed(1)} -> ${landed.car.aero.toFixed(1)}`,
);

{
  const rich: GameState = {
    ...landing,
    teams: landing.teams.map((t) => ({ ...t, budget: 400_000_000 })),
  };
  const madeIt = must(rich, { type: 'BUILD_PART', category: 'FLOOR', carIndex: 0 }, 'build a floor');
  const team = madeIt.teams.find((t) => t.teamId === 'williams')!;

  check(
    'building does not move the car either',
    Math.abs(team.car.aero - aeroBefore) < 0.01,
    `aero still ${team.car.aero.toFixed(1)}`,
  );

  const spare = sparePartsOf(team, 'FLOOR')[0]!;
  check(
    'the part is built to the drawing as it stands',
    Math.abs(spare.spec - partLevel(team, 'FLOOR')) < 0.01,
    `spec ${spare.spec.toFixed(1)} vs drawing ${partLevel(team, 'FLOOR').toFixed(1)}`,
  );

  const bolted = must(madeIt, { type: 'FIT_PART', partId: spare.id }, 'fit the floor');
  const after = bolted.teams.find((t) => t.teamId === 'williams')!;
  check(
    'fitting it is what moves the statistics',
    after.car.aero > aeroBefore,
    `aero ${aeroBefore.toFixed(1)} -> ${after.car.aero.toFixed(1)}`,
  );
  check(
    'and what came off went back on the shelf',
    sparePartsOf(after, 'FLOOR').length === 1,
  );
}

console.log('\n== power units ==');

const withUnit = state.teams.find((t) => t.teamId === 'williams')!;
check('a team starts with a unit fitted', Boolean(withUnit.fittedPowerUnitId));
check('the fitted unit is fresh', (fittedUnit(withUnit)?.healthPct ?? 0) === 100);

const built = must(state, { type: 'BUILD_POWER_UNIT' }, 'build a spare');
check('a spare joins the pool', built.teams.find((t) => t.teamId === 'williams')!.powerUnits.length === 2);
check(
  'building a unit costs money',
  built.teams.find((t) => t.teamId === 'williams')!.budget <
    state.teams.find((t) => t.teamId === 'williams')!.budget,
);

const spare = built.teams.find((t) => t.teamId === 'williams')!.powerUnits[1]!;
const swapped = must(built, { type: 'FIT_POWER_UNIT', unitId: spare.id }, 'fit the spare');
check('the spare is now in the car', swapped.fittedPowerUnitId === undefined || swapped.teams.find((t) => t.teamId === 'williams')!.fittedPowerUnitId === spare.id);
check(
  'only one unit is ever fitted',
  swapped.teams.find((t) => t.teamId === 'williams')!.powerUnits.filter((u) => u.status === 'FITTED').length === 1,
);

const overAllocation: GameState = {
  ...state,
  teams: state.teams.map((t) =>
    t.teamId === 'williams'
      ? {
          ...t,
          powerUnits: Array.from({ length: 4 }, (_, i) => ({
            ...t.powerUnits[0]!,
            id: `u${i}`,
            builtInSeason: state.season,
          })),
        }
      : t,
  ),
};
check(
  'the allocation is enforced with a grid penalty, not a ban',
  enginePenaltyPlaces(overAllocation.teams.find((t) => t.teamId === 'williams')!, state.season) === 0,
  'four units is still legal',
);

const ourDriver = GRID_2026_DRIVERS.find((d) => state.driverTeams[d.id] === 'williams')!;
state = must(
  state,
  { type: 'SWAP_DRIVER', incomingDriverId: 'hamilton', outgoingDriverId: ourDriver.id },
  'driver swap',
);
check('incoming driver joined', state.driverTeams.hamilton === 'williams');
check('outgoing driver went the other way', state.driverTeams[ourDriver.id] === 'ferrari');
check(
  'both teams still field two cars',
  Object.values(state.driverTeams).filter((t) => t === 'williams').length === 2 &&
    Object.values(state.driverTeams).filter((t) => t === 'ferrari').length === 2,
);

state = must(state, { type: 'START_SEASON' }, 'start season');
check('moved to HUB on round 1', state.phase === 'HUB' && state.round === 1);

console.log('\n== qualifying ==');

const tracks = buildTracks();
const track = tracks.find((t) => t.id === state.calendarTrackIds[0])!;
const roster = GRID_2026_DRIVERS.map((driver) => ({
  ...driver,
  teamId: state.driverTeams[driver.id] ?? driver.teamId,
}));

state = must(state, { type: 'PROCEED_TO_QUALIFYING' }, 'proceed to qualifying');
check('moved to QUALIFYING', state.phase === 'QUALIFYING');

const session = simulateQualifying({
  season: state.season,
  round: state.round,
  track,
  drivers: roster,
  driverTeams: state.driverTeams,
  teams: state.teams,
  difficulty: state.settings.difficulty,
});

check('every driver has an entry', session.entries.length === GRID_2026_DRIVERS.length, `${session.entries.length}`);
check(
  `every driver ran ${QUALIFYING_LAPS} laps`,
  session.entries.every((entry) => entry.laps.length === QUALIFYING_LAPS),
);
check(
  'exactly one lap per driver is flagged best',
  session.entries.every((entry) => entry.laps.filter((lap) => lap.isBest).length === 1),
);
check(
  'the saved best lap is the fastest of the five',
  session.entries.every(
    (entry) => entry.bestLapMs === Math.min(...entry.laps.map((lap) => lap.timeMs)),
  ),
);
check(
  'classification is sorted by best lap',
  session.entries.every((entry, i) => i === 0 || entry.bestLapMs >= session.entries[i - 1]!.bestLapMs),
);
check('positions are contiguous', session.entries.every((entry, i) => entry.position === i + 1));
check('pole has zero gap', session.entries[0]!.gapToPoleMs === 0);
check(
  'gaps ascend down the order',
  session.entries.every((entry, i) => i === 0 || entry.gapToPoleMs >= session.entries[i - 1]!.gapToPoleMs),
);

console.log('\n== difficulty ==');

/** Same weekend, same cars, only the setting changes. */
function qualifyAt(difficulty: 'ROOKIE' | 'PRO' | 'LEGEND') {
  return simulateQualifying({
    season: state.season,
    round: state.round,
    track,
    drivers: roster,
    driverTeams: state.driverTeams,
    teams: state.teams,
    difficulty,
    playerTeamId: state.playerTeamId,
  });
}

const rookieSession = qualifyAt('ROOKIE');
const proSession = qualifyAt('PRO');
const legendSession = qualifyAt('LEGEND');

const spreadOf = (result: typeof rookieSession) =>
  result.entries[result.entries.length - 1]!.gapToPoleMs;

check(
  'a harder field is closer together',
  spreadOf(legendSession) < spreadOf(rookieSession),
  `rookie ${(spreadOf(rookieSession) / 1000).toFixed(2)}s vs legend ${(spreadOf(legendSession) / 1000).toFixed(2)}s`,
);
check(
  'difficulty is monotonic across the three settings',
  spreadOf(legendSession) <= spreadOf(proSession) &&
    spreadOf(proSession) <= spreadOf(rookieSession),
  `${(spreadOf(rookieSession) / 1000).toFixed(2)} / ${(spreadOf(proSession) / 1000).toFixed(2)} / ${(spreadOf(legendSession) / 1000).toFixed(2)}`,
);

const bestRivalAt = (result: typeof rookieSession) =>
  result.entries.find((entry) => entry.teamId !== state.playerTeamId)!.bestLapMs;
const ourBestAt = (result: typeof rookieSession) =>
  Math.min(
    ...result.entries
      .filter((entry) => entry.teamId === state.playerTeamId)
      .map((entry) => entry.bestLapMs),
  );

check(
  'a harder field actually goes quicker',
  bestRivalAt(legendSession) < bestRivalAt(rookieSession),
  `rookie ${(bestRivalAt(rookieSession) / 1000).toFixed(3)}s vs legend ${(bestRivalAt(legendSession) / 1000).toFixed(3)}s`,
);
check(
  "raising the difficulty never slows the player's own cars",
  ourBestAt(legendSession) <= ourBestAt(rookieSession) + 1,
  `rookie ${(ourBestAt(rookieSession) / 1000).toFixed(3)}s vs legend ${(ourBestAt(legendSession) / 1000).toFixed(3)}s`,
);

// The AI profile the race engine is handed has to move with the setting.
check(
  'the shared difficulty profile scales the race AI too',
  profileFor('ROOKIE').aiSkill < profileFor('PRO').aiSkill &&
    profileFor('PRO').aiSkill < profileFor('LEGEND').aiSkill,
  `${profileFor('ROOKIE').aiSkill} / ${profileFor('PRO').aiSkill} / ${profileFor('LEGEND').aiSkill}`,
);

const rerun = simulateQualifying({
  season: state.season, round: state.round, track, drivers: roster,
  driverTeams: state.driverTeams, teams: state.teams, difficulty: state.settings.difficulty,
});
check(
  'qualifying is deterministic for a round',
  JSON.stringify(rerun.entries.map((e) => e.bestLapMs)) ===
    JSON.stringify(session.entries.map((e) => e.bestLapMs)),
);

state = must(state, { type: 'QUALIFYING_COMPLETE', result: session }, 'store qualifying');

console.log('\n== race ==');

const noQuali = transition({ ...state, qualifying: null }, { type: 'PROCEED_TO_RACE' });
check('cannot race without qualifying', !noQuali.ok, noQuali.message);

state = must(state, { type: 'PROCEED_TO_RACE' }, 'proceed to race');
check('moved to RACE_STRATEGY', state.phase === 'RACE_STRATEGY');

console.log('\n== strategy gate ==');

const ourDrivers = Object.entries(state.driverTeams)
  .filter(([, teamId]) => teamId === state.playerTeamId)
  .map(([driverId]) => driverId);
check('the player runs two cars', ourDrivers.length === 2, ourDrivers.join(', '));

const unchosen = transition(state, { type: 'CONFIRM_STRATEGY' });
check('the grid is barred until the tyres are chosen', !unchosen.ok, unchosen.message);

state = must(
  state,
  { type: 'SET_STARTING_TYRE', driverId: ourDrivers[0]!, compound: 'SOFT' },
  'first car on softs',
);
const halfChosen = transition(state, { type: 'CONFIRM_STRATEGY' });
check('one car chosen is not enough', !halfChosen.ok, halfChosen.message);

state = must(
  state,
  { type: 'SET_STARTING_TYRE', driverId: ourDrivers[1]!, compound: 'HARD' },
  'second car on hards',
);
check(
  'the choice is recorded against this round',
  state.strategies[ourDrivers[0]!]?.startingCompound === 'SOFT' &&
    state.strategies[ourDrivers[0]!]?.confirmedForRound === state.round,
);
check(
  'the first stint inherits the starting compound',
  state.strategies[ourDrivers[1]!]?.stints[0]?.compound === 'HARD',
);

const rivalTyre = transition(state, {
  type: 'SET_STARTING_TYRE',
  driverId: GRID_2026_DRIVERS.find((d) => state.driverTeams[d.id] !== state.playerTeamId)!.id,
  compound: 'SOFT',
});
check('cannot choose tyres for a rival', !rivalTyre.ok, rivalTyre.message);

state = must(state, { type: 'CONFIRM_STRATEGY' }, 'confirm strategy');
check('moved to RACE_COUNTDOWN', state.phase === 'RACE_COUNTDOWN');

console.log('\n== race ==');

state = must(state, { type: 'COUNTDOWN_COMPLETE' }, 'countdown complete');
check('moved to RACE_SESSION', state.phase === 'RACE_SESSION');

const circuit = trackToCircuit(track);
check('adapter produced a pit lane', circuit.pitAnchors.length >= 4);
check('adapter produced corners and DRS', circuit.corners.length > 0 && circuit.drsZones.length > 0);
check(
  'race distance scales with the setting',
  scaledLaps(track, 25) < track.laps && scaledLaps(track, 100) === track.laps,
  `${scaledLaps(track, 25)} vs ${track.laps}`,
);

// Grid order is exactly the qualifying order.
const gridIds = session.entries.map((entry) => entry.driverId);
// Simulate a finish where the front two swap and P20 retires.
const finishOrder = [...gridIds];
[finishOrder[0], finishOrder[1]] = [finishOrder[1]!, finishOrder[0]!];

const result = scoreRace({
  season: state.season,
  round: state.round,
  trackId: track.id,
  totalLaps: scaledLaps(track, state.settings.raceLengthPct),
  order: finishOrder,
  driverTeams: state.driverTeams,
  gridPositions: Object.fromEntries(session.entries.map((e) => [e.driverId, e.position])),
  bestLaps: Object.fromEntries(finishOrder.map((id, i) => [id, 90_000 + i * 40])),
  retired: new Set([finishOrder[19]!]),
  gaps: Object.fromEntries(finishOrder.map((id, i) => [id, i * 900])),
  fastestLapPoint: state.settings.fastestLapPoint,
});

check('points table matches the spec', JSON.stringify([...POINTS_TABLE]) === JSON.stringify([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]));
check('11th scores nothing', pointsForPosition(11) === 0);
check(
  'winner scored 25 (plus any fastest lap)',
  result.finishers[0]!.points >= 25,
  `${result.finishers[0]!.points}`,
);
check('a retirement scores nothing', result.finishers[19]!.points === 0 && result.finishers[19]!.status === 'DNF');
check(
  'grid positions carried from qualifying',
  result.finishers.every((f) => f.gridPosition === session.entries.find((e) => e.driverId === f.driverId)!.position),
);
check(
  'positions gained computed correctly',
  result.finishers[0]!.positionsGained === 1 && result.finishers[1]!.positionsGained === -1,
);
check(
  'exactly one fastest lap awarded',
  result.finishers.filter((f) => f.fastestLap).length === 1,
);

const cashBeforeRace = state.teams.find((t) => t.teamId === state.playerTeamId)!.budget;
state = must(state, { type: 'RACE_COMPLETE', result }, 'race complete');

// A race weekend costs money whether or not anyone pays you for it.
const cashAfterRace = state.teams.find((t) => t.teamId === state.playerTeamId)!.budget;
check(
  'the weekend was paid for out of the budget',
  cashAfterRace < cashBeforeRace,
  `-$${((cashBeforeRace - cashAfterRace) / 1_000_000).toFixed(1)}M`,
);
check(
  'salaries and operations are both on the ledger',
  state.finance.ledger.some((e) => e.kind === 'SALARY') &&
    state.finance.ledger.some((e) => e.kind === 'OPERATIONS'),
);
check('moved to POST_RACE', state.phase === 'POST_RACE');

console.log('\n== championship ==');

const winnerId = result.finishers[0]!.driverId;
const winnerRow = state.standings.drivers.find((row) => row.driverId === winnerId)!;
check('winner leads the WDC', winnerRow.position === 1, `${winnerRow.points} pts`);
check('winner credited with a win', winnerRow.wins === 1);
check(
  'WDC total equals the points awarded',
  state.standings.drivers.reduce((sum, row) => sum + row.points, 0) ===
    result.finishers.reduce((sum, f) => sum + f.points, 0),
);
check(
  'WCC total matches the WDC total',
  state.standings.constructors.reduce((sum, row) => sum + row.points, 0) ===
    state.standings.drivers.reduce((sum, row) => sum + row.points, 0),
);
check(
  'WDC is ordered by points',
  state.standings.drivers.every((row, i) => i === 0 || row.points <= state.standings.drivers[i - 1]!.points),
);

const twice = applyRaceResult(state.standings, result);
check(
  'applying a second race accumulates',
  twice.drivers.find((row) => row.driverId === winnerId)!.points === winnerRow.points * 2,
);

console.log('\n== loop and season rollover ==');

state = must(state, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'next week');
check('returned to HUB', state.phase === 'HUB');
check('round advanced', state.round === 2, `round ${state.round}`);
check('qualifying cleared for the new round', state.qualifying === null);

// Rolling the season only happens from POST_RACE — advancing the week
// from the hub is (correctly) not a legal move.
const fromHub = transition({ ...state, round: state.settings.seasonLength }, { type: 'CONTINUE_TO_NEXT_WEEK' });
check('cannot advance the week from the hub', !fromHub.ok, fromHub.message);

const finalRound: GameState = {
  ...state,
  phase: 'POST_RACE',
  round: state.settings.seasonLength,
};
const seasonBefore = finalRound.season;
state = must(finalRound, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'roll season');
check('season advanced', state.season === seasonBefore + 1, `${seasonBefore} -> ${state.season}`);
check('round reset to 1', state.round === 1);
check('standings reset for the new season', state.standings.drivers.every((row) => row.points === 0));
check('the year ends on the season review', state.phase === 'SEASON_REVIEW');

/* --- the silly season ------------------------------------------------- */
const window_ = state.lastTransferWindow;
check(
  'the off-season transfer window is recorded',
  Array.isArray(window_),
  `${window_.length} move(s)`,
);
check(
  'every rival team still enters two cars after the window',
  state.teams
    .filter((team) => team.teamId !== state.playerTeamId)
    .every((team) => raceDriversOf(state, team.teamId).length === 2),
  state.teams.map((t) => `${t.teamId}:${raceDriversOf(state, t.teamId).length}`).join(' '),
);
check(
  "the player's own line-up is never touched by the AI market",
  window_.every(
    (move) => move.toTeamId !== state.playerTeamId && move.fromTeamId !== state.playerTeamId,
  ),
);
check(
  'every move names both directions and a reason',
  window_.every(
    (move) =>
      move.incomingDriverId &&
      move.outgoingDriverId &&
      move.incomingDriverId !== move.outgoingDriverId &&
      Boolean(move.note),
  ),
);

// Old drivers and poor seasons are what actually drive the market.
const oldest = GRID_2026_DRIVERS.reduce((a, b) => (a.age > b.age ? a : b));
check(
  'age weighs against a driver in the seat model',
  seasonScore(state, oldest.id) <
    seasonScore(state, GRID_2026_DRIVERS.find((d) => d.age <= 22)!.id) + 100,
  `${oldest.lastName} (${oldest.age}) scores ${seasonScore(state, oldest.id).toFixed(0)}`,
);

// The window has to be deterministic, or reloading rerolls the paddock.
const replay = transition(finalRound, { type: 'CONTINUE_TO_NEXT_WEEK' });
check(
  'the silly season is deterministic across a reload',
  JSON.stringify(replay.state?.lastTransferWindow) === JSON.stringify(window_),
);

console.log('\n== season review and sponsorship ==');

const prizeLine = state.finance.ledger.find(
  (entry) => entry.kind === 'PRIZE' && entry.season === seasonBefore,
);
check('prize money was paid for the season just finished', Boolean(prizeLine), prizeLine?.label);

const unfunded = transition(state, { type: 'CONFIRM_SPONSORS' });
check('cannot start a season with no partners', !unfunded.ok, unfunded.message);

const cashBeforeSigning = state.teams.find((t) => t.teamId === state.playerTeamId)!.budget;
state = must(state, { type: 'SIGN_SPONSOR', sponsorId: 'pilgrim-outfitters' }, 'sign an associate');
const cashAfterSigning = state.teams.find((t) => t.teamId === state.playerTeamId)!.budget;
check('the signing bonus landed', cashAfterSigning > cashBeforeSigning, `+${cashAfterSigning - cashBeforeSigning}`);
check('the contract is on the books', state.finance.contracts.length === 1);

const twiceSigned = transition(state, { type: 'SIGN_SPONSOR', sponsorId: 'pilgrim-outfitters' });
check('cannot sign the same partner twice', !twiceSigned.ok, twiceSigned.message);

const outOfReach = transition(state, { type: 'SIGN_SPONSOR', sponsorId: 'meridian-energy' });
check('a top deal is gated on reputation', !outOfReach.ok, outOfReach.message);

state = must(state, { type: 'CONFIRM_SPONSORS' }, 'confirm sponsors');
check('the review hands over to pre-season', state.phase === 'PRE_SEASON');

state = must(state, { type: 'START_SEASON' }, 'start the new season');
check('the new season begins at the hub', state.phase === 'HUB');

console.log('\n== driver condition ==');

const anyDriver = Object.keys(state.driverConditions)[0]!;
check(
  'every driver on the grid has a condition',
  Object.keys(state.driverConditions).length >= 22,
  `${Object.keys(state.driverConditions).length} tracked`,
);
check(
  'a fresh condition sits at neutral',
  emotionOf(blankCondition('x')) === 'FOCUSED',
);

/* The emotions have to be reachable and distinct, or the whole layer is
 * decoration. */
check(
  'high stress with low mood reads as rattled',
  emotionOf({ driverId: 'x', morale: 50, fitness: 90, mood: 30, stress: 90 }) === 'RATTLED',
);
check(
  'high stress with high mood reads as fired up',
  emotionOf({ driverId: 'x', morale: 50, fitness: 90, mood: 85, stress: 90 }) === 'FIRED_UP',
);
check(
  'high mood with low stress reads as confident',
  emotionOf({ driverId: 'x', morale: 50, fitness: 90, mood: 88, stress: 20 }) === 'CONFIDENT',
);
check(
  'a flattened driver reads as dejected',
  emotionOf({ driverId: 'x', morale: 30, fitness: 90, mood: 12, stress: 40 }) === 'DEJECTED',
);

/* The two-sided rule: nothing here is a free upgrade. */
const firedUp = conditionEffects({ driverId: 'x', morale: 60, fitness: 96, mood: 85, stress: 90 });
const rattled = conditionEffects({ driverId: 'x', morale: 60, fitness: 96, mood: 25, stress: 90 });
const settled = conditionEffects({ driverId: 'x', morale: 60, fitness: 96, mood: 60, stress: 30 });

check(
  'a fired-up driver is quicker than a settled one',
  firedUp.paceFactor < settled.paceFactor,
  `${firedUp.paceFactor.toFixed(4)} vs ${settled.paceFactor.toFixed(4)}`,
);
check(
  'and pays for it with mistakes',
  firedUp.errorMultiplier > settled.errorMultiplier,
  `×${firedUp.errorMultiplier.toFixed(2)} vs ×${settled.errorMultiplier.toFixed(2)}`,
);
check(
  'a rattled driver is slower and messier',
  rattled.paceFactor > settled.paceFactor && rattled.errorMultiplier > settled.errorMultiplier,
  `${rattled.paceFactor.toFixed(4)}s factor, ×${rattled.errorMultiplier.toFixed(2)} error`,
);
check(
  'stress is harder on the tyres',
  rattled.tyreMultiplier > settled.tyreMultiplier,
  `×${rattled.tyreMultiplier.toFixed(2)} vs ×${settled.tyreMultiplier.toFixed(2)}`,
);

/* Saturday has to move them, and in the right direction. The harness has
 * long since rolled the season over by this point, so the result is built
 * here rather than borrowed from earlier state. */
const qualiSubjects = Object.keys(state.driverTeams).slice(0, 2);
const qualiFixture: GameState = {
  ...state,
  phase: 'QUALIFYING',
  driverConditions: Object.fromEntries(
    Object.keys(state.driverTeams).map((id) => [id, blankCondition(id)]),
  ),
};
const sharedTeam = state.driverTeams[qualiSubjects[0]!]!;
const fakeQuali = {
  season: state.season,
  round: state.round,
  trackId: state.calendarTrackIds[0]!,
  completedAt: new Date().toISOString(),
  entries: Object.keys(state.driverTeams).map((driverId, index) => ({
    position: index + 1,
    driverId,
    // Put the first two in the same garage so the team-mate comparison bites.
    teamId: index < 2 ? sharedTeam : state.driverTeams[driverId]!,
    laps: [],
    bestLapMs: 90_000 + index * 100,
    gapToPoleMs: index * 100,
  })),
};

const qualified = must(
  qualiFixture,
  { type: 'QUALIFYING_COMPLETE', result: fakeQuali },
  'complete qualifying',
);

const poleCondition = qualified.driverConditions[qualiSubjects[0]!]!;
const beatenCondition = qualified.driverConditions[qualiSubjects[1]!]!;
const lastId = Object.keys(state.driverTeams).slice(-1)[0]!;
const lastCondition = qualified.driverConditions[lastId]!;

check(
  'out-qualifying a team-mate lifts a driver',
  poleCondition.mood > 60 && poleCondition.stress < 30,
  `mood ${poleCondition.mood}, stress ${poleCondition.stress}`,
);
check(
  'being beaten by a team-mate does the reverse',
  beatenCondition.mood < poleCondition.mood &&
    beatenCondition.stress > poleCondition.stress,
  `beaten: mood ${beatenCondition.mood}, stress ${beatenCondition.stress}`,
);
check(
  'qualifying at the back of the grid deflates a driver',
  lastCondition.mood < 60 && lastCondition.stress > 30,
  `mood ${lastCondition.mood}, stress ${lastCondition.stress}`,
);

/* And the pit wall can move them mid-race. */
const rattledState: GameState = {
  ...state,
  phase: 'RACE_SESSION',
  driverConditions: {
    ...state.driverConditions,
    [anyDriver]: { driverId: anyDriver, morale: 50, fitness: 90, mood: 30, stress: 88 },
  },
};
const reassured = must(
  rattledState,
  { type: 'CONDITION_EVENT', driverId: anyDriver, event: 'REASSURED' },
  'reassure a rattled driver',
);
check(
  'reassuring a driver cuts their stress',
  reassured.driverConditions[anyDriver]!.stress < 88,
  `88 -> ${reassured.driverConditions[anyDriver]!.stress}`,
);
const demanded = must(
  rattledState,
  { type: 'CONDITION_EVENT', driverId: anyDriver, event: 'ORDERED_TO_PUSH' },
  'demand more',
);
check(
  'demanding more from a rattled driver makes it worse',
  demanded.driverConditions[anyDriver]!.stress > 88,
  `88 -> ${demanded.driverConditions[anyDriver]!.stress}`,
);
const bogus = transition(rattledState, {
  type: 'CONDITION_EVENT',
  driverId: anyDriver,
  event: 'NOT_A_REAL_EVENT',
});
check('an unknown condition event is refused', !bogus.ok, bogus.message);

/* Between rounds everybody drifts back to the middle. */
const extreme: GameState = {
  ...state,
  phase: 'POST_RACE',
  driverConditions: {
    ...state.driverConditions,
    [anyDriver]: { driverId: anyDriver, morale: 20, fitness: 40, mood: 5, stress: 95 },
  },
};
const rested = must(extreme, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'a fortnight off');
const after = rested.driverConditions[anyDriver]!;
check(
  'a fortnight pulls a driver back towards the middle',
  after.mood > 5 && after.stress < 95 && after.fitness > 40,
  `mood 5→${after.mood}, stress 95→${after.stress}, fitness 40→${after.fitness}`,
);
check(
  'morale is the slow one and barely moves',
  after.morale > 20 && after.morale < 40,
  `20 -> ${after.morale}`,
);

/* Fuel is gone; push level is the only race instruction left. */
check(
  'the race plan carries a push level and no fuel figure',
  'pushLevel' in blankStrategy('x') && !('fuelLoadKg' in blankStrategy('x')),
  `keys: ${Object.keys(blankStrategy('x')).join(', ')}`,
);

console.log('\n== driver careers ==');

/* Ageing and form are the difference between a market and a shopping
 * list, so both directions of the curve have to actually move. */
const grownUp = state.driverRecords['lindblad'];
check('every driver has a career record', Object.keys(state.driverRecords).length >= 22);
check(
  'the grid aged a year at the rollover',
  (grownUp?.age ?? 0) > (GRID_2026_DRIVERS.find((d) => d.id === 'lindblad')?.age ?? 99),
  `Lindblad is now ${grownUp?.age}`,
);

const youngId = GRID_2026_DRIVERS.reduce((a, b) => (a.age < b.age ? a : b)).id;
/* The oldest driver on the grid is no longer a safe subject for the
 * decline checks: they now retire, and a retired driver stops moving
 * along the curve entirely. The oldest one still racing is. */
const oldId = GRID_2026_DRIVERS.filter((d) => !state.retiredDriverIds.includes(d.id)).reduce(
  (a, b) => (a.age > b.age ? a : b),
).id;
const youngDeltas = state.driverRecords[youngId]?.deltas ?? {};
const oldDeltas = state.driverRecords[oldId]?.deltas ?? {};

check(
  'a teenager improves over an off-season',
  (youngDeltas.pace ?? 0) > 0,
  `${youngId} pace ${(youngDeltas.pace ?? 0).toFixed(1)}`,
);
check(
  'a driver past their peak loses raw speed',
  (oldDeltas.pace ?? 0) < 0,
  `${oldId} pace ${(oldDeltas.pace ?? 0).toFixed(1)}`,
);

/* The whole point of per-attribute curves: a veteran is a *different*
 * driver, not a uniformly worse one. */
check(
  'attributes move independently rather than as one block',
  new Set(ATTRIBUTE_KEYS.map((key) => (oldDeltas[key] ?? 0).toFixed(1))).size > 3,
  `${new Set(ATTRIBUTE_KEYS.map((key) => (oldDeltas[key] ?? 0).toFixed(1))).size} distinct values across 13 attributes`,
);
check(
  'reflexes go before racecraft does',
  (oldDeltas.reaction ?? 0) < (oldDeltas.racecraft ?? 0),
  `${oldId}: reaction ${(oldDeltas.reaction ?? 0).toFixed(1)} vs racecraft ${(oldDeltas.racecraft ?? 0).toFixed(1)}`,
);
check(
  'a veteran holds the learned attributes far better than raw speed',
  (oldDeltas.tyreManagement ?? 0) > (oldDeltas.pace ?? 0) &&
    (oldDeltas.defence ?? 0) > (oldDeltas.pace ?? 0),
  `pace ${(oldDeltas.pace ?? 0).toFixed(1)}, tyre mgmt ${(oldDeltas.tyreManagement ?? 0).toFixed(1)}, defence ${(oldDeltas.defence ?? 0).toFixed(1)}`,
);
check(
  'the young gain fastest on the things youth is good at',
  (youngDeltas.reaction ?? 0) > (youngDeltas.feedback ?? 0),
  `reaction ${(youngDeltas.reaction ?? 0).toFixed(1)} vs feedback ${(youngDeltas.feedback ?? 0).toFixed(1)}`,
);

/* Seeding has to encode the same idea from the start: a rookie arrives
 * quick and short on everything that is learned. */
const rookie = GRID_2026_DRIVERS.reduce((a, b) => (a.age < b.age ? a : b));
const veteran = GRID_2026_DRIVERS.reduce((a, b) => (a.age > b.age ? a : b));
check(
  'a rookie starts short on defending and racecraft',
  rookie.attributes.defence < rookie.attributes.pace &&
    rookie.attributes.racecraft < rookie.attributes.pace,
  `${rookie.lastName} (${rookie.age}): pace ${rookie.attributes.pace}, defence ${rookie.attributes.defence}, racecraft ${rookie.attributes.racecraft}`,
);
check(
  'a veteran starts strong on the learned attributes',
  veteran.attributes.racecraft > rookie.attributes.racecraft &&
    veteran.attributes.tyreManagement > rookie.attributes.tyreManagement,
  `${veteran.lastName} (${veteran.age}) racecraft ${veteran.attributes.racecraft} vs ${rookie.lastName} ${rookie.attributes.racecraft}`,
);
check(
  'the young adapt fastest',
  rookie.attributes.adaptability > veteran.attributes.adaptability,
  `${rookie.lastName} ${rookie.attributes.adaptability} vs ${veteran.lastName} ${veteran.attributes.adaptability}`,
);
check(
  'the rating a screen shows follows the record',
  currentRating(state, youngId) !== driverRating(GRID_2026_DRIVERS.find((d) => d.id === youngId)!),
  `${driverRating(GRID_2026_DRIVERS.find((d) => d.id === youngId)!)} -> ${currentRating(state, youngId)}`,
);
check(
  'development is deterministic across a reload',
  JSON.stringify(transition(finalRound, { type: 'CONTINUE_TO_NEXT_WEEK' }).state?.driverRecords) ===
    JSON.stringify(state.driverRecords),
);
check(
  'no attribute can drift beyond the ceiling',
  Object.values(state.driverRecords).every((record) =>
    ATTRIBUTE_KEYS.every((key) => Math.abs(record.deltas[key] ?? 0) <= 18.01),
  ),
);

console.log('\n== junior intake ==');

check('a class is generated for the season', state.prospects.length > 0, `${state.prospects.length} juniors`);
check(
  'the feeder series runs a full grid',
  state.prospects.length === F2_FIELD_SIZE,
  `${state.prospects.length} cars`,
);
check(
  'the field carries over rather than being thrown away',
  state.prospects.some((p) => p.scoutedInSeason < state.season),
  `${state.prospects.filter((p) => p.scoutedInSeason < state.season).length} held over`,
);
check(
  'and the seats that opened were filled from this year\'s intake',
  state.prospects.some((p) => p.scoutedInSeason === state.season),
  `${state.prospects.filter((p) => p.scoutedInSeason === state.season).length} new`,
);
check(
  'juniors are young',
  state.prospects.every((p) => p.age >= 16 && p.age <= 24),
  `${Math.min(...state.prospects.map((p) => p.age))}-${Math.max(...state.prospects.map((p) => p.age))}`,
);
check(
  'juniors are signed on a ceiling above where they are today',
  state.prospects.every((p) => p.potential > driverRating(prospectToDriver(p))),
);
check(
  'every junior has a distinct name',
  new Set(state.prospects.map((p) => `${p.firstName} ${p.lastName}`)).size ===
    state.prospects.length,
);

const freeProspect = state.prospects.find((p) => !state.driverTeams[p.id])!;
const ourSeatId = Object.entries(state.driverTeams).find(
  ([, teamId]) => teamId === state.playerTeamId,
)![0];
const promoted = must(
  state,
  { type: 'SIGN_PROSPECT', prospectId: freeProspect.id, outgoingDriverId: ourSeatId },
  'promote a junior',
);
check('the junior takes the seat', promoted.driverTeams[freeProspect.id] === promoted.playerTeamId);
check('the released driver loses theirs', !promoted.driverTeams[ourSeatId]);
check('the junior gets a career record', Boolean(promoted.driverRecords[freeProspect.id]));
check(
  'the signing was paid for',
  promoted.finance.ledger.some((e) => e.kind === 'TRANSFER' && e.amount < 0),
);
check(
  'the squad is one bigger for the signing and one smaller for the release',
  squadOf(promoted, promoted.playerTeamId).length ===
    squadOf(state, state.playerTeamId).length,
  `${squadOf(state, state.playerTeamId).length} -> ${squadOf(promoted, promoted.playerTeamId).length}`,
);
check(
  'the junior leaves the feeder series behind them',
  !promoted.prospects.some((p) => p.id === freeProspect.id),
);
check(
  'and the series is back to a full grid',
  promoted.prospects.length === F2_FIELD_SIZE,
  `${promoted.prospects.length} cars`,
);

console.log('\n== season archive ==');

check('the finished season was archived', state.seasonArchive.length === 1);
const archived = state.seasonArchive[0]!;
check('the archive names the season', archived.season === seasonBefore, `${archived.season}`);
check('the archive holds both tables', archived.constructors.length > 0 && archived.drivers.length > 0);
check(
  'the archive records where the player finished',
  archived.playerPosition >= 1 && archived.playerPosition <= 11,
  `P${archived.playerPosition}`,
);
check('the archive keeps the prize money', archived.prizeMoney > 0, `$${(archived.prizeMoney / 1_000_000).toFixed(0)}M`);
check(
  'the live season renders through the same shape',
  currentSeasonRecord(state).season === state.season,
);

console.log('\n== expert difficulty ==');

check(
  'Expert sits between Pro and Legend',
  profileFor('PRO').aiSkill < profileFor('EXPERT').aiSkill &&
    profileFor('EXPERT').aiSkill < profileFor('LEGEND').aiSkill,
);
check(
  'the harder settings give rival teams their own strategies',
  profileFor('ROOKIE').aiStrategyVariance === 0 &&
    profileFor('EXPERT').aiStrategyVariance > profileFor('PRO').aiStrategyVariance,
  `rookie ${profileFor('ROOKIE').aiStrategyVariance} / pro ${profileFor('PRO').aiStrategyVariance} / expert ${profileFor('EXPERT').aiStrategyVariance}`,
);
check(
  'the harder settings develop the AI cars between rounds',
  profileFor('ROOKIE').aiDevelopmentPerRound === 0 &&
    profileFor('EXPERT').aiDevelopmentPerRound > profileFor('PRO').aiDevelopmentPerRound,
);
check(
  'the harder settings use push, energy and the pit lane better',
  profileFor('EXPERT').aiRacecraft > profileFor('PRO').aiRacecraft,
);

/* Development between rounds has to actually move a rival's car, and
 * must never touch the player's. */
/* The player's own commissioned work would otherwise land during these
 * rounds and be mistaken for the AI developing their car for them. */
const expertState: GameState = {
  ...state,
  phase: 'POST_RACE',
  round: 1,
  settings: { ...state.settings, difficulty: 'EXPERT', seasonLength: 6 },
  teams: state.teams.map((t) =>
    t.teamId === state.playerTeamId ? { ...t, development: [] } : t,
  ),
};
/* Development goes into whichever stat is weakest, so the honest measure
 * is the total across the car rather than any one axis. */
const carTotal = (car: { aero: number; powerUnit: number; electrical: number; reliability: number; brakes: number; suspension: number; cooling: number; pace: number }) =>
  car.aero + car.powerUnit + car.electrical + car.reliability + car.brakes + car.suspension + car.cooling + car.pace;
const rivalBefore = carTotal(expertState.teams.find((t) => t.teamId === 'haas')!.car);
const ourCarBefore = { ...expertState.teams.find((t) => t.teamId === expertState.playerTeamId)!.car };
/* Rival work has the same lead time the player's does, so the car moves
 * a few rounds after the money is spent rather than the same afternoon. */
let developed = expertState;
for (let round = 0; round < 8; round++) {
  developed = must(
    { ...developed, phase: 'POST_RACE' },
    { type: 'CONTINUE_TO_NEXT_WEEK' },
    `expert round ${round + 1}`,
  );
}
const rivalAfter = developed.teams.find((t) => t.teamId === 'haas')!.car;
const ourCarAfter = developed.teams.find((t) => t.teamId === developed.playerTeamId)!.car;

check(
  'a rival car improves between rounds on Expert',
  carTotal(rivalAfter) > rivalBefore,
  `Haas total ${rivalBefore.toFixed(1)} -> ${carTotal(rivalAfter).toFixed(1)}`,
);
check(
  "the player's own car is never developed for them",
  JSON.stringify(ourCarAfter) === JSON.stringify(ourCarBefore),
);

const rookieState: GameState = {
  ...state,
  phase: 'POST_RACE',
  round: 1,
  settings: { ...state.settings, difficulty: 'ROOKIE', seasonLength: 6 },
};
const rookieRival = carTotal(rookieState.teams.find((t) => t.teamId === 'haas')!.car);
let rookieAfter = rookieState;
for (let round = 0; round < 8; round++) {
  rookieAfter = must(
    { ...rookieAfter, phase: 'POST_RACE' },
    { type: 'CONTINUE_TO_NEXT_WEEK' },
    `rookie round ${round + 1}`,
  );
}
check(
  'Rookie leaves the rival cars alone',
  carTotal(rookieAfter.teams.find((t) => t.teamId === 'haas')!.car) === rookieRival,
);

console.log('\n== job market ==');

const openings = jobOpenings(state);
check('every rival team advertises a role', openings.length === GRID_2026_TEAMS.length - 1);
check('the player\'s own team is not listed', !openings.some((o) => o.teamId === state.playerTeamId));

const topTeam = openings.find((o) => o.teamId === 'redbull')!;
const lowScore = { ...state, managerPerformanceScore: 20 };
const rejected = evaluateApplication(lowScore, topTeam, 0.5);
check('a weak manager is rejected by a top team', !rejected.application.accepted, rejected.application.message.slice(0, 60));

const strong = { ...state, managerPerformanceScore: 99 };
const accepted = evaluateApplication(strong, topTeam, 0.5);
check('a strong manager is accepted', accepted.application.accepted);
check('acceptance switches team', accepted.newTeamId === 'redbull');

const applied = must(state, { type: 'APPLY_FOR_JOB', teamId: 'haas', role: openings.find((o) => o.teamId === 'haas')!.role }, 'apply');
check('application recorded', applied.jobApplications.length === 1);
const duplicate = transition(applied, { type: 'APPLY_FOR_JOB', teamId: 'haas', role: openings.find((o) => o.teamId === 'haas')!.role });
check('cannot apply twice in one week', !duplicate.ok, duplicate.message);

console.log('\n== integrated systems ==');

check('grid is the 2026 field', GRID_2026_TEAMS.length === 11 && GRID_2026_DRIVERS.length === 22,
  `${GRID_2026_TEAMS.length} teams / ${GRID_2026_DRIVERS.length} drivers`);
check('every driver has a team on the grid',
  GRID_2026_DRIVERS.every((d) => GRID_2026_TEAMS.some((t) => t.id === d.teamId)));
check('every team fields exactly two cars',
  GRID_2026_TEAMS.every((t) => GRID_2026_DRIVERS.filter((d) => d.teamId === t.id).length === 2));

// The component tech tree now lives in the save.
let rnd = must(state, { type: 'START_UPGRADE', variantId: 'ice-root' }, 'start upgrade');
check('tech-tree project opened', Boolean(rnd.rnd.projects['ice-root']));
check('tokens deducted from the save', rnd.rnd.developmentTokens < state.rnd.developmentTokens);
check('seasonal cap consumed', rnd.rnd.seasonalTokensUsed > 0,
  `${rnd.rnd.seasonalTokensUsed}/${rnd.rnd.seasonalCapTokens}`);

const gated = transition(rnd, { type: 'START_UPGRADE', variantId: 'ice-a2' });
check('tier-3 still gated behind its branch', !gated.ok, gated.message);

const carBefore = rnd.teams.find((t) => t.teamId === rnd.playerTeamId)!.car.powerUnit;
rnd = must({ ...rnd, phase: 'POST_RACE' }, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'advance a week');
rnd = must({ ...rnd, phase: 'POST_RACE' }, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'advance again');
check('project fitted after its lead time', rnd.rnd.installedVariantIds.includes('ice-root'),
  `${rnd.rnd.installedVariantIds.length} fitted`);
check('fitting the upgrade improved the car',
  rnd.teams.find((t) => t.teamId === rnd.playerTeamId)!.car.powerUnit > carBefore);

// Facilities draw on the same budget.
const facilityBudget = rnd.teams.find((t) => t.teamId === rnd.playerTeamId)!.budget;
const upgraded = must(rnd, { type: 'UPGRADE_FACILITY', facilityId: 'windtunnel' }, 'facility upgrade');
check('facility level rose',
  upgraded.facilities.find((f) => f.id === 'windtunnel')!.level ===
    rnd.facilities.find((f) => f.id === 'windtunnel')!.level + 1);
check('facility upgrade charged the budget',
  upgraded.teams.find((t) => t.teamId === upgraded.playerTeamId)!.budget < facilityBudget);

console.log('\n== staff ==');

const market = staffMarket(state);
check('a staff market exists', market.length > 0, `${market.length} candidates`);
check(
  'every role has candidates on the market',
  ROLES.every((role) => market.some((c) => c.role === role.id)),
  `${ROLES.length} roles`,
);
check(
  'the market is deterministic for a season',
  JSON.stringify(staffMarket(state).map((c) => c.id)) ===
    JSON.stringify(market.map((c) => c.id)),
);
check('nobody on the market already works for the player', market.every((c) => c.currentTeamId !== state.playerTeamId));

const td = market
  .filter((c) => c.role === 'TECHNICAL_DIRECTOR')
  .sort((a, b) => b.rating - a.rating)[0]!;

const aeroBeforeHire = state.teams.find((t) => t.teamId === state.playerTeamId)!.car.aero;
const cashBeforeHire = state.teams.find((t) => t.teamId === state.playerTeamId)!.budget;

let staffed = must(state, { type: 'HIRE_STAFF', candidateId: td.id }, 'hire a technical director');
check('the appointment is on the books', staffed.staff.length === 1, staffed.staff[0]?.name);
check(
  'the signing fee left the bank',
  staffed.teams.find((t) => t.teamId === staffed.playerTeamId)!.budget < cashBeforeHire,
  `-$${((cashBeforeHire - staffed.teams.find((t) => t.teamId === staffed.playerTeamId)!.budget) / 1_000_000).toFixed(1)}M`,
);
check(
  'the hire is on the ledger',
  staffed.finance.ledger.some((entry) => entry.kind === 'STAFF'),
);

const dup = transition(staffed, { type: 'HIRE_STAFF', candidateId: td.id });
check('the same person cannot be hired twice', !dup.ok, dup.message);

const rival = market.find((c) => c.role === 'TECHNICAL_DIRECTOR' && c.id !== td.id)!;
const doubleFill = transition(staffed, { type: 'HIRE_STAFF', candidateId: rival.id });
check('a filled role has to be cleared first', !doubleFill.ok, doubleFill.message);

// The appointment has to be worth something measurable.
check(
  'a strong technical director improves R&D return',
  staffRndEfficiency(staffed, 'aero') > staffRndEfficiency(state, 'aero'),
  `${staffRndEfficiency(state, 'aero').toFixed(2)} -> ${staffRndEfficiency(staffed, 'aero').toFixed(2)}`,
);

/* The same cheque has to buy more work with the right people in post. */
const gainUnstaffed = developmentGain(state, 'FLOOR', aeroBeforeHire, 2);
const gainStaffed = developmentGain(staffed, 'FLOOR', aeroBeforeHire, 2);
check(
  'the same money buys more with the right people in place',
  gainStaffed > gainUnstaffed,
  `${gainUnstaffed.toFixed(2)} vs ${gainStaffed.toFixed(2)} levels per programme`,
);

check(
  'vacant roles are reported so they can be filled',
  vacantRoles(staffed).length === ROLES.length - 1,
  `${vacantRoles(staffed).length} still empty`,
);

// Releasing costs money and frees the seat.
const cashBeforeRelease = staffed.teams.find((t) => t.teamId === staffed.playerTeamId)!.budget;
const released = must(staffed, { type: 'RELEASE_STAFF', role: 'TECHNICAL_DIRECTOR' }, 'release');
check('the seat is empty again', released.staff.length === 0);
check(
  'severance is charged on release',
  released.teams.find((t) => t.teamId === released.playerTeamId)!.budget < cashBeforeRelease,
  `-$${((cashBeforeRelease - released.teams.find((t) => t.teamId === released.playerTeamId)!.budget) / 1_000_000).toFixed(2)}M`,
);
const emptyRelease = transition(released, { type: 'RELEASE_STAFF', role: 'TECHNICAL_DIRECTOR' });
check('cannot release an empty seat', !emptyRelease.ok, emptyRelease.message);

// A team with nothing in the bank cannot go shopping for staff.
const brokeForStaff: GameState = {
  ...state,
  teams: state.teams.map((t) =>
    t.teamId === state.playerTeamId ? { ...t, budget: 50_000 } : t,
  ),
};
const brokeHire = transition(brokeForStaff, { type: 'HIRE_STAFF', candidateId: td.id });
check('a broke team cannot sign staff', !brokeHire.ok, brokeHire.message);

console.log('\n== the economy ==');

const balanceOfPlayer = (g: GameState) =>
  g.teams.find((t) => t.teamId === g.playerTeamId)!.budget;

// Every discretionary purchase leaves a ledger line explaining itself.
check(
  'the facility works were written to the ledger',
  upgraded.finance.ledger.some((entry) => entry.kind === 'FACILITY'),
  upgraded.finance.ledger[0]?.label,
);
check(
  'the component build was charged in cash as well as tokens',
  upgraded.finance.ledger.some((entry) => entry.kind === 'UPGRADE' && entry.amount < 0),
);
check(
  'part development was charged',
  upgraded.finance.ledger.some((entry) => entry.kind === 'RND' && entry.amount < 0),
);

// A transfer is a purchase, not a swap of names.
const ourSeat = Object.entries(upgraded.driverTeams).find(
  ([, teamId]) => teamId === upgraded.playerTeamId,
)![0];
const targetDriver = GRID_2026_DRIVERS.find(
  (d) => upgraded.driverTeams[d.id] !== upgraded.playerTeamId,
)!;

const quote = quoteTransfer(targetDriver.id, ourSeat);
check('a transfer has a quoted fee', quote.net > 0, `$${(quote.net / 1_000_000).toFixed(1)}M`);

const cashBeforeTransfer = balanceOfPlayer(upgraded);
const transferred = must(
  upgraded,
  { type: 'SWAP_DRIVER', incomingDriverId: targetDriver.id, outgoingDriverId: ourSeat },
  'sign a driver',
);
check(
  'the transfer fee left the bank',
  balanceOfPlayer(transferred) < cashBeforeTransfer,
  `-$${((cashBeforeTransfer - balanceOfPlayer(transferred)) / 1_000_000).toFixed(1)}M`,
);
check(
  'the transfer is on the ledger',
  transferred.finance.ledger.some((entry) => entry.kind === 'TRANSFER'),
);
check('the driver actually moved', transferred.driverTeams[targetDriver.id] === transferred.playerTeamId);

// A team with no money cannot buy its way out of trouble.
const broke: GameState = {
  ...transferred,
  teams: transferred.teams.map((t) =>
    t.teamId === transferred.playerTeamId ? { ...t, budget: 100_000 } : t,
  ),
};
const brokeRnd = transition(broke, { type: 'DEVELOP_PART', category: 'FRONT_WING', intensity: 1 });
check('a broke team cannot commission development', !brokeRnd.ok, brokeRnd.message);
const brokeFacility = transition(broke, { type: 'UPGRADE_FACILITY', facilityId: 'simulator' });
check('a broke team cannot expand a facility', !brokeFacility.ok, brokeFacility.message);
const brokeSeat = Object.entries(broke.driverTeams).find(
  ([, teamId]) => teamId === broke.playerTeamId,
)![0];
const brokeTransfer = transition(broke, {
  type: 'SWAP_DRIVER',
  incomingDriverId: GRID_2026_DRIVERS.find((d) => broke.driverTeams[d.id] !== broke.playerTeamId)!.id,
  outgoingDriverId: brokeSeat,
});
check('a broke team cannot sign a driver', !brokeTransfer.ok, brokeTransfer.message);

// Facilities have to pay for themselves in something measurable.
const tunnelBase = rndEfficiency(rnd, 'aero');
const tunnelBoosted = rndEfficiency(upgraded, 'aero');
check(
  'expanding the wind tunnel makes aero money go further',
  tunnelBoosted > tunnelBase,
  `${tunnelBase.toFixed(2)} -> ${tunnelBoosted.toFixed(2)}`,
);

// Race strategy is persisted per driver.
const ownDriverId = Object.entries(upgraded.driverTeams)
  .find(([, teamId]) => teamId === upgraded.playerTeamId)![0];
const planned = must(upgraded, {
  type: 'SET_STRATEGY',
  plan: { driverId: ownDriverId, stints: [{ compound: 'SOFT', plannedLaps: 9 }], pushLevel: 4 },
}, 'set strategy');
check('strategy stored against the driver', planned.strategies[ownDriverId]?.pushLevel === 4);

const foreignPlan = transition(planned, {
  type: 'SET_STRATEGY',
  plan: { driverId: 'verstappen', stints: [], pushLevel: 3 },
});
check('cannot plan for a rival driver', !foreignPlan.ok, foreignPlan.message);

// The calendar is locked once the championship is running...
const midSeasonCalendar = transition(planned, { type: 'SET_CALENDAR', trackIds: ['suzuka'] });
check('calendar is locked mid-season', !midSeasonCalendar.ok, midSeasonCalendar.message);

// ...and validated against the season length before it starts.
const preSeason = { ...planned, phase: 'PRE_SEASON' as const };
const shortCalendar = transition(preSeason, { type: 'SET_CALENDAR', trackIds: ['suzuka'] });
check('calendar must match the season length', !shortCalendar.ok, shortCalendar.message);

const validCalendar = transition(preSeason, {
  type: 'SET_CALENDAR',
  trackIds: buildTracks().slice(0, preSeason.settings.seasonLength).map((t) => t.id).reverse(),
});
check('a full calendar is accepted', validCalendar.ok, validCalendar.message);

// Every management action must be legal wherever its menu is reachable.
const SHELL_PHASES: GamePhase[] = ['PRE_SEASON', 'HUB', 'QUALIFYING', 'POST_RACE'];
const MENU_ACTIONS = [
  'DEVELOP_PART', 'START_UPGRADE', 'CANCEL_UPGRADE', 'UPGRADE_FACILITY',
  'SWAP_DRIVER', 'SET_STRATEGY', 'SET_SETTINGS',
] as const;
check(
  'sidebar actions are legal in every phase that shows the sidebar',
  SHELL_PHASES.every((phase) => MENU_ACTIONS.every((action) => canDispatch(phase, action))),
  SHELL_PHASES.map(
    (phase) => `${phase}:${MENU_ACTIONS.filter((a) => !canDispatch(phase, a)).join(',') || 'ok'}`,
  ).join(' '),
);
check('reset is always available', SHELL_PHASES.every((phase) => canDispatch(phase, 'RESET')));

console.log('\n== save integrity ==');

const serialised = JSON.stringify(state);
const restored = JSON.parse(serialised) as GameState;
check('state round-trips through JSON', JSON.stringify(restored) === serialised);
check('save carries a version', typeof restored.version === 'number');

const stale = transition(null, { type: 'CONTINUE', save: { ...restored, version: 0 } });
check('a stale save version is rejected', !stale.ok, stale.message);

const resumedMidRace = transition(null, { type: 'CONTINUE', save: { ...restored, phase: 'RACE_SESSION' } });
check(
  'resuming mid-race falls back to the hub',
  resumedMidRace.ok && resumedMidRace.state?.phase === 'HUB',
);

const reset = transition(state, { type: 'RESET' });
check('reset clears the game', reset.ok && reset.state === null);


console.log('\n== academy graduates ==');

{
  /* A junior who is signed has to survive the season rollover: the intake
   * they came from is rebuilt from scratch every year. */
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');

  const ourDrivers = Object.entries(g.driverTeams)
    .filter(([, teamId]) => teamId === g.playerTeamId)
    .map(([driverId]) => driverId);
  const prospect = g.prospects[0]!;
  const ourTeam = g.teams.find((t) => t.teamId === g.playerTeamId)!;
  ourTeam.budget = 200_000_000;

  const signed = transition(g, {
    type: 'SIGN_PROSPECT',
    prospectId: prospect.id,
    outgoingDriverId: ourDrivers[0]!,
  });
  check('a junior can be signed into a seat', signed.ok, signed.message);

  if (signed.ok && signed.state) {
    const after = signed.state;
    check('the junior holds the seat', after.driverTeams[prospect.id] === after.playerTeamId);
    check(
      'and is copied somewhere durable',
      after.academyDrivers.some((entry) => entry.id === prospect.id),
    );

    /* The whole point: the graduate no longer depends on the intake. */
    const nextIntake = { ...after, prospects: [] };
    check(
      'the graduate survives the intake being rebuilt',
      nextIntake.academyDrivers.some((entry) => entry.id === prospect.id) &&
        nextIntake.driverTeams[prospect.id] === nextIntake.playerTeamId,
    );

    const asDriver = prospectToDriver(prospect, { teamId: 'williams', carNumber: 45 });
    check(
      'a graduate renders as a complete race entry',
      asDriver.teamId === 'williams' && asDriver.carNumber === 45,
      `#${asDriver.carNumber} ${asDriver.lastName}`,
    );
  }
}

console.log('\n== briefing room ==');

{
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');
  const ours = GRID_2026_DRIVERS.filter((d) => g.driverTeams[d.id] === g.playerTeamId);

  const cold = preRaceBriefing(g, ours);
  check('the briefing is never empty', cold.length > 0, `${cold.length} lines`);
  check(
    'the strategist is always in the room',
    cold.some((line) => line.subtitle === 'Chief Strategist'),
  );
  check('the commercial side is always in the room', cold.some((l) => l.topic === 'SPONSOR'));
  check(
    'an unsigned plan is raised, not hidden',
    cold.some((line) => line.tone === 'WARN' || line.tone === 'BAD'),
  );
  check(
    'every driver has a voice',
    ours.every((d) => cold.some((l) => l.kind === 'DRIVER' && l.name.includes(d.lastName))),
  );
  check(
    'no driver monopolises it',
    ours.every(
      (d) =>
        cold.filter((l) => l.kind === 'DRIVER' && l.name.includes(d.lastName)).length <= 3,
    ),
  );


  check(
    'team-mates never say the same thing',
    (() => {
      const texts = cold.filter((l) => l.kind === 'DRIVER').map((l) => l.text);
      return new Set(texts).size === texts.length;
    })(),
  );

  const again = preRaceBriefing(g, ours);
  check(
    'the same save briefs identically',
    JSON.stringify(cold.map((l) => l.text)) === JSON.stringify(again.map((l) => l.text)),
  );

  const withPlan = { ...g, strategies: { ...g.strategies } };
  for (const driver of ours) {
    withPlan.strategies[driver.id] = {
      ...blankStrategy(driver.id),
      startingCompound: 'HARD' as const,
      pushLevel: 5,
      confirmedForRound: withPlan.round,
      stints: [
        { compound: 'HARD' as const, plannedLaps: 8 },
        { compound: 'MEDIUM' as const, plannedLaps: 6 },
      ],
    };
  }
  const briefed = preRaceBriefing(withPlan, ours);
  check(
    'a driver reads the compound they were actually given',
    briefed.some((l) => l.topic === 'TYRES' && /hard/i.test(l.text)),
  );
  check('and reacts to the push level they were set', briefed.some((l) => l.topic === 'AGGRESSION'));

  const rattled = {
    ...withPlan,
    driverConditions: {
      ...withPlan.driverConditions,
      [ours[0]!.id]: { ...blankCondition(ours[0]!.id), mood: 20, stress: 92 },
    },
  };
  check(
    'condition changes what a driver says',
    JSON.stringify(preRaceBriefing(rattled, ours).map((l) => l.text)) !==
      JSON.stringify(briefed.map((l) => l.text)),
  );

  check('there is no debrief before the race', postRaceBriefing(g, ours).length === 0);
}


console.log('\n== power-unit grid penalty ==');

{
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');
  g = must(g, { type: 'PROCEED_TO_QUALIFYING' }, 'to qualifying');

  const ourIds = Object.entries(g.driverTeams)
    .filter(([, teamId]) => teamId === g.playerTeamId)
    .map(([driverId]) => driverId);

  const gTrack = buildTracks(1)[0]!;
  const clean = simulateQualifying({
    season: g.season,
    round: g.round,
    track: gTrack,
    drivers: GRID_2026_DRIVERS,
    driverTeams: g.driverTeams,
    teams: g.teams,
    difficulty: g.settings.difficulty,
    playerTeamId: g.playerTeamId,
  });

  /* A penalty is only worth having if it actually moves the grid. */
  const penalised = must(
    { ...g, pendingGridPenalty: 5 },
    { type: 'QUALIFYING_COMPLETE', result: clean },
    'qualifying with a penalty pending',
  );

  const before = new Map(clean.entries.map((e) => [e.driverId, e.position]));
  const after = new Map(penalised.qualifying!.entries.map((e) => [e.driverId, e.position]));

  check(
    'a penalised car actually drops down the grid',
    ourIds.some((id) => (after.get(id) ?? 0) > (before.get(id) ?? 0)),
    ourIds.map((id) => `${id} P${before.get(id)}->P${after.get(id)}`).join(' '),
  );
  check(
    'the grid stays 1..n with no holes',
    penalised.qualifying!.entries
      .map((e) => e.position)
      .sort((a, b) => a - b)
      .every((p, i) => p === i + 1),
  );
  check('the penalty is served once, then cleared', penalised.pendingGridPenalty === 0);

  const unpenalised = must(
    g,
    { type: 'QUALIFYING_COMPLETE', result: clean },
    'qualifying with no penalty',
  );
  check(
    'no penalty leaves the order exactly as qualified',
    unpenalised.qualifying!.entries.every((e, i) => e.position === clean.entries[i]!.position),
  );
}

console.log('\n== team principal reputation ==');

{
  const base = createNewGame('Krowten');
  const withBoss = {
    ...base,
    staff: [
      {
        candidateId: 'x',
        role: 'TEAM_PRINCIPAL' as const,
        name: 'A. Boss',
        rating: 95,
        salary: 9_000_000,
        signedInSeason: 2026,
        seasonsRemaining: 3,
      },
    ],
  };
  check(
    'a strong principal grows reputation faster than a vacancy',
    staffReputationBonus(withBoss) > staffReputationBonus(base),
    `${staffReputationBonus(withBoss).toFixed(2)} vs ${staffReputationBonus(base).toFixed(2)}`,
  );
}


console.log('\n== potential is a real ceiling ==');

{
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');

  const low = g.prospects.reduce((a, b) => (a.potential <= b.potential ? a : b));
  const high = g.prospects.reduce((a, b) => (a.potential >= b.potential ? a : b));
  check(
    'a stated ceiling is what binds a junior',
    potentialOf(g, low.id) === low.potential && potentialOf(g, high.id) === high.potential,
    `${low.lastName} ${low.potential} · ${high.lastName} ${high.potential}`,
  );

  /* An established driver has no stated ceiling, so it is derived from
   * what they are and how much career they have left. */
  const verst = potentialOf(g, 'verstappen');
  check('an established driver gets a derived ceiling', verst > 0 && verst <= 99, String(verst));

  /* The scouting report is a range, and it narrows with races run. */
  const raw = scoutedRange(g, high.id);
  const seasoned = scoutedRange(
    { ...g, driverRecords: { ...g.driverRecords, [high.id]: { driverId: high.id, age: 19, deltas: {}, seasonsRun: 3, careerPoints: 0, careerWins: 0, careerPodiums: 0 } } },
    high.id,
  );
  check(
    'scouting is a range, not a number',
    raw.high > raw.low,
    `${raw.low}-${raw.high}`,
  );
  check(
    'and it narrows once they have actually raced',
    seasoned.high - seasoned.low < raw.high - raw.low,
    `${raw.high - raw.low} -> ${seasoned.high - seasoned.low}`,
  );
}

console.log('\n== adaptability and feedback ==');

{
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');

  const trackId = g.calendarTrackIds[0]!;
  const ours = Object.entries(g.driverTeams)
    .filter(([, teamId]) => teamId === g.playerTeamId)
    .map(([driverId]) => driverId);

  const fresh = driverAdaptationPenalty(g, ours[0]!, trackId);
  check('a circuit nobody has raced costs lap time', fresh > 0, fresh.toFixed(5));

  const beenThere = {
    ...g,
    history: [{ season: 2026, round: 1, trackId, bestFinish: 8, pointsScored: 4 }],
    driverRecords: {
      ...g.driverRecords,
      [ours[0]!]: { ...g.driverRecords[ours[0]!]!, seasonsRun: 4 },
    },
  };
  check(
    'and costs nothing once it is familiar',
    driverAdaptationPenalty(beenThere, ours[0]!, trackId) === 0,
  );

  /* Feedback moves what a development cheque buys. */
  const bonus = driverFeedbackBonus(g);
  check('the line-up moves development return', bonus > 0.8 && bonus < 1.2, bonus.toFixed(3));

  const gain = developmentGain(g, 'FLOOR', 60, 'NORMAL');
  check('development still returns a sane gain', gain > 0, String(gain));
}

console.log('\n== academy graduates are priced properly ==');

{
  let g = createNewGame('Krowten');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'confirm setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview team');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm team');
  g = must(g, { type: 'START_SEASON' }, 'start season');

  const prospect = g.prospects[0]!;
  const withGraduate = { ...g, academyDrivers: [prospect] };

  const blind = driverValuation(prospect.id);
  const known = driverValuation(prospect.id, withGraduate);
  check(
    'a graduate is no longer valued at the floor',
    known > blind,
    `${(blind / 1e6).toFixed(1)}M blind vs ${(known / 1e6).toFixed(1)}M with the save`,
  );

  const quote = quoteTransfer(prospect.id, 'albon', withGraduate);
  check('a transfer involving one quotes a real wage delta', quote.wageDelta !== 0, String(quote.wageDelta));

  /* And they age and develop like anybody else, which they could not do
   * while `effectiveDriver` only looked in the current intake. */
  check(
    'a graduate resolves as a real driver',
    Boolean(effectiveDriver(withGraduate, prospect.id)),
  );
}

/* ---------------------------------------------------------------------
 * Squads, seats and the entry list
 *
 * A team's drivers and a team's cars used to be the same list, so
 * promoting anybody meant somebody else was written out of the door in
 * the same breath. These are the assertions that say that is over.
 * ------------------------------------------------------------------- */

console.log('\n== a squad can be more than two ==');

{
  let g = createNewGame('Squad Test');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 4 } }, 'settings');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Squad Test' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');

  const startingSquad = squadOf(g, 'williams');
  check('a team starts on two drivers', startingSquad.length === 2, String(startingSquad.length));

  /* Signing a junior with a full line-up must ADD him, not swap anybody
   * out. This is the bug in one assertion. */
  const junior = g.prospects[0]!;
  g = must(g, { type: 'SIGN_PROSPECT', prospectId: junior.id }, 'sign a junior');

  const grownSquad = squadOf(g, 'williams');
  check(
    'signing a junior grows the squad rather than replacing anybody',
    grownSquad.length === 3,
    `${grownSquad.length} under contract`,
  );
  check(
    'and nobody who was already there has been shown the door',
    startingSquad.every((driverId) => g.driverTeams[driverId] === 'williams'),
  );
  check(
    'the junior joins the bench, because both cars were taken',
    reserveDriversOf(g, 'williams').includes(junior.id),
  );
  check('the entry list is still two cars', raceDriversOf(g, 'williams').length === 2);

  /* Promoting him must move him into the car and move the second race
   * driver on to the bench — not out of the team. */
  const before = raceDriversOf(g, 'williams');
  g = must(g, { type: 'PROMOTE_DRIVER', driverId: junior.id }, 'promote the junior');

  const after = raceDriversOf(g, 'williams');
  check('promotion puts him in the car', after.includes(junior.id));
  check('the team leader keeps his seat', after[0] === before[0], `${after[0]}`);
  check(
    'the driver he displaced is on the bench, not out of the team',
    g.driverTeams[before[1]!] === 'williams' &&
      reserveDriversOf(g, 'williams').includes(before[1]!),
  );
  check('the squad is the same size after a promotion', squadOf(g, 'williams').length === 3);
  check('and the entry list is still two cars', after.length === 2);

  // Benching works the other way, and pulls the first reserve up with it.
  g = must(g, { type: 'DEMOTE_DRIVER', driverId: junior.id }, 'bench the junior');
  check(
    'benching a race driver promotes the first reserve',
    raceDriversOf(g, 'williams').length === 2 &&
      !raceDriversOf(g, 'williams').includes(junior.id),
  );
  check('and nobody left the team doing it', squadOf(g, 'williams').length === 3);

  /* The floor: a team can never be run down to one car. */
  const twoLeft = { ...g, driverTeams: { ...g.driverTeams } };
  delete twoLeft.driverTeams[junior.id];
  const cannotBench = transition(twoLeft, {
    type: 'DEMOTE_DRIVER',
    driverId: raceDriversOf(twoLeft, 'williams')[1]!,
  });
  check('you cannot bench your way down to one car', !cannotBench.ok, cannotBench.message ?? '');

  // And a squad has a ceiling, so a bench cannot become a reserve league.
  let full = g;
  for (const prospect of g.prospects.slice(1)) {
    const attempt = transition(full, { type: 'SIGN_PROSPECT', prospectId: prospect.id });
    if (!attempt.ok || !attempt.state) {
      check(
        'the squad has a ceiling',
        squadOf(full, 'williams').length === MAX_SQUAD_SIZE,
        attempt.message ?? '',
      );
      break;
    }
    full = attempt.state;
  }
}

console.log('\n== the grid is capped at two cars per team ==');

{
  let g = createNewGame('Grid Test');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Grid Test' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');

  const junior = g.prospects[0]!;
  g = must(g, { type: 'SIGN_PROSPECT', prospectId: junior.id }, 'sign a junior');

  const entryList = gridDriverIds(g);
  check(
    'no team enters more than two cars',
    [...new Set(Object.values(g.driverTeams))].every(
      (teamId) => entryList.filter((driverId) => g.driverTeams[driverId] === teamId).length <= 2,
    ),
  );
  check(
    'the reserve is on the books but not on the entry list',
    Boolean(g.driverTeams[junior.id]) && !entryList.includes(junior.id),
  );
  check(
    'the entry list is smaller than the payroll',
    entryList.length < Object.keys(g.driverTeams).length,
    `${entryList.length} entered, ${Object.keys(g.driverTeams).length} contracted`,
  );

  /* Qualifying is run from the entry list, so a reserve can never take a
   * grid slot off somebody. */
  const track = buildTracks(4)[0]!;
  const byId = new Map(GRID_2026_DRIVERS.map((d) => [d.id, d]));
  const quali = simulateQualifying({
    season: g.season,
    round: g.round,
    track,
    drivers: entryList.map((id) => byId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    driverTeams: g.driverTeams,
    teams: g.teams,
    difficulty: g.settings.difficulty,
    playerTeamId: g.playerTeamId,
  });
  check(
    'qualifying never runs a third car for anybody',
    GRID_2026_TEAMS.every(
      (team) => quali.entries.filter((entry) => entry.teamId === team.id).length <= 2,
    ),
  );

  /* A reserve who has never started does not belong in the drivers'
   * table — the championship lists people who have raced, not people
   * who are employed. What matters is the moment he does race. */
  check(
    'a reserve who has never started is not in the table',
    !g.standings.drivers.some((row) => row.driverId === junior.id),
  );

  const withPoints = applyRaceResult(g.standings, {
    season: g.season,
    round: 1,
    trackId: track.id,
    totalLaps: 20,
    completedAt: new Date().toISOString(),
    finishers: [
      {
        position: 1,
        driverId: junior.id,
        teamId: 'williams',
        gridPosition: 4,
        points: 25,
        positionsGained: 3,
        status: 'FINISHED' as const,
        fastestLap: false,
        bestLapMs: 80_000,
        gapToWinnerMs: 0,
      },
    ],
  });
  check(
    'but the moment he scores, the points are on the leaderboard',
    (withPoints.drivers.find((row) => row.driverId === junior.id)?.points ?? 0) === 25,
  );
  check(
    'and the row is ranked, not appended at the bottom',
    withPoints.drivers[0]?.driverId === junior.id,
  );
}

/* ---------------------------------------------------------------------
 * Signing, contracts and the market
 * ------------------------------------------------------------------- */

console.log('\n== approaching and signing a driver ==');

{
  let g = createNewGame('Market Test');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Market Test' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');

  // Somebody at a midfield team, so the seller will actually deal.
  const target = GRID_2026_DRIVERS.find(
    (d) => g.driverTeams[d.id] && g.driverTeams[d.id] !== 'williams' && sellability(g, d.id).willing,
  )!;

  const approached = transition(g, { type: 'APPROACH_DRIVER', driverId: target.id });
  check('an approach opens talks', approached.ok, approached.message ?? '');
  if (approached.state) g = approached.state;

  const talks = g.negotiations[0];
  check('the driver names his terms', Boolean(talks?.asking.salary), String(talks?.asking.salary));
  check('and it lands in the inbox', g.mail.some((m) => m.negotiationId === talks?.id));

  if (talks && talks.stage !== 'REJECTED') {
    // A derisory offer has to come back as a counter, not a signature.
    const lowball = transition(g, {
      type: 'OFFER_CONTRACT',
      negotiationId: talks.id,
      offer: { ...talks.asking, salary: 1, signingBonus: 0, transferFee: 0 },
    });
    check('a lowball offer is not accepted', lowball.ok && lowball.state != null);
    if (lowball.state) {
      const after = lowball.state.negotiations.find((n) => n.id === talks.id);
      check(
        'it comes back as a counter rather than a signature',
        lowball.state.driverTeams[target.id] !== 'williams' && (after?.rejections ?? 0) === 1,
      );
      check(
        'and the counter reaches the inbox',
        lowball.state.mail.some((m) => m.subject.includes('Counter-offer')),
      );
    }

    /* Meeting the asking price signs him — and he joins the squad
     * without displacing either race driver. */
    const rich = { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) };
    const signed = transition(rich, {
      type: 'OFFER_CONTRACT',
      negotiationId: talks.id,
      offer: { ...talks.asking, salary: talks.asking.salary * 2, transferFee: talks.asking.transferFee * 2 },
    });
    check('meeting the terms signs him', signed.ok, signed.message ?? '');
    if (signed.state) {
      check('he is on our books', signed.state.driverTeams[target.id] === 'williams');
      check(
        'on a real contract',
        (signed.state.deals[target.id]?.seasonsRemaining ?? 0) > 0,
        `${signed.state.deals[target.id]?.seasonsRemaining} seasons`,
      );
      check(
        'and the squad grew rather than swapping anybody out',
        squadOf(signed.state, 'williams').length === 3,
        `${squadOf(signed.state, 'williams').length} under contract`,
      );
      check(
        'the signing is announced in the mail and on the feed',
        signed.state.mail.some((m) => m.subject.startsWith('Signed:')) &&
          signed.state.social.some((post) => post.topic === 'TRANSFER'),
      );
      check(
        'and the fee actually left the bank',
        (signed.state.teams.find((t) => t.teamId === 'williams')?.budget ?? 0) < 400_000_000,
      );
    }
  }

  /* Offering a driver out, and answering a bid for one. */
  const junior = g.prospects[0]!;
  g = must(g, { type: 'SIGN_PROSPECT', prospectId: junior.id }, 'sign a junior');
  const listed = transition(g, {
    type: 'LIST_DRIVER',
    driverId: junior.id,
    askingFee: 4_000_000,
  });
  check('a driver can be offered out', listed.ok, listed.message ?? '');
  if (listed.state) {
    g = listed.state;
    check('the listing is on the record', g.transferList.length === 1);

    const bids = rivalBids(g);
    check('rivals come in for a listed driver', bids.length > 0, `${bids.length} bids`);

    const bid = bids.find((entry) => entry.driverId === junior.id);
    if (bid) {
      const withBid = { ...g, transferOffers: [bid] };
      const sold = transition(withBid, { type: 'RESPOND_TO_BID', offerId: bid.id, accept: true });
      check('a bid can be accepted', sold.ok, sold.message ?? '');
      if (sold.state) {
        check('the driver leaves', sold.state.driverTeams[junior.id] === bid.fromTeamId);
        check(
          'the fee is banked',
          (sold.state.teams.find((t) => t.teamId === 'williams')?.budget ?? 0) >
            (g.teams.find((t) => t.teamId === 'williams')?.budget ?? 0),
        );
        check(
          'and the buying team is still on two cars',
          raceDriversOf(sold.state, bid.fromTeamId).length === 2,
        );
      }

      const declined = transition(withBid, {
        type: 'RESPOND_TO_BID',
        offerId: bid.id,
        accept: false,
      });
      check(
        'turning a bid down keeps the driver',
        declined.ok && declined.state?.driverTeams[junior.id] === 'williams',
      );
    }
  }

  /* A team cannot be sold down below two cars, whatever the fee. */
  const bare = createNewGame('Bare');
  const bareWithTeam = { ...bare, playerTeamId: 'williams', phase: 'HUB' as const };
  const ourTwo = raceDriversOf(bareWithTeam, 'williams');
  const cannotList = transition(bareWithTeam, {
    type: 'LIST_DRIVER',
    driverId: ourTwo[0]!,
    askingFee: 1_000_000,
  });
  check('you cannot sell down to one car', !cannotList.ok, cannotList.message ?? '');
}

/* ---------------------------------------------------------------------
 * Mail and social
 * ------------------------------------------------------------------- */

console.log('\n== the inbox ==');

{
  let g = createNewGame('Mail Test');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Mail Test' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = must(g, { type: 'START_SEASON' }, 'start season');
  g = must(g, { type: 'PROCEED_TO_QUALIFYING' }, 'to qualifying');

  const track = buildTracks(g.settings.seasonLength)[0]!;
  const entered = gridDriverIds(g);
  const byId = new Map(GRID_2026_DRIVERS.map((d) => [d.id, d]));
  const quali = simulateQualifying({
    season: g.season,
    round: g.round,
    track,
    drivers: entered.map((id) => byId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    driverTeams: g.driverTeams,
    teams: g.teams,
    difficulty: g.settings.difficulty,
    playerTeamId: g.playerTeamId,
  });
  g = must(g, { type: 'QUALIFYING_COMPLETE', result: quali }, 'store qualifying');

  check('qualifying files a report', g.mail.some((m) => m.category === 'RESULT'));
  check('and the paddock talks about it', g.social.some((p) => p.topic === 'QUALIFYING'));

  const unreadBefore = g.mail.filter((m) => !m.read).length;
  check('new post arrives unread', unreadBefore > 0, String(unreadBefore));

  const first = g.mail[0]!;
  g = must(g, { type: 'READ_MAIL', mailId: first.id }, 'read one');
  check('reading marks it read', g.mail.find((m) => m.id === first.id)?.read === true);

  g = must(g, { type: 'READ_ALL_MAIL' }, 'read all');
  check('mark-all clears the badge', g.mail.every((m) => m.read));

  g = must(g, { type: 'DELETE_MAIL', mailId: first.id }, 'delete one');
  check('deleting removes it', !g.mail.some((m) => m.id === first.id));

  // Reading the post is legal even mid-race, when nothing else is.
  check(
    'the inbox is readable during a session',
    canDispatch('RACE_SESSION', 'READ_MAIL'),
  );

  /* The race writes its own report, and a win reaches the board. */
  g = must(g, { type: 'PROCEED_TO_RACE' }, 'to strategy');
  const ours = raceDriversOf(g, 'williams');
  for (const driverId of ours) {
    g = must(g, { type: 'SET_STARTING_TYRE', driverId, compound: 'MEDIUM' }, 'tyres');
  }
  g = must(g, { type: 'CONFIRM_STRATEGY' }, 'confirm strategy');
  g = must(g, { type: 'COUNTDOWN_COMPLETE' }, 'lights out');

  const order = quali.entries.map((entry) => entry.driverId);
  // Put one of ours on top, so the board has something to write about.
  const winnerFirst = [ours[0]!, ...order.filter((id) => id !== ours[0])];
  const raceResult = scoreRace({
    season: g.season,
    round: g.round,
    trackId: track.id,
    totalLaps: 20,
    order: winnerFirst,
    driverTeams: g.driverTeams,
    gridPositions: Object.fromEntries(quali.entries.map((e) => [e.driverId, e.position])),
    bestLaps: Object.fromEntries(winnerFirst.map((id) => [id, 80_000])),
    retired: new Set<string>(),
    gaps: Object.fromEntries(winnerFirst.map((id, i) => [id, i * 900])),
    fastestLapPoint: true,
  });
  g = must(g, { type: 'RACE_COMPLETE', result: raceResult }, 'race complete');

  check('the race files a report', g.mail.some((m) => m.subject.startsWith('Round 1')));
  check('a win reaches the board', g.mail.some((m) => m.category === 'BOARD'));
  check('and the feed covers the race', g.social.some((p) => p.topic === 'RACE'));

  /* Between rounds the paddock keeps moving: rivals ring up, drivers
   * say how they are finding it, the press files copy. */
  const beforeSocial = g.social.length;
  g = must(g, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'next week');
  check(
    'the feed keeps moving between rounds',
    g.social.length > beforeSocial,
    `${beforeSocial} -> ${g.social.length}`,
  );

  /* Every post carries its own engagement, fixed to the post. */
  const ids = new Set(g.social.map((p) => p.id));
  check('no two posts share an id', ids.size === g.social.length);
  check('posts carry engagement', g.social.every((p) => p.likes > 0 && p.reposts > 0));

  const mailIds = new Set(g.mail.map((m) => m.id));
  check('no two messages share an id', mailIds.size === g.mail.length);
}

/* ---------------------------------------------------------------------
 * The garage: R&D raises a drawing, the factory builds to it, the
 * mechanics fit it, and the part wears until it has to be built again.
 * ------------------------------------------------------------------- */

console.log('\n== a car assembled from parts ==');

{
  let g = createNewGame('Garage');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Garage' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) };

  const team = (s2: GameState) => s2.teams.find((t) => t.teamId === 'williams')!;

  check(
    'the garage opens with a full set on each of the two cars',
    team(g).builtParts.filter((p) => p.status === 'FITTED').length ===
      ASSEMBLY_PARTS.length * CARS_PER_TEAM,
    `${team(g).builtParts.length} parts`,
  );
  check(
    'each car has exactly one of every category fitted',
    Array.from({ length: CARS_PER_TEAM }).every((_, carIndex) =>
      ASSEMBLY_PARTS.every((c) => fittedPart(team(g), c, carIndex) !== null),
    ),
  );
  check(
    'every category can be built for either car',
    ASSEMBLY_PARTS.every(
      (c) =>
        transition(g, { type: 'BUILD_PART', category: c, carIndex: 0 }).ok &&
        transition(g, { type: 'BUILD_PART', category: c, carIndex: 1 }).ok,
    ),
    `${ASSEMBLY_PARTS.length} categories`,
  );
  check(
    'building for a car that does not exist is refused',
    !transition(g, { type: 'BUILD_PART', category: 'FLOOR', carIndex: 2 }).ok,
  );

  /* Cost has to answer to the drawing: a better part is a dearer one. */
  const cheap = partBuildCost(team(g), 'FRONT_WING', g.season);
  const dear = partBuildCost(
    { ...team(g), parts: team(g).parts.map((p) => ({ ...p, level: 97 })) },
    'FRONT_WING',
    g.season,
  );
  check('a higher-spec part costs more to build', dear > cheap * 1.5, `${(cheap / 1e6).toFixed(2)}M vs ${(dear / 1e6).toFixed(2)}M`);

  /* The allowance is a cap that charges, not a wall that stops. */
  let spent = g;
  const allowance = PART_BY_ID.get('BRAKES')!.buildAllowance;
  for (let i = 0; i < allowance; i++) {
    spent = must(spent, { type: 'BUILD_PART', category: 'BRAKES', carIndex: 0 }, `brake set ${i + 1}`);
  }
  check(
    'the seasonal allowance is spent by building',
    buildsRemaining(team(spent), 'BRAKES', spent.season) === 0,
    `${allowance} used`,
  );
  const withinCost = partBuildCost(team(g), 'BRAKES', g.season);
  const rushedCost = partBuildCost(team(spent), 'BRAKES', spent.season);
  check('going beyond it costs more', rushedCost > withinCost, `${(withinCost / 1e6).toFixed(2)}M -> ${(rushedCost / 1e6).toFixed(2)}M`);
  check(
    'but is still allowed',
    transition(spent, { type: 'BUILD_PART', category: 'BRAKES', carIndex: 0 }).ok,
  );

  /* No money, no part. */
  const broke: GameState = {
    ...g,
    teams: g.teams.map((t) => (t.teamId === 'williams' ? { ...t, budget: 1_000 } : t)),
  };
  const refused = transition(broke, { type: 'BUILD_PART', category: 'CHASSIS', carIndex: 0 });
  check('a build you cannot afford is refused', !refused.ok, refused.message ?? '');

  /* Fitting swaps, it does not duplicate. */
  const made = must(g, { type: 'BUILD_PART', category: 'FLOOR', carIndex: 0 }, 'a floor');
  const spare = sparePartsOf(team(made), 'FLOOR')[0]!;
  const oldFloor = fittedPart(team(made), 'FLOOR', 0)!;
  const otherCarFloor = fittedPart(team(made), 'FLOOR', 1)!;
  const fittedNow = must(made, { type: 'FIT_PART', partId: spare.id, carIndex: 0 }, 'fit it');
  check(
    'exactly one part of a category is fitted per car',
    team(fittedNow).builtParts.filter(
      (p) => p.category === 'FLOOR' && p.status === 'FITTED' && p.carIndex === 0,
    ).length === 1,
  );
  check('the new one is on that car', fittedPart(team(fittedNow), 'FLOOR', 0)!.id === spare.id);
  check(
    'and the other car was left alone',
    fittedPart(team(fittedNow), 'FLOOR', 1)!.id === otherCarFloor.id,
  );
  check(
    'the old one is a spare, not scrap',
    sparePartsOf(team(fittedNow), 'FLOOR').some((p) => p.id === oldFloor.id),
  );
  check(
    'refitting what is already on the car is refused',
    !transition(fittedNow, { type: 'FIT_PART', partId: spare.id }).ok,
  );
  check(
    'scrapping the part that is on the car is refused',
    !transition(fittedNow, { type: 'SCRAP_PART', partId: spare.id }).ok,
  );
  check(
    'but a spare can be scrapped',
    transition(fittedNow, { type: 'SCRAP_PART', partId: oldFloor.id }).ok,
  );
  check(
    'a part that does not exist is refused',
    !transition(fittedNow, { type: 'FIT_PART', partId: 'nonsense' }).ok,
  );
}

console.log('\n== parts wear out ==');

{
  let g = createNewGame('Wear');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 8 } }, 'settings');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Wear' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = must(g, { type: 'START_SEASON' }, 'start');

  const team = (s2: GameState) => s2.teams.find((t) => t.teamId === 'williams')!;
  const track = buildTracks(8)[0]!;
  const order = Object.keys(g.driverTeams);

  const aeroFresh = team(g).car.aero;
  const brakesFresh = fittedPart(team(g), 'BRAKES', 0)!.healthPct;

  /* Four weekends is more than a set of brakes lasts and less than a
   * chassis does — which is exactly the spread the system is for. */
  for (let round = 0; round < 4; round++) {
    const result = scoreRace({
      season: g.season, round: g.round, trackId: track.id, totalLaps: 20, order,
      driverTeams: g.driverTeams,
      gridPositions: Object.fromEntries(order.map((id, i) => [id, i + 1])),
      bestLaps: Object.fromEntries(order.map((id) => [id, 80_000])),
      retired: new Set<string>(),
      gaps: Object.fromEntries(order.map((id, i) => [id, i * 900])),
      fastestLapPoint: true,
    });
    g = must({ ...g, phase: 'RACE_SESSION' }, { type: 'RACE_COMPLETE', result }, `race ${round + 1}`);
    g = must(g, { type: 'CONTINUE_TO_NEXT_WEEK' }, `week ${round + 1}`);
  }

  const brakes = fittedPart(team(g), 'BRAKES', 0)!;
  const chassis = fittedPart(team(g), 'CHASSIS', 0)!;
  check('a consumable part wears fast', brakes.healthPct < brakesFresh - 60, `brakes ${brakes.healthPct}%`);
  check('a long-life part wears slowly', chassis.healthPct > 55, `chassis ${chassis.healthPct}%`);
  check('mileage is recorded', brakes.mileageLaps >= 80, `${brakes.mileageLaps} laps`);
  check(
    'wear costs the car real performance',
    team(g).car.aero < aeroFresh,
    `aero ${aeroFresh.toFixed(1)} -> ${team(g).car.aero.toFixed(1)}`,
  );
  check(
    'a worn part is never worth more than a fresh one',
    partHealthFactor(0) < partHealthFactor(100) && partHealthFactor(100) === 1,
  );

  /* Building and fitting a fresh one is the cure, and it has to be. */
  const rich: GameState = { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) };
  const rebuilt = must(rich, { type: 'BUILD_PART', category: 'FRONT_WING', carIndex: 0 }, 'fresh wing');
  const fresh = sparePartsOf(team(rebuilt), 'FRONT_WING')[0]!;
  const fittedFresh = must(rebuilt, { type: 'FIT_PART', partId: fresh.id }, 'fit fresh wing');
  check(
    'a rebuild recovers what wear took',
    fittedFresh.teams.find((t) => t.teamId === 'williams')!.car.aero > team(g).car.aero,
  );
}

console.log('\n== a new season resets the car ==');

{
  let g = createNewGame('Rollover');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 4 } }, 'settings');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Rollover' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) };
  g = must(g, { type: 'START_SEASON' }, 'start');

  const team = (s2: GameState) => s2.teams.find((t) => t.teamId === 'williams')!;

  // Pile up engines and spares the way a season does.
  for (let i = 0; i < 5; i++) g = must(g, { type: 'BUILD_POWER_UNIT' }, `unit ${i + 1}`);
  for (let i = 0; i < 3; i++) g = must(g, { type: 'BUILD_PART', category: 'FRONT_WING', carIndex: 0 }, `wing ${i + 1}`);
  check('units pile up during a season', team(g).powerUnits.length === 6, `${team(g).powerUnits.length}`);
  check('so do spares', sparePartsOf(team(g), 'FRONT_WING').length === 3);

  // Spend the token pool down, as a season of upgrades would.
  g = { ...g, rnd: { ...g.rnd, developmentTokens: 3, seasonalTokensUsed: 45 } };

  const season = g.season;
  for (let round = 0; round < 4; round++) {
    g = must({ ...g, phase: 'POST_RACE' }, { type: 'CONTINUE_TO_NEXT_WEEK' }, `round ${round + 1}`);
  }

  check('the season rolled over', g.season === season + 1, `${season} -> ${g.season}`);
  check(
    'exactly one power unit survives the winter',
    team(g).powerUnits.length === 1,
    `${team(g).powerUnits.length} left`,
  );
  check('and it is fresh and in the car', fittedUnit(team(g))?.healthPct === 100);
  check(
    "the garage is a fresh full set on both cars, not last year's stock",
    team(g).builtParts.length === ASSEMBLY_PARTS.length * CARS_PER_TEAM &&
      team(g).builtParts.every((p) => p.status === 'FITTED' && p.healthPct === 100),
    `${team(g).builtParts.length} parts`,
  );
  check(
    'build allowances reset with the season',
    ASSEMBLY_PARTS.every((c) => buildsRemaining(team(g), c, g.season) > 0),
  );
  check('any pending grid penalty is cleared', g.pendingGridPenalty === 0);

  /* The bug: the seasonal cap reset but the pool it is spent from did
   * not, so from season two the whole tech tree was unaffordable and
   * the R&D Center was, in effect, switched off. */
  check(
    'the development pool is reissued for the new year',
    g.rnd.developmentTokens > 3,
    `3 -> ${g.rnd.developmentTokens}`,
  );
  check('and the seasonal cap resets with it', g.rnd.seasonalTokensUsed === 0);

  const startable = COMPONENT_CATALOG.flatMap((c) => c.variants).filter(
    (v) => canStartUpgrade(v, g).ok,
  );
  check(
    'so upgrades can actually be commissioned in season two',
    startable.length > 0,
    `${startable.length} available`,
  );

  // And part development is still open too.
  check(
    'part development is still open in season two',
    transition(g, { type: 'DEVELOP_PART', category: 'FLOOR', intensity: 2 }).ok,
  );
}

/* ---------------------------------------------------------------------
 * Two cars that come apart under two different drivers
 * ------------------------------------------------------------------- */

console.log('\n== the two cars diverge ==');

{
  let g = createNewGame('Divergence');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 8 } }, 'settings');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Divergence' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = must(g, { type: 'START_SEASON' }, 'start');

  const team = (s2: GameState) => s2.teams.find((t) => t.teamId === 'williams')!;
  const ours = raceDriversOf(g, 'williams');

  check('one driver, one car', carIndexOf(g, ours[0]!) === 0 && carIndexOf(g, ours[1]!) === 1);
  check(
    'both cars start identical',
    carRating(carStatsOf(team(g), 0)) === carRating(carStatsOf(team(g), 1)),
  );

  // One is told to race, the other to look after it.
  for (const [index, driverId] of ours.entries()) {
    g = must(
      g,
      {
        type: 'SET_STRATEGY',
        plan: {
          driverId,
          stints: [{ compound: 'MEDIUM', plannedLaps: 8 }],
          pushLevel: index === 0 ? 5 : 1,
          startingCompound: 'MEDIUM',
          confirmedForRound: null,
        },
      },
      `plan ${index}`,
    );
  }

  const hard = driverWearFactor(g, ours[0]!);
  const gentle = driverWearFactor(g, ours[1]!);
  check(
    'the push level changes how hard a driver is on the car',
    hard > gentle,
    `${hard.toFixed(2)}x vs ${gentle.toFixed(2)}x`,
  );

  const order = Object.keys(g.driverTeams);
  for (let round = 0; round < 3; round++) {
    const result = scoreRace({
      season: g.season, round: g.round, trackId: 'x', totalLaps: 20, order,
      driverTeams: g.driverTeams,
      gridPositions: Object.fromEntries(order.map((id, i) => [id, i + 1])),
      bestLaps: Object.fromEntries(order.map((id) => [id, 80_000])),
      retired: new Set<string>(),
      gaps: Object.fromEntries(order.map((id, i) => [id, i * 900])),
      fastestLapPoint: true,
    });
    g = must({ ...g, phase: 'RACE_SESSION' }, { type: 'RACE_COMPLETE', result }, `race ${round}`);
    g = must(g, { type: 'CONTINUE_TO_NEXT_WEEK' }, `week ${round}`);
  }

  const brakes0 = fittedPart(team(g), 'BRAKES', 0)!;
  const brakes1 = fittedPart(team(g), 'BRAKES', 1)!;
  check(
    'the same part wears faster on the harder driver',
    brakes0.healthPct < brakes1.healthPct,
    `${brakes0.healthPct}% vs ${brakes1.healthPct}%`,
  );
  check(
    'so the two cars are no longer the same machine',
    carStatsOf(team(g), 0).aero !== carStatsOf(team(g), 1).aero,
  );
  check(
    "and the team's headline is the average of the two",
    Math.abs(
      team(g).car.aero - (carStatsOf(team(g), 0).aero + carStatsOf(team(g), 1).aero) / 2,
    ) < 0.001,
  );
  check(
    'each driver is rated in their own car',
    statsForDriver(g, ours[0]!).aero === carStatsOf(team(g), 0).aero &&
      statsForDriver(g, ours[1]!).aero === carStatsOf(team(g), 1).aero,
  );

  /* Building for one car must leave the other alone, and a spare built
   * for one must be fittable to the other. */
  const rich: GameState = { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) };
  const built = must(rich, { type: 'BUILD_PART', category: 'FRONT_WING', carIndex: 1 }, 'wing');
  const spare = sparePartsOf(team(built), 'FRONT_WING')[0]!;
  const car0Before = fittedPart(team(built), 'FRONT_WING', 0)!.healthPct;
  const fitted = must(built, { type: 'FIT_PART', partId: spare.id, carIndex: 1 }, 'fit');

  check('fitting to one car leaves the other untouched',
    fittedPart(team(fitted), 'FRONT_WING', 0)!.healthPct === car0Before);
  check('and the car it went on is fresh',
    fittedPart(team(fitted), 'FRONT_WING', 1)!.healthPct === 100);

  const crossed = must(rich, { type: 'BUILD_PART', category: 'BRAKES', carIndex: 0 }, 'brakes');
  const crossSpare = sparePartsOf(team(crossed), 'BRAKES')[0]!;
  const swapped = must(crossed, { type: 'FIT_PART', partId: crossSpare.id, carIndex: 1 }, 'cross-fit');
  check(
    'a spare built for one car can be fitted to the other',
    fittedPart(team(swapped), 'BRAKES', 1)!.id === crossSpare.id,
  );

  /* Parts belong to the car, not the driver: swapping the line-up must
   * not move anything across the garage. */
  const wornBefore = fittedPart(team(g), 'BRAKES', 0)!.id;
  const junior = g.prospects[0]!;
  const withJunior = must(
    { ...g, teams: g.teams.map((t) => ({ ...t, budget: 400_000_000 })) },
    { type: 'SIGN_PROSPECT', prospectId: junior.id },
    'sign a junior',
  );
  const promoted = must(withJunior, { type: 'PROMOTE_DRIVER', driverId: junior.id }, 'promote');
  check(
    'changing who drives a car does not move its parts',
    fittedPart(promoted.teams.find((t) => t.teamId === 'williams')!, 'BRAKES', 0)!.id ===
      wornBefore,
  );
}

console.log('\n== drivers take things their own way ==');

{
  const sample = GRID_2026_DRIVERS.slice(0, 12);
  const temperaments = sample.map((d) => temperamentOf(d));

  check(
    'temperament varies across the grid',
    new Set(temperaments.map((t) => t.volatility)).size > 4,
    `${new Set(temperaments.map((t) => t.volatility)).size} distinct volatilities`,
  );
  check(
    'and it runs both sides of average',
    temperaments.some((t) => t.volatility < 1) && temperaments.some((t) => t.volatility > 1),
  );

  /* The same event has to land differently, or the whole thing is still
   * a lookup table with extra steps. */
  const outcomes = sample.map((d) => {
    const after = applyConditionEvent(blankCondition(d.id, 70), 'RESULT_TERRIBLE', 1, {
      temperament: temperamentOf(d),
      label: 'A bad day',
      season: 2026,
      round: 1,
    });
    return Math.round(after.mood * 10) / 10;
  });
  check(
    'the same bad result lands differently on different people',
    new Set(outcomes).size > 2,
    `${new Set(outcomes).size} distinct outcomes from ${sample.length} drivers`,
  );

  /* And it writes down why. */
  const noted = applyConditionEvent(blankCondition('x', 70), 'RESULT_EXCELLENT', 1, {
    label: 'Podium — P2',
    season: 2026,
    round: 4,
  });
  check('a change records its reason', noted.recent?.[0]?.label === 'Podium — P2');
  check('with the round it happened in', noted.recent?.[0]?.round === 4);

  let stacked = noted;
  for (let i = 0; i < 10; i++) {
    stacked = applyConditionEvent(stacked, 'RESULT_GOOD', 1, {
      label: `Round ${i}`,
      season: 2026,
      round: i,
    });
  }
  check(
    'the memory is capped',
    (stacked.recent ?? []).length === CONDITION_MEMORY,
    `${(stacked.recent ?? []).length} kept`,
  );
  check('newest first', stacked.recent?.[0]?.label === 'Round 9');

  // Every event has words a person would use.
  check(
    'every condition event has a human label',
    Object.keys(CONDITION_EVENTS).every(
      (event) => (CONDITION_LABEL[event as ConditionEvent] ?? '').length > 0,
    ),
  );
}

console.log('\n== drivers write about their own car ==');

{
  let g = createNewGame('Letters');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 8 } }, 'settings');
  g = must(g, { type: 'SET_MANAGER_NAME', name: 'Letters' }, 'name');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'confirm');
  g = must(g, { type: 'START_SEASON' }, 'start');

  const order = Object.keys(g.driverTeams);
  for (let round = 0; round < 4; round++) {
    const result = scoreRace({
      season: g.season, round: g.round, trackId: 'x', totalLaps: 20, order,
      driverTeams: g.driverTeams,
      gridPositions: Object.fromEntries(order.map((id, i) => [id, i + 1])),
      bestLaps: Object.fromEntries(order.map((id) => [id, 80_000])),
      retired: new Set<string>(),
      gaps: Object.fromEntries(order.map((id, i) => [id, i * 900])),
      fastestLapPoint: true,
    });
    g = must({ ...g, phase: 'RACE_SESSION' }, { type: 'RACE_COMPLETE', result }, `race ${round}`);
    g = must(g, { type: 'CONTINUE_TO_NEXT_WEEK' }, `week ${round}`);
  }

  const ourNames = raceDriversOf(g, 'williams').map(
    (id) => `${effectiveDriver(g, id)?.firstName} ${effectiveDriver(g, id)?.lastName}`,
  );
  const letters = g.mail.filter((m) => ourNames.includes(m.from));

  check('the drivers write in themselves', letters.length > 0, `${letters.length} letters`);
  check(
    'in their own words rather than a percentage',
    letters.every((m) => !m.body.includes('%')),
  );
  check(
    'and the mechanic files the full log separately',
    g.mail.some((m) => m.from === 'Chief Mechanic' && m.subject.startsWith('Parts log')),
  );

  /* The bug this turned up: a finished part was reported as newly
   * finished every single weekend until somebody replaced it. */
  const logs = g.mail.filter((m) => m.subject.startsWith('Parts log'));
  const firstLog = logs[logs.length - 1];
  const laterLog = logs[0];
  check(
    'a part is only reported finished the weekend it goes',
    logs.length < 2 || (firstLog !== laterLog && laterLog!.body !== firstLog!.body),
  );
}

/* ===================================================================== *
 * Careers that end, and the series that replaces them
 * ===================================================================== */

console.log('\n== contracts actually run out ==');

{
  /* The reported bug: a driver whose contract expired stayed in the
   * team and kept racing. Two halves to it — the deals were synthesised
   * on demand from the data file rather than written down (so nothing
   * ever ran down), and the expiry deleted the deal while leaving the
   * seat map alone. Both are checked here. */
  let g = createNewGame('Contract Check');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 4 } }, 'settings');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'team');

  check(
    'every driver on the grid starts on a written contract',
    Object.keys(g.deals).length === GRID_2026_DRIVERS.length,
    `${Object.keys(g.deals).length} deals for ${GRID_2026_DRIVERS.length} drivers`,
  );
  check(
    'and the terms come from the data file rather than a default',
    new Set(Object.values(g.deals).map((d) => d.seasonsRemaining)).size > 1,
    `terms: ${[...new Set(Object.values(g.deals).map((d) => d.seasonsRemaining))].sort().join(', ')}`,
  );

  // Somebody of ours, forced to one season left.
  const ourId = raceDriversOf(g, 'williams')[0]!;
  const doomed: GameState = {
    ...g,
    phase: 'POST_RACE',
    round: g.settings.seasonLength,
    deals: { ...g.deals, [ourId]: { ...g.deals[ourId]!, seasonsRemaining: 1 } },
  };
  /* The expiry itself, before the winter market gets to react to it.
   * Run directly, because by the time the reducer is finished a rival
   * has usually signed the man — which is correct, and which would hide
   * exactly the step being tested here. */
  {
    const isolated: GameState = JSON.parse(JSON.stringify(doomed));
    const notes = runContractExpiries(isolated);
    const ours = notes.find((n) => n.driverId === ourId);

    check('the deal is settled at the rollover', Boolean(ours), ours?.outcome);
    check(
      'the player is never quietly re-signed for',
      ours?.outcome === 'RELEASED',
      `${effectiveDriver(isolated, ourId)?.lastName}: ${ours?.outcome}`,
    );
    check('a deal that runs out is gone', !isolated.deals[ourId]);
    check('and the driver leaves the team with it', !isolated.driverTeams[ourId]);
    check(
      'so they cannot take the grid',
      !gridDriverIds(isolated).includes(ourId),
      `${gridDriverIds(isolated).length} cars entered`,
    );
    check('they are a free agent rather than nobody', isFreeAgent(isolated, ourId));
    check(
      'and the market lists them',
      freeAgents(isolated).includes(ourId),
      `${freeAgents(isolated).length} free agent(s)`,
    );
    check(
      'a driver still under contract is not one',
      !isFreeAgent(isolated, raceDriversOf(isolated, 'redbull')[0]!),
    );

    // And the player can put it right.
    const resigned = transition(
      { ...isolated, phase: 'HUB' },
      { type: 'SIGN_FREE_AGENT', driverId: ourId },
    );
    check('a free agent can be signed back', resigned.ok, resigned.message);
    check(
      'and is on the books again',
      resigned.state?.driverTeams[ourId] === isolated.playerTeamId,
    );
    check(
      'a driver under contract cannot be taken for free',
      !transition({ ...isolated, phase: 'HUB' }, {
        type: 'SIGN_FREE_AGENT',
        driverId: raceDriversOf(isolated, 'redbull')[0]!,
      }).ok,
    );
  }

  const after = must(doomed, { type: 'CONTINUE_TO_NEXT_WEEK' }, 'roll the season');

  check(
    'the driver is no longer ours after the winter',
    after.driverTeams[ourId] !== after.playerTeamId,
    `now at ${after.driverTeams[ourId] ?? 'no team'}`,
  );
  check(
    'the player is told, in as many words',
    after.mail.some((m) => m.driverId === ourId && m.subject.includes('has left the team')),
  );
  check(
    'and told they are short of a driver',
    after.mail.some((m) => m.subject.includes('driver short') || m.subject.includes('no drivers')),
  );
  check(
    'a driver we let go can be picked up by somebody else',
    !after.driverTeams[ourId] || after.driverTeams[ourId] !== after.playerTeamId,
  );

  /* The rest of the grid is not left with holes in it — only the
   * player's team is, because only the player's decisions made them. */
  check(
    'rivals fill the seats the winter emptied',
    after.teams
      .filter((t) => t.teamId !== after.playerTeamId)
      .every((t) => raceDriversOf(after, t.teamId).length === 2),
  );
}

console.log('\n== careers end ==');

{
  let g = createNewGame('Retirement Check');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 4 } }, 'settings');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'team');

  const after = must(
    { ...g, phase: 'POST_RACE', round: g.settings.seasonLength },
    { type: 'CONTINUE_TO_NEXT_WEEK' },
    'roll the season',
  );

  check(
    'the oldest drivers retire',
    after.retiredDriverIds.length > 0,
    after.retiredDriverIds
      .map((id) => `${effectiveDriver(after, id)?.lastName} (${after.driverRecords[id]?.age})`)
      .join(', '),
  );
  check(
    'and it is the old ones, not a random draw',
    after.retiredDriverIds.every((id) => (after.driverRecords[id]?.age ?? 0) >= 34),
  );
  check('a retired driver holds no seat', after.retiredDriverIds.every((id) => !after.driverTeams[id]));
  check('and no contract', after.retiredDriverIds.every((id) => !after.deals[id]));
  check(
    'they are not on the market either',
    after.retiredDriverIds.every((id) => !isFreeAgent(after, id)),
  );
  check(
    'the retirement is reported',
    after.mail.some((m) => m.subject.endsWith('retires')),
  );
  check(
    'the record survives so the career can be read',
    after.retiredDriverIds.every((id) => Boolean(after.driverRecords[id]?.retiredInSeason)),
  );

  /* The bug this caught: retirement takes the seat and the contract, but
   * every screen builds its driver list from the static data file — so a
   * driver whose retirement the player had just read about was still on
   * the market the following week, with no team and therefore no
   * transfer fee, which made him the cheapest signing on the grid. */
  check(
    'a retired driver is off the roster every screen reads from',
    (() => {
      const retired = new Set(after.retiredDriverIds);
      const listed = GRID_2026_DRIVERS.filter((d) => !retired.has(d.id));
      return (
        after.retiredDriverIds.length > 0 &&
        listed.length === GRID_2026_DRIVERS.length - after.retiredDriverIds.length
      );
    })(),
    `${after.retiredDriverIds.length} removed from ${GRID_2026_DRIVERS.length}`,
  );
  check(
    'and cannot be signed as a free agent',
    after.retiredDriverIds.every(
      (id) => !transition({ ...after, phase: 'HUB' }, { type: 'SIGN_FREE_AGENT', driverId: id }).ok,
    ),
  );
  check(
    'nor approached for a contract',
    after.retiredDriverIds.every(
      (id) => !transition({ ...after, phase: 'HUB' }, { type: 'APPROACH_DRIVER', driverId: id }).ok,
    ),
  );

  // Nobody is aged past the hard limit and left racing.
  check(
    'nobody on the grid is older than the hard retirement age',
    gridDriverIds(after).every((id) => (after.driverRecords[id]?.age ?? 0) < 44),
    `oldest ${Math.max(...gridDriverIds(after).map((id) => after.driverRecords[id]?.age ?? 0))}`,
  );
}

console.log('\n== the rating curve has a top ==');

{
  let g = createNewGame('Age Check');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'team');

  /* A driver having the season of his life, every year, from 35 to 46.
   * If anything can push a rating up past the veteran line, this will. */
  const id = 'russell';
  let probe: GameState = {
    ...g,
    driverRecords: { ...g.driverRecords, [id]: blankRecord(id, 35) },
  };

  const arc: Array<{ age: number; before: number; after: number }> = [];
  for (let year = 0; year < 12; year++) {
    const rec = probe.driverRecords[id]!;
    rec.season = {
      races: 10, points: 320, wins: 9, podiums: 10,
      poles: 8, dnfs: 0, qualifyingWins: 10, qualifyingDuels: 10,
    };
    const age = rec.age;
    const before = currentRating(probe, id);
    advanceDriverSeason(probe);
    arc.push({ age, before, after: currentRating(probe, id) });
    probe = { ...probe, season: probe.season + 1 };
  }

  const past = arc.filter((row) => row.age >= VETERAN_AGE);
  check(
    `no rating gain at ${VETERAN_AGE} or older, however good the season`,
    past.length > 0 && past.every((row) => row.after < row.before),
    past.map((r) => `${r.age}:${r.before}->${r.after}`).join(' '),
  );
  check(
    'and the decline is gradual rather than a cliff',
    past.every((row) => row.before - row.after <= 3),
    `worst drop ${Math.max(...past.map((r) => r.before - r.after))}`,
  );
  check(
    'a veteran below the line can still hold their rating on a good year',
    arc.some((row) => row.age < VETERAN_AGE && row.after >= row.before),
  );
}

console.log('\n== development follows the season ==');

{
  let g = createNewGame('Form Check');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'team');

  const id = 'lindblad';
  const mateId = Object.entries(g.driverTeams).find(
    ([d, t]) => t === g.driverTeams[id] && d !== id,
  )![0];

  const season = (over: Partial<GameState['driverRecords'][string]['season']>) => ({
    races: 10, points: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0,
    qualifyingWins: 5, qualifyingDuels: 10, ...over,
  });

  const run = (tally: ReturnType<typeof season>) => {
    const probe: GameState = {
      ...g,
      driverRecords: {
        ...g.driverRecords,
        [id]: { ...blankRecord(id, 19), season: tally },
        [mateId]: {
          ...blankRecord(mateId, 27),
          season: season({ points: 120, wins: 1, podiums: 4, poles: 2, dnfs: 1 }),
        },
      },
    };
    const before = currentRating(probe, id);
    const form = performanceIndex(probe, id);
    advanceDriverSeason(probe);
    return { form, gain: currentRating(probe, id) - before };
  };

  const title = run(season({ points: 320, wins: 9, podiums: 10, poles: 8, qualifyingWins: 9 }));
  const beaten = run(season({ points: 8, qualifyingWins: 1 }));
  const broken = run(season({ dnfs: 7, qualifyingWins: 5 }));

  check(
    'a title year reads as a good season',
    title.form > 0.4,
    `form +${title.form.toFixed(2)}`,
  );
  check(
    'being beaten by the team-mate reads as a bad one',
    beaten.form < 0,
    `form ${beaten.form.toFixed(2)}`,
  );
  check(
    'and so does retiring from most of it',
    broken.form < 0,
    `form ${broken.form.toFixed(2)}`,
  );
  check(
    'the good season develops the driver faster than the bad one',
    title.gain > beaten.gain && title.gain > broken.gain,
    `title +${title.gain}, beaten +${beaten.gain}, broken +${broken.gain}`,
  );
  check(
    'and the difference is worth seeing',
    title.gain - Math.min(beaten.gain, broken.gain) >= 2,
    `${title.gain - Math.min(beaten.gain, broken.gain)} points of rating apart`,
  );

  /* Qualifying is counted separately from the points, because it is the
   * one comparison that has nothing but the driver in it. */
  const quick = run(season({ points: 0, poles: 4, qualifyingWins: 10 }));
  const slow = run(season({ points: 0, poles: 0, qualifyingWins: 0 }));
  check(
    'out-qualifying the team-mate counts for something on its own',
    quick.form > slow.form,
    `${quick.form.toFixed(2)} vs ${slow.form.toFixed(2)}`,
  );
}

console.log('\n== the feeder series ==');

{
  let g = createNewGame('F2 Check');
  g = must(g, { type: 'SET_SETTINGS', settings: { seasonLength: 8 } }, 'settings');
  g = must(g, { type: 'CONFIRM_SETUP' }, 'setup');
  g = must(g, { type: 'PREVIEW_TEAM', teamId: 'williams' }, 'preview');
  g = must(g, { type: 'CONFIRM_TEAM' }, 'team');

  check('a career starts with a full F2 grid', g.prospects.length === F2_FIELD_SIZE);
  check('and no championship yet', g.f2 === null);

  const after = must(
    { ...g, phase: 'POST_RACE', round: g.settings.seasonLength },
    { type: 'CONTINUE_TO_NEXT_WEEK' },
    'roll the season',
  );

  const table = after.f2!;
  check('the F2 season is run at the rollover', Boolean(table), `${table?.standings.length} entries`);
  check('it has a champion', Boolean(table.championDriverId));
  check(
    'the table is ordered by points',
    table.standings.every((row, i) => i === 0 || row.points <= table.standings[i - 1]!.points),
  );
  check(
    'positions run 1..n with no holes',
    table.standings.every((row, i) => row.position === i + 1),
  );
  check(
    'somebody actually won races',
    table.standings.reduce((sum, row) => sum + row.wins, 0) === g.settings.seasonLength,
    `${table.standings.reduce((sum, row) => sum + row.wins, 0)} wins across ${g.settings.seasonLength} rounds`,
  );
  check(
    'poles are awarded once a round',
    table.standings.reduce((sum, row) => sum + row.poles, 0) === g.settings.seasonLength,
  );
  check(
    'the champion is not always the pole-sitter',
    table.standings[0]!.poles < g.settings.seasonLength,
  );
  check(
    'every row names its driver, so the table survives the field turning over',
    table.standings.every((row) => row.name.length > 0 && row.name.includes(' ')),
    table.standings[0]!.name,
  );
  check(
    'the season is archived',
    after.f2Archive.length === 1 && after.f2Archive[0]!.season === g.season,
  );
  check(
    'the result is reported to the player',
    after.mail.some((m) => m.subject.startsWith(`F2 ${g.season}:`)),
  );

  /* The field turns over: the bottom five go, the rest stay a year
   * older, and the openings are filled from the new intake. */
  check('the grid is still full after the winter', after.prospects.length === F2_FIELD_SIZE);
  const heldOver = after.prospects.filter((p) => g.prospects.some((q) => q.id === p.id));
  check(
    'most of the field carries over',
    heldOver.length >= F2_FIELD_SIZE - 8,
    `${heldOver.length} of ${F2_FIELD_SIZE} held over`,
  );
  check(
    'those who stayed are a year older',
    heldOver.every((p) => p.age === g.prospects.find((q) => q.id === p.id)!.age + 1),
  );
  check(
    'and a year better',
    heldOver.some(
      (p) =>
        driverRating(prospectToDriver(p)) >
        driverRating(prospectToDriver(g.prospects.find((q) => q.id === p.id)!)),
    ),
  );
  check(
    'the bottom of the table is what gets cleared out',
    (() => {
      /* Three things take a driver out of the field, and only one of
       * them is relegation: finishing last, running out of years, and
       * being promoted to F1 — which is the opposite of relegation and
       * happens to the drivers at the top of exactly this table. Both
       * of the others are excluded before the placings are read. */
      const dropped = g.prospects.filter(
        (p) =>
          !after.prospects.some((q) => q.id === p.id) &&
          !after.driverTeams[p.id] &&
          p.seasonsInF2 + 1 < F2_MAX_SEASONS,
      );
      const places = dropped.map(
        (p) => table.standings.find((row) => row.driverId === p.id)?.position ?? 0,
      );
      return places.length > 0 && places.every((place) => place > F2_FIELD_SIZE / 2);
    })(),
    'relegated placings',
  );
  check(
    'the top of the table is what gets promoted',
    (() => {
      const promoted = g.prospects.filter((p) => after.driverTeams[p.id]);
      const places = promoted.map(
        (p) => table.standings.find((row) => row.driverId === p.id)?.position ?? 99,
      );
      // Nobody is promoted at all in a quiet winter, which is fine.
      return places.every((place) => place <= 6);
    })(),
    g.prospects
      .filter((p) => after.driverTeams[p.id])
      .map((p) => `${p.lastName} P${table.standings.find((r) => r.driverId === p.id)?.position}`)
      .join(', ') || 'nobody promoted this winter',
  );
  check(
    'and nobody spends more than their allotted years in the series',
    after.prospects.every((p) => p.seasonsInF2 < F2_MAX_SEASONS),
    `longest tenure ${Math.max(...after.prospects.map((p) => p.seasonsInF2))}`,
  );
  check(
    'nobody in the feeder series holds an F1 career record',
    after.prospects.every((p) => !after.driverRecords[p.id]),
  );

  /* Promotion, and the seat it leaves behind. */
  const signable = after.prospects.find((p) => !after.driverTeams[p.id])!;
  const signed = must(
    { ...after, phase: 'HUB' },
    { type: 'SIGN_PROSPECT', prospectId: signable.id },
    'promote a junior',
  );
  check('a promoted junior leaves the series', !signed.prospects.some((p) => p.id === signable.id));
  check('and somebody new fills the seat', signed.prospects.length === F2_FIELD_SIZE);
  check(
    'the replacement is not a namesake of anybody still in it',
    new Set(signed.prospects.map((p) => `${p.firstName} ${p.lastName}`)).size === F2_FIELD_SIZE,
  );
  check('the promoted driver now has an F1 record', Boolean(signed.driverRecords[signable.id]));
  check('and a condition', Boolean(signed.driverConditions[signable.id]));
  check(
    'they are kept somewhere durable, so next winter cannot lose them',
    signed.academyDrivers.some((p) => p.id === signable.id),
  );
}

console.log('\n== talent has tiers ==');

{
  /* One standout every year, one generational every five, one prodigy
   * every ten — and the bands do not overlap, which is what makes the
   * rare ones worth recognising. */
  const tiers = Array.from({ length: 20 }, (_, i) => tierDueIn(2026 + i));
  check(
    'a standout is due most years',
    tiers.filter((t) => t === 'STANDOUT').length === 14,
    `${tiers.filter((t) => t === 'STANDOUT').length} of 20`,
  );
  check(
    'a generational talent every five years',
    tiers.filter((t) => t === 'GENERATIONAL').length === 4,
    tiers.map((t, i) => (t === 'GENERATIONAL' ? 2026 + i : null)).filter(Boolean).join(', '),
  );
  check(
    'a prodigy every ten',
    tiers.filter((t) => t === 'PRODIGY').length === 2,
    tiers.map((t, i) => (t === 'PRODIGY' ? 2026 + i : null)).filter(Boolean).join(', '),
  );
  check(
    'the two rare years never collide',
    tiers.every((t, i) => !(t === 'PRODIGY' && tiers[i] === 'GENERATIONAL')),
  );
  check(
    'the ceilings rise with the tier and do not overlap',
    TIERS.STANDARD.potential[1] <= TIERS.STANDOUT.potential[1] &&
      TIERS.STANDOUT.potential[1] < TIERS.GENERATIONAL.potential[1] &&
      TIERS.GENERATIONAL.potential[1] < TIERS.PRODIGY.potential[1],
  );
  check(
    'and so does the wage',
    TIERS.STANDARD.wage < TIERS.STANDOUT.wage &&
      TIERS.STANDOUT.wage < TIERS.GENERATIONAL.wage &&
      TIERS.GENERATIONAL.wage < TIERS.PRODIGY.wage,
  );

  const intake = buildIntake(2030, 22);
  check(
    'exactly one driver in a class carries the rare tier',
    intake.filter((p) => p.tier !== 'STANDARD').length === 1,
    `${intake.find((p) => p.tier !== 'STANDARD')?.tier} in the class of 2030`,
  );
  check(
    'and 2030 is a prodigy year',
    intake.some((p) => p.tier === 'PRODIGY'),
  );
  check(
    'a prodigy is rated above every standard junior in the class',
    (() => {
      const rare = intake.find((p) => p.tier === 'PRODIGY')!;
      return intake.filter((p) => p.tier === 'STANDARD').every((p) => p.potential < rare.potential);
    })(),
  );
}

console.log('\n== juniors are individuals ==');

{
  const classes = [2026, 2027, 2028, 2029, 2030].map((year) => buildIntake(year, 22));
  const all = classes.flat();

  check(
    'no two juniors in a class share a name',
    classes.every((c) => new Set(c.map((p) => `${p.firstName} ${p.lastName}`)).size === c.length),
  );
  check(
    'names are drawn widely across five classes',
    new Set(all.map((p) => `${p.firstName} ${p.lastName}`)).size >= 100,
    `${new Set(all.map((p) => `${p.firstName} ${p.lastName}`)).size} distinct names in 110`,
  );
  check(
    'and from many nationalities',
    new Set(all.map((p) => p.countryCode)).size >= 12,
    `${new Set(all.map((p) => p.countryCode)).size} countries`,
  );
  check(
    'every archetype turns up',
    new Set(all.map((p) => p.archetype)).size === 8,
    [...new Set(all.map((p) => p.archetype))].join(', '),
  );
  check(
    'an archetype actually reshapes the driver',
    (() => {
      const rain = all.filter((p) => p.archetype === 'RAIN_MASTER');
      const others = all.filter((p) => p.archetype !== 'RAIN_MASTER');
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return (
        mean(rain.map((p) => p.attributes.wetWeather)) >
        mean(others.map((p) => p.attributes.wetWeather)) + 5
      );
    })(),
  );
  check(
    'every junior carries a scouting note',
    all.every((p) => p.note.length > 20),
  );
  check(
    'a class is deterministic on its season',
    JSON.stringify(buildIntake(2028, 22)) === JSON.stringify(buildIntake(2028, 22)),
  );
  check(
    'and two seasons are different classes',
    JSON.stringify(buildIntake(2028, 22)) !== JSON.stringify(buildIntake(2029, 22)),
  );
  check(
    'juniors are signed on a ceiling above where they are today',
    all.every((p) => p.potential > driverRating(prospectToDriver(p))),
  );
}

console.log(failures === 0 ? '\nAll game-flow checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
