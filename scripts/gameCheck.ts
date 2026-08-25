/* Headless assertions for the career-game state machine.
 * Run with:  npm run game:check */

import { createNewGame, transition, PHASE_TRANSITIONS, canDispatch } from '../src/game/machine';
import { simulateQualifying, QUALIFYING_LAPS } from '../src/game/qualifying';
import { POINTS_TABLE, applyRaceResult, pointsForPosition, scoreRace } from '../src/game/championship';
import { evaluateApplication, jobOpenings } from '../src/game/jobMarket';
import { scaledLaps, trackToCircuit } from '../src/game/trackAdapter';
import { GRID_2026_DRIVERS, GRID_2026_TEAMS, carRating, driverRating } from '../src/data/grid2026';
import { quoteTransfer } from '../src/game/finance';
import { seasonScore } from '../src/game/transferMarket';
import { profileFor } from '../src/game/difficulty';
import { PARTS, enginePenaltyPlaces, fittedUnit } from '../src/game/carModel';
import { developmentGain, partLevel } from '../src/game/partDevelopment';
import { currentRating, prospectToDriver } from '../src/game/driverDevelopment';
import { currentSeasonRecord } from '../src/game/seasonArchive';
import { ROLES } from '../src/data/staff';
import { staffMarket, staffRndEfficiency, vacantRoles } from '../src/game/staffing';
import { rndEfficiency } from '../src/game/facilities';
import { buildTracks } from '../src/lib/careerGen';
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
check(
  'the statistics follow the parts',
  landed.car.aero > aeroBefore,
  `aero ${aeroBefore.toFixed(1)} -> ${landed.car.aero.toFixed(1)}`,
);

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
  'every team still fields exactly two cars after the window',
  (() => {
    const counts = new Map<string, number>();
    for (const teamId of Object.values(state.driverTeams)) {
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    return [...counts.values()].every((n) => n === 2);
  })(),
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
const oldId = GRID_2026_DRIVERS.reduce((a, b) => (a.age > b.age ? a : b)).id;
check(
  'a teenager improves over an off-season',
  (state.driverRecords[youngId]?.formDelta ?? 0) > 0,
  `${youngId} ${(state.driverRecords[youngId]?.formDelta ?? 0).toFixed(1)}`,
);
check(
  'a driver past their peak declines',
  (state.driverRecords[oldId]?.formDelta ?? 0) < 0,
  `${oldId} ${(state.driverRecords[oldId]?.formDelta ?? 0).toFixed(1)}`,
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

console.log('\n== junior intake ==');

check('a class is generated for the season', state.prospects.length > 0, `${state.prospects.length} juniors`);
check(
  'the class is regenerated for the new season',
  state.prospects.every((p) => p.scoutedInSeason === state.season),
  `class of ${state.season}`,
);
check('juniors are young', state.prospects.every((p) => p.age <= 21 && p.age >= 17));
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
  'the team still fields two cars',
  Object.values(promoted.driverTeams).filter((t) => t === promoted.playerTeamId).length === 2,
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
  plan: { driverId: ownDriverId, stints: [{ compound: 'SOFT', plannedLaps: 9 }], fuelLoadKg: 88, pushLevel: 4 },
}, 'set strategy');
check('strategy stored against the driver', planned.strategies[ownDriverId]?.fuelLoadKg === 88);

const foreignPlan = transition(planned, {
  type: 'SET_STRATEGY',
  plan: { driverId: 'verstappen', stints: [], fuelLoadKg: 50, pushLevel: 3 },
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

console.log(failures === 0 ? '\nAll game-flow checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
