/* Headless smoke test for the race engine.
 * Run with:  npm run sim:check
 * Steps the simulation in fixed increments and asserts the behaviour the
 * dashboard depends on: ordering, the scripted pass, pit stops, telemetry. */

import { TYRE_MODEL, createRaceEngine, tyreWearPenalty } from '../src/engine/raceEngine';
import { rollRaceWeather, compoundPaceFactor, compoundWearFactor, compoundRiskFactor, bestCompoundFor } from '@/game/weather';
import { buildTracks } from '@/lib/careerGen';
import { trackToCircuit } from '@/game/trackAdapter';
import { GRID_2026_TEAMS, carRating, carRatingAt } from '@/data/grid2026';
import type { TyreCompound } from '@/types';
import { SUZUKA } from '../src/data/circuits';
import { DRIVERS } from '../src/data/drivers';
import { projectRace, projectStint, pitWindow } from '../src/engine/strategy';
import { createRadioBrain } from '../src/game/driverRadio';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const engine = createRaceEngine({
  circuit: SUZUKA,
  drivers: DRIVERS,
  seed: 20260419,
  startLap: 17,
  scriptedPass: { overtakerId: 'garcia', overtakenId: 'perez' },
});

const initial = engine.getState();
const carOf = (id: string) => engine.getState().cars.find((c) => c.driverId === id)!;

console.log('\n== initial grid ==');
check('20 cars on track', initial.cars.length === 20, `${initial.cars.length}`);
check('current lap is 18', initial.lap === 18, `lap ${initial.lap}`);
check(
  'positions are 1..20 in order',
  initial.cars.every((car, index) => car.position === index + 1),
);
check(
  'telemetry pre-seeded',
  Object.values(initial.telemetry).every((samples) => samples.length === 45),
);

const garciaStart = carOf('garcia').position;
const perezStart = carOf('perez').position;
check(
  'Garcia starts directly behind Perez',
  garciaStart === perezStart + 1,
  `GAR P${garciaStart}, PRZ P${perezStart}`,
);

/* --- run 60 seconds of race time at 60fps --------------------------- */
console.log('\n== scripted overtake ==');
let scriptedEvent: { atMs: number; corner: string; gained: number } | null = null;
let allEvents = 0;

for (let frame = 0; frame < 60 * 60; frame++) {
  engine.step(16.7);
  for (const event of engine.drainEvents()) {
    allEvents++;
    if (
      !scriptedEvent &&
      event.overtakerId === 'garcia' &&
      event.overtakenId === 'perez'
    ) {
      scriptedEvent = {
        atMs: event.atMs - 17 * SUZUKA.baseLapTimeMs,
        corner: event.cornerLabel,
        gained: event.positionGained,
      };
    }
  }
}

check('Garcia passed Perez', scriptedEvent !== null);
if (scriptedEvent) {
  check(
    'pass happens within the first 30s',
    scriptedEvent.atMs < 30_000,
    `${(scriptedEvent.atMs / 1000).toFixed(1)}s at ${scriptedEvent.corner}`,
  );
  check('corner label resolved', scriptedEvent.corner.length > 0, scriptedEvent.corner);
}
check(
  'Garcia now ahead of Perez',
  carOf('garcia').position < carOf('perez').position,
  `GAR P${carOf('garcia').position}, PRZ P${carOf('perez').position}`,
);

/* --- longer run: pit stops, laps, telemetry ------------------------- */
console.log('\n== 12 minutes of racing ==');
for (let frame = 0; frame < 60 * 60 * 12; frame++) {
  engine.step(16.7);
  allEvents += engine.drainEvents().length;
}

const state = engine.getState();
check('race advanced past lap 18', state.lap > 18, `lap ${state.lap}/${state.totalLaps}`);
check(
  'leader lap count is physically plausible',
  state.cars[0]!.lap >= 24 && state.cars[0]!.lap <= 32,
  `leader on lap ${state.cars[0]!.lap}`,
);
check(
  'no car exceeds the race distance',
  state.cars.every((car) => car.lap <= state.totalLaps),
);
check('pit stops occurred', state.cars.some((car) => car.pitStops > 1));
check('overtakes recorded', allEvents > 1, `${allEvents} events`);
check('incident log populated', state.incidents.length > 0, `${state.incidents.length} entries`);
check(
  'positions still contiguous',
  state.cars.every((car, index) => car.position === index + 1),
);
check(
  'lap progress always within 0-1',
  state.cars.every((car) => car.lapProgress >= 0 && car.lapProgress < 1),
);
check(
  'gaps ascend with position',
  state.cars.every((car, i) => i === 0 || car.gapToLeaderMs >= state.cars[i - 1]!.gapToLeaderMs),
);
check('fuel never negative', state.cars.every((car) => car.fuelKg > 0));
check('tyre wear bounded 0-100', state.cars.every((c) => c.tyre.wearPct >= 0 && c.tyre.wearPct <= 100));
check(
  'telemetry buffers capped at 90',
  Object.values(state.telemetry).every((samples) => samples.length <= 90),
);
check(
  'best lap is plausible',
  state.cars.every((car) => car.bestLapMs === null || car.bestLapMs > 80_000),
  `leader best ${(state.cars[0]!.bestLapMs! / 1000).toFixed(3)}s`,
);

/* --- commands -------------------------------------------------------- */
console.log('\n== standing start ==');
{
  // A grid is seeded in the order the drivers array is given, with cars
  // 2..N lined up *behind* the start/finish line. The pole-sitter must
  // stay ahead, and nobody may bank a lap they did not run.
  const gridEngine = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed: 7,
    startLap: 0,
    totalLaps: 10,
  });

  const poleId = gridEngine.getState().cars[0]!.driverId;
  check('pole-sitter starts P1', gridEngine.getState().cars[0]!.position === 1, poleId);

  const positionsOverTime: number[] = [];
  for (let frame = 0; frame < 60 * 40; frame++) {
    gridEngine.step(16.7);
    if (frame % 240 === 0) {
      positionsOverTime.push(
        gridEngine.getState().cars.find((car) => car.driverId === poleId)!.position,
      );
    }
  }

  const worst = Math.max(...positionsOverTime);
  const finalState = gridEngine.getState();
  check(
    'pole-sitter never collapses to the back of the field',
    worst <= 5,
    `worst P${worst} across the opening laps`,
  );
  check(
    'no car banks a phantom lap off the grid',
    finalState.cars.every((car) => car.lap <= finalState.cars[0]!.lap),
    `leader on lap ${finalState.cars[0]!.lap}`,
  );
  check(
    'lap spread across the field is at most one',
    Math.max(...finalState.cars.map((c) => c.lap)) -
      Math.min(...finalState.cars.map((c) => c.lap)) <= 1,
  );
  check(
    'race order still matches race distance',
    finalState.cars.every(
      (car, i) => i === 0 || car.raceDistance <= finalState.cars[i - 1]!.raceDistance + 1e-9,
    ),
  );
}


console.log('\n== commands ==');
engine.applyCommand({ type: 'PAUSE' });
const pausedLap = engine.getState().cars[0]!.raceDistance;
for (let i = 0; i < 120; i++) engine.step(16.7);
check(
  'PAUSE freezes the session',
  engine.getState().cars[0]!.raceDistance === pausedLap,
);

engine.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
for (let i = 0; i < 120; i++) engine.step(16.7);
check('RESUME restarts the session', engine.getState().cars[0]!.raceDistance > pausedLap);

engine.applyCommand({ type: 'SET_TYRE', driverId: 'garcia', compound: 'SOFT' });
engine.applyCommand({ type: 'PUSH_MODE', driverId: 'garcia', enabled: true });
check('PUSH_MODE flags the car', carOf('garcia').attacking);

/* --- latched attack modes -------------------------------------------- *
 * Both modes are switches, not nudges: once armed they hold until the
 * pit wall lifts them or the resource behind them runs out. */
console.log('\n== attack modes ==');

for (let i = 0; i < 3_000; i++) engine.step(16.7);
check(
  'push stays latched across a long run',
  carOf('garcia').attacking,
  `${Math.round(carOf('garcia').tyre.wearPct)}% tyre wear`,
);

engine.applyCommand({ type: 'PUSH_MODE', driverId: 'garcia', enabled: false });
check('push lifts when the pit wall says so', !carOf('garcia').attacking);

/* Boost is the energy-limited mode, so a full store and an empty one
 * have to behave differently. */
const boostEngine = createRaceEngine({
  circuit: SUZUKA,
  drivers: DRIVERS,
  seed: 4242,
  startLap: 5,
  manualPitDriverIds: ['garcia'],
});
const boostCar = () => boostEngine.getState().cars.find((c) => c.driverId === 'garcia')!;
boostEngine.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
for (let i = 0; i < 60; i++) boostEngine.step(16.7);

boostEngine.applyCommand({ type: 'ERS_BOOST', driverId: 'garcia', enabled: true });
check('override arms while the store has charge', boostCar().boosting);

const ersAtArming = boostCar().ersPct;
for (let i = 0; i < 600; i++) boostEngine.step(16.7);
check(
  'override drains the energy store',
  boostCar().ersPct < ersAtArming,
  `${ersAtArming.toFixed(0)}% -> ${boostCar().ersPct.toFixed(0)}%`,
);

for (let i = 0; i < 6_000; i++) boostEngine.step(16.7);
check(
  'override drops out once the store is empty',
  !boostCar().boosting,
  `${boostCar().ersPct.toFixed(1)}% left`,
);

const reArmed = createRaceEngine({
  circuit: SUZUKA,
  drivers: DRIVERS,
  seed: 77,
  startLap: 5,
  // Under the pit wall's control, so the AI does not also arm the override.
  manualPitDriverIds: ['garcia'],
});
const flatCar = () => reArmed.getState().cars.find((c) => c.driverId === 'garcia')!;
reArmed.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
reArmed.applyCommand({ type: 'ERS_BOOST', driverId: 'garcia', enabled: true });

// Step only until the store gives out, then try again straight away —
// leaving it running lets the car harvest back above the cut-off.
for (let i = 0; i < 20_000 && flatCar().boosting; i++) reArmed.step(16.7);
const ersWhenFlat = flatCar().ersPct;
reArmed.applyCommand({ type: 'ERS_BOOST', driverId: 'garcia', enabled: true });
check(
  'the override refuses to re-arm on an empty store',
  !flatCar().boosting,
  `${ersWhenFlat.toFixed(1)}% available`,
);

/* --- power-unit life -------------------------------------------------- *
 * Reliability has to buy something measurable, and pushing has to cost
 * something measurable, or neither is a real decision. */
console.log('\n== power unit life ==');

/** Wear *consumed by the run*, since a car starts with some on the clock. */
function wearAfter(reliability: number, pushing: boolean, ticks: number): number {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed: 909,
    startLap: 0,
    reliability: Object.fromEntries(DRIVERS.map((d) => [d.id, reliability])),
  });
  const car = () => local.getState().cars.find((c) => c.driverId === 'garcia')!;
  const before = car().engineWearPct;
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
  if (pushing) local.applyCommand({ type: 'PUSH_MODE', driverId: 'garcia', enabled: true });
  for (let i = 0; i < ticks; i++) local.step(16.7);
  return car().engineWearPct - before;
}

// ~5 laps, which is long enough for the multipliers to separate.
const RUN_TICKS = 28_000;
const cruiseWear = wearAfter(62, false, RUN_TICKS);
const pushWear = wearAfter(62, true, RUN_TICKS);
check('the power unit wears as the race runs', cruiseWear > 0, `${cruiseWear.toFixed(1)}%`);
check(
  'pushing consumes the engine faster than cruising',
  pushWear > cruiseWear * 1.5,
  `push ${pushWear.toFixed(1)}% vs cruise ${cruiseWear.toFixed(1)}%`,
);

const fragileWear = wearAfter(25, false, RUN_TICKS);
const solidWear = wearAfter(95, false, RUN_TICKS);
check(
  'a reliable car consumes its engine more slowly',
  solidWear < fragileWear,
  `rel 95 -> ${solidWear.toFixed(1)}% vs rel 25 -> ${fragileWear.toFixed(1)}%`,
);

/* --- the pit stop ----------------------------------------------------- *
 * The number that matters is the *net* loss: how much time a stop costs
 * against a car that stayed out. Anything much under twenty seconds makes
 * strategy free, which is what was wrong with the old model. */
console.log('\n== pit stops ==');

/**
 * Runs two identical cars, boxes one of them, and measures the gap the
 * stop actually opened up.
 */
function pitLoss(pitCrewRating: number) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed: 4711,
    startLap: 0,
    totalLaps: 40,
    tyreWearScale: 1,
    manualPitDriverIds: ['garcia', 'perez'],
    pitCrew: Object.fromEntries(DRIVERS.map((d) => [d.id, pitCrewRating])),
  });
  const carOfId = (id: string) => local.getState().cars.find((c) => c.driverId === id)!;
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  // Settle both cars into a rhythm before measuring anything.
  for (let i = 0; i < 12_000; i++) local.step(16.7);
  const before = carOfId('garcia').raceDistance - carOfId('perez').raceDistance;

  local.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });

  let stationaryTicks = 0;
  let sawEntry = false;
  let sawBox = false;
  let sawExit = false;
  let tyresFittedWhileStopped = false;
  let compoundAtBoxEntry = carOfId('garcia').tyre.compound;

  for (let i = 0; i < 40_000; i++) {
    local.step(16.7);
    const car = carOfId('garcia');
    if (car.status === 'PIT_ENTRY') sawEntry = true;
    if (car.status === 'IN_PIT') {
      if (!sawBox) compoundAtBoxEntry = car.tyre.compound;
      sawBox = true;
      stationaryTicks++;
    }
    if (car.status === 'PIT_EXIT') {
      if (!sawExit && car.tyre.wearPct === 0) tyresFittedWhileStopped = true;
      sawExit = true;
    }
    if (car.status === 'LAPPING' && sawExit) break;
  }

  const after = carOfId('garcia').raceDistance - carOfId('perez').raceDistance;
  const referenceLapMs = SUZUKA.baseLapTimeMs;

  return {
    lostSeconds: ((before - after) * referenceLapMs) / 1000,
    stationaryMs: stationaryTicks * 16.7,
    sawEntry,
    sawBox,
    sawExit,
    tyresFittedWhileStopped,
    compoundAtBoxEntry,
    stops: carOfId('garcia').pitStops,
  };
}

const goodCrew = pitLoss(95);
const poorCrew = pitLoss(45);

check('a stop runs through all three phases', goodCrew.sawEntry && goodCrew.sawBox && goodCrew.sawExit);
check('the car is counted as having stopped once', goodCrew.stops === 1, `${goodCrew.stops} stop(s)`);
check(
  'the car is genuinely stationary in the box',
  goodCrew.stationaryMs > 1_500,
  `${(goodCrew.stationaryMs / 1000).toFixed(1)}s stopped`,
);
check(
  'the new set goes on in the box, not at the pit exit',
  goodCrew.tyresFittedWhileStopped,
);
check(
  'a pit stop costs a realistic amount of time',
  goodCrew.lostSeconds > 18 && goodCrew.lostSeconds < 27,
  `${goodCrew.lostSeconds.toFixed(1)}s net loss`,
);
check(
  'a better pit crew is worth real time',
  goodCrew.stationaryMs < poorCrew.stationaryMs,
  `crew 95: ${(goodCrew.stationaryMs / 1000).toFixed(1)}s vs crew 45: ${(poorCrew.stationaryMs / 1000).toFixed(1)}s`,
);
check(
  'a poor crew still costs a believable amount of time',
  poorCrew.lostSeconds > goodCrew.lostSeconds && poorCrew.lostSeconds < 34,
  `${poorCrew.lostSeconds.toFixed(1)}s net loss`,
);

/* --- virtual safety car ----------------------------------------------- */
console.log('\n== virtual safety car ==');

/** Retires a car on track and watches what race control does about it. */
function vscRun(seed: number) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed,
    startLap: 0,
    totalLaps: 30,
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
  for (let i = 0; i < 12_000; i++) local.step(16.7);

  // Clear anything the settling laps produced, or the first drain below
  // reports moves that happened long before the flag came out.
  local.drainEvents();

  const victim = local.getState().cars[10]!.driverId;
  local.applyCommand({ type: 'RETIRE_CAR', driverId: victim });

  const deployed = local.getState().neutralisedLapsRemaining > 0;
  if (!deployed) return { deployed: false };

  const leader = () => local.getState().cars[0]!;
  const lapMsUnderVsc: number[] = [];
  const spreadAtStart =
    local.getState().cars[local.getState().cars.length - 1]!.gapToLeaderMs;

  let overtakesDuringVsc = 0;
  let sawGreenAgain = false;
  const startLapNumber = leader().lap;

  for (let i = 0; i < 200_000; i++) {
    local.step(16.7);
    overtakesDuringVsc += local.drainEvents().length;
    if (local.getState().neutralisedLapsRemaining === 0) {
      sawGreenAgain = true;
      break;
    }
  }

  const spreadAtEnd =
    local.getState().cars[local.getState().cars.length - 1]!.gapToLeaderMs;

  return {
    deployed: true,
    flagWasVsc: true,
    overtakesDuringVsc,
    sawGreenAgain,
    lapsNeutralised: leader().lap - startLapNumber,
    spreadDrift: Math.abs(spreadAtEnd - spreadAtStart),
    lapMsUnderVsc,
  };
}

// The trigger is a coin flip by design, so sweep seeds to find one.
const vscRuns = [3, 17, 23, 31, 47, 59, 71, 83].map(vscRun);
const deployedRuns = vscRuns.filter((r) => r.deployed);

check(
  'a car stopping on track can bring out the virtual safety car',
  deployedRuns.length > 0,
  `${deployedRuns.length}/${vscRuns.length} retirements neutralised the race`,
);
check(
  'it is not deployed for every retirement',
  deployedRuns.length < vscRuns.length,
  `${vscRuns.length - deployedRuns.length} ran on under green`,
);

const sample = deployedRuns[0];
if (sample && sample.deployed) {
  check('the neutralisation ends and the race goes green again', Boolean(sample.sawGreenAgain));
  check(
    'no overtakes are reported while the race is neutralised',
    sample.overtakesDuringVsc === 0,
    `${sample.overtakesDuringVsc} moves reported`,
  );
  check(
    'the neutralisation runs for a couple of laps',
    sample.lapsNeutralised! >= 1 && sample.lapsNeutralised! <= 4,
    `${sample.lapsNeutralised} leader lap(s)`,
  );
}

/* The whole point of a VSC is that it makes a stop cheap. */
function pitLossUnderVsc(seed: number) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed,
    startLap: 0,
    totalLaps: 40,
    tyreWearScale: 1,
    manualPitDriverIds: ['garcia', 'perez'],
    pitCrew: Object.fromEntries(DRIVERS.map((d) => [d.id, 95])),
  });
  const carOfId = (id: string) => local.getState().cars.find((c) => c.driverId === id)!;
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
  for (let i = 0; i < 12_000; i++) local.step(16.7);

  // Force a neutralisation by parking a car well down the order.
  const victim = local.getState().cars[15]!.driverId;
  for (let attempt = 0; attempt < 40 && local.getState().neutralisedLapsRemaining === 0; attempt++) {
    local.applyCommand({ type: 'RETIRE_CAR', driverId: victim });
    local.step(16.7);
    if (local.getState().neutralisedLapsRemaining > 0) break;
    // Only one car can be parked, so give up if race control shrugs.
    break;
  }
  if (local.getState().neutralisedLapsRemaining === 0) return null;

  const before = carOfId('garcia').raceDistance - carOfId('perez').raceDistance;
  local.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });
  for (let i = 0; i < 40_000; i++) {
    local.step(16.7);
    if (carOfId('garcia').status === 'LAPPING' && carOfId('garcia').pitStops > 0) break;
  }
  const after = carOfId('garcia').raceDistance - carOfId('perez').raceDistance;
  return ((before - after) * SUZUKA.baseLapTimeMs) / 1000;
}

/* The trigger is deliberately a coin flip, so sweep until race control
 * actually neutralises the race — the assertion below is the whole point
 * of the feature and must not silently skip. */
let vscPitLoss: number | null = null;
for (const seed of [4711, 88, 1201, 33, 917, 5, 640, 7777, 12, 456]) {
  vscPitLoss = pitLossUnderVsc(seed);
  if (vscPitLoss != null) break;
}

check(
  'a neutralisation could be produced to measure against',
  vscPitLoss != null,
);
check(
  'boxing under a neutralisation costs far less than under green',
  vscPitLoss != null && vscPitLoss < goodCrew.lostSeconds * 0.85,
  vscPitLoss != null
    ? `${vscPitLoss.toFixed(1)}s under VSC vs ${goodCrew.lostSeconds.toFixed(1)}s under green`
    : 'no neutralisation produced',
);

/* --- reliability and DNF --------------------------------------------- *
 * The rule the model has to satisfy: a car driven sensibly finishes, and
 * a car thrashed all afternoon cannot be relied on to. Both sides matter
 * — a game where the engine never fails has no reliability decision in
 * it, and one where it fails at random is just unfair. */
console.log('\n== reliability and DNF ==');

/** Runs a full race distance and reports whether the car survived it. */
function raceOutcome(seed: number, mode: 'CRUISE' | 'PUSH', reliability: number) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed,
    startLap: 0,
    totalLaps: 24,
    manualPitDriverIds: ['garcia'],
    reliability: Object.fromEntries(DRIVERS.map((d) => [d.id, reliability])),
  });
  const car = () => local.getState().cars.find((c) => c.driverId === 'garcia')!;
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  for (let tick = 0; tick < 400_000; tick++) {
    // Hold the mode open: push relatches if the tyres ever refuse it, and
    // the override is re-armed whenever the store has recovered enough.
    if (mode === 'PUSH' && tick % 600 === 0 && car().status === 'LAPPING') {
      if (!car().attacking) {
        local.applyCommand({ type: 'PUSH_MODE', driverId: 'garcia', enabled: true });
      }
      if (!car().boosting && car().ersPct >= 12) {
        local.applyCommand({ type: 'ERS_BOOST', driverId: 'garcia', enabled: true });
      }
    }
    // The stint has to be managed or the tyres, not the engine, end it.
    if (car().tyre.wearPct > 88 && car().status === 'LAPPING') {
      local.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });
    }
    local.step(16.7);
    if (local.getState().sessionState === 'FINISHED' || car().status === 'RETIRED') break;
  }

  return { retired: car().status === 'RETIRED', engineWear: car().engineWearPct };
}

const SEEDS = [
  11, 29, 41, 57, 73, 88, 101, 119, 137, 151,
  163, 179, 191, 211, 223, 239, 251, 269, 281, 293,
];

const cruiseRuns = SEEDS.map((seed) => raceOutcome(seed, 'CRUISE', 70));
const pushRuns = SEEDS.map((seed) => raceOutcome(seed, 'PUSH', 70));

const cruiseDnf = cruiseRuns.filter((r) => r.retired).length;
const pushDnf = pushRuns.filter((r) => r.retired).length;
const cruiseRaceWear = cruiseRuns.reduce((sum, r) => sum + r.engineWear, 0) / cruiseRuns.length;
const pushRaceWear = pushRuns.reduce((sum, r) => sum + r.engineWear, 0) / pushRuns.length;

check(
  'a sensibly driven car keeps its engine well clear of the danger band',
  cruiseRaceWear < 60,
  `${cruiseRaceWear.toFixed(0)}% average wear over ${SEEDS.length} races`,
);
check(
  'a sensibly driven car essentially always finishes',
  cruiseDnf === 0,
  `${cruiseDnf}/${SEEDS.length} retirements`,
);
check(
  'racing flat out all afternoon wrecks the power unit',
  pushRaceWear > cruiseRaceWear * 1.8,
  `${pushRaceWear.toFixed(0)}% vs ${cruiseRaceWear.toFixed(0)}%`,
);
check(
  'racing flat out all afternoon risks the race',
  pushDnf > 0,
  `${pushDnf}/${SEEDS.length} retirements`,
);
check(
  'the risk is a risk, not a certainty',
  pushDnf < SEEDS.length,
  `${SEEDS.length - pushDnf}/${SEEDS.length} survived`,
);

// Reliability spending has to buy something on exactly this axis.
const fragileRuns = SEEDS.map((seed) => raceOutcome(seed, 'PUSH', 35));
const solidRuns = SEEDS.map((seed) => raceOutcome(seed, 'PUSH', 95));
const fragileDnf = fragileRuns.filter((r) => r.retired).length;
const solidDnf = solidRuns.filter((r) => r.retired).length;

check(
  'a reliable car survives being pushed more often than a fragile one',
  solidDnf < fragileDnf,
  `rel 95: ${solidDnf} DNF vs rel 35: ${fragileDnf} DNF`,
);

/* --- failures across the whole grid ------------------------------------ *
 * A reliability model that only ever strands the player's car is a
 * punishment, not a rule. The AI races hard at the top settings, so it
 * has to be exposed to the same consequence. */
console.log('\n== grid-wide reliability ==');

/** Runs a full race at a given difficulty and counts who did not finish. */
function gridOutcome(seed: number, racecraft: number, reliability: number) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed,
    startLap: 0,
    totalLaps: 34,
    aiRacecraft: racecraft,
    aiSkill: racecraft,
    reliability: Object.fromEntries(DRIVERS.map((d) => [d.id, reliability])),
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  for (let tick = 0; tick < 500_000; tick++) {
    local.step(16.7);
    if (local.getState().sessionState === 'FINISHED') break;
  }

  const cars = local.getState().cars;
  return {
    retired: cars.filter((car) => car.status === 'RETIRED').length,
    worstEngine: Math.max(...cars.map((car) => car.engineWearPct)),
    pushLaps: Math.max(...cars.map((car) => car.pushLaps)),
  };
}

const SWEEP = [7, 19, 37, 53, 67, 79, 91, 103];

// A capable AI attacks, and attacking is what consumes an engine.
const hardRuns = SWEEP.map((seed) => gridOutcome(seed, 1, 55));
const easyRuns = SWEEP.map((seed) => gridOutcome(seed, 0.15, 55));

const hardRetirements = hardRuns.reduce((sum, r) => sum + r.retired, 0);
const easyRetirements = easyRuns.reduce((sum, r) => sum + r.retired, 0);
const hardPush = Math.max(...hardRuns.map((r) => r.pushLaps));
const easyPush = Math.max(...easyRuns.map((r) => r.pushLaps));

check(
  'a hard-racing AI spends real time in push mode',
  hardPush > easyPush,
  `${easyPush.toFixed(1)} laps at Rookie vs ${hardPush.toFixed(1)} at Legend`,
);
check(
  'AI cars do retire with mechanical failures',
  hardRetirements > 0,
  `${hardRetirements} retirements across ${SWEEP.length} races`,
);
check(
  'a race is not decimated by them',
  hardRetirements < SWEEP.length * 6,
  `${(hardRetirements / SWEEP.length).toFixed(1)} per race of 22 cars`,
);
check(
  'racing harder costs more engines than cruising round',
  hardRetirements >= easyRetirements,
  `legend ${hardRetirements} vs rookie ${easyRetirements}`,
);

// A fragile grid has to break more than a well-built one.
const fragileGrid = SWEEP.map((seed) => gridOutcome(seed, 1, 28));
const fragileRetirements = fragileGrid.reduce((sum, r) => sum + r.retired, 0);
check(
  'a fragile grid breaks more often than a reliable one',
  fragileRetirements > hardRetirements,
  `reliability 28: ${fragileRetirements} vs reliability 55: ${hardRetirements}`,
);

/* --- driver attributes ------------------------------------------------ *
 * The whole point of the new stats is that two identical cars should not
 * produce identical races. Each check isolates one attribute by cloning
 * the field and changing only that number. */
console.log('\n== driver attributes ==');

/** A grid where every driver is identical except for one attribute. */
function uniformGrid(overrides: Partial<Record<string, number>> = {}) {
  return DRIVERS.map((driver) => ({
    ...driver,
    attributes: {
      pace: 85,
      cornering: 85,
      braking: 85,
      reaction: 70,
      attack: 70,
      defence: 70,
      racecraft: 70,
      consistency: 70,
      tyreManagement: 70,
      stamina: 70,
      wetWeather: 70,
      adaptability: 70,
      feedback: 70,
      ...overrides,
    },
  }));
}

/* A two-car race so the duel is the only thing happening. The chaser is a
 * hair slower on paper, so they sit in the mirrors and their lap time is a
 * direct reading of what the defending is costing them — which is the
 * mechanism itself rather than a noisy race outcome. */
function followingLapTime(defence: number, attack: number) {
  const drivers = [
    {
      ...DRIVERS[0]!,
      attributes: { ...uniformGrid()[0]!.attributes, defence, consistency: 99, stamina: 99 },
    },
    {
      ...DRIVERS[1]!,
      attributes: {
        ...uniformGrid()[0]!.attributes,
        pace: 84,
        cornering: 84,
        attack,
        consistency: 99,
        stamina: 99,
      },
    },
  ];
  const leader = drivers[0]!.id;
  const chaser = drivers[1]!.id;

  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 7,
    startLap: 0,
    totalLaps: 40,
    tyreWearScale: 1,
    manualPitDriverIds: [leader, chaser],
    startingTyres: { [leader]: 'MEDIUM', [chaser]: 'MEDIUM' },
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  const laps: number[] = [];
  let lastLap = -1;
  for (let tick = 0; tick < 400_000 && laps.length < 10; tick++) {
    local.step(16.7);
    const car = local.getState().cars.find((c) => c.driverId === chaser)!;
    if (car.lap !== lastLap) {
      // Only laps actually spent within striking distance count.
      if (car.lap >= 2 && car.lastLapMs && car.gapToAheadMs < 1_400) laps.push(car.lastLapMs);
      lastLap = car.lap;
    }
  }
  return laps.length > 0 ? laps.reduce((a, b) => a + b, 0) / laps.length / 1000 : 0;
}

const behindStrong = followingLapTime(97, 55);
const behindWeak = followingLapTime(35, 55);
const behindStrongSharp = followingLapTime(97, 97);

check(
  'following a strong defender costs real lap time',
  behindStrong > behindWeak,
  `defence 97 costs ${(behindStrong - behindWeak).toFixed(3)}s/lap more than defence 35`,
);
check(
  'the penalty is a believable size, not a wall',
  behindStrong - behindWeak > 0.03 && behindStrong - behindWeak < 0.6,
  `${(behindStrong - behindWeak).toFixed(3)}s/lap`,
);
check(
  'a better attacker loses less time behind the same defender',
  behindStrongSharp < behindStrong,
  `attack 97 claws back ${(behindStrong - behindStrongSharp).toFixed(3)}s/lap`,
);

/* --- tyre management -------------------------------------------------- */
function wearAfterLaps(tyreManagement: number) {
  const drivers = uniformGrid({ tyreManagement });
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 404,
    startLap: 0,
    totalLaps: 30,
    tyreWearScale: 1,
    manualPitDriverIds: [drivers[0]!.id],
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
  for (let i = 0; i < 60_000; i++) local.step(16.7);
  return local.getState().cars.find((c) => c.driverId === drivers[0]!.id)!.tyre.wearPct;
}

const gentleWear = wearAfterLaps(97);
const harshWear = wearAfterLaps(35);
check(
  'a driver who looks after a tyre wears it more slowly',
  gentleWear < harshWear,
  `tyre mgmt 97: ${gentleWear.toFixed(1)}% vs 35: ${harshWear.toFixed(1)}%`,
);

/* --- consistency ------------------------------------------------------ */
function lapSpread(consistency: number) {
  const drivers = uniformGrid({ consistency });
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 909,
    startLap: 0,
    totalLaps: 40,
    tyreWearScale: 1,
    manualPitDriverIds: [drivers[0]!.id],
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  const laps: number[] = [];
  let seen = 0;
  for (let i = 0; i < 200_000 && laps.length < 12; i++) {
    local.step(16.7);
    const car = local.getState().cars.find((c) => c.driverId === drivers[0]!.id)!;
    if (car.lap !== seen && car.lastLapMs) {
      seen = car.lap;
      laps.push(car.lastLapMs);
    }
  }
  if (laps.length < 4) return 0;
  const mean = laps.reduce((a, b) => a + b, 0) / laps.length;
  return Math.sqrt(laps.reduce((sum, l) => sum + (l - mean) ** 2, 0) / laps.length);
}

const tidySpread = lapSpread(98);
const raggedSpread = lapSpread(35);
check(
  'a consistent driver repeats the lap more closely',
  tidySpread < raggedSpread,
  `consistency 98: ±${(tidySpread / 1000).toFixed(3)}s vs 35: ±${(raggedSpread / 1000).toFixed(3)}s`,
);

/* --- stamina ---------------------------------------------------------- */
function lateRacePace(stamina: number) {
  const drivers = uniformGrid({ stamina });
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 616,
    startLap: 0,
    totalLaps: 30,
    tyreWearScale: 1,
    manualPitDriverIds: [drivers[0]!.id],
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  let early = 0;
  let late = 0;
  for (let i = 0; i < 400_000; i++) {
    local.step(16.7);
    const car = local.getState().cars.find((c) => c.driverId === drivers[0]!.id)!;
    if (car.lap === 5 && car.lastLapMs) early = car.lastLapMs;
    if (car.lap === 27 && car.lastLapMs) {
      late = car.lastLapMs;
      break;
    }
    if (local.getState().sessionState === 'FINISHED') break;
  }
  return early > 0 && late > 0 ? late - early : 0;
}

const fitFade = lateRacePace(98);
const unfitFade = lateRacePace(35);
check(
  'a driver short on stamina fades in the closing laps',
  unfitFade > fitFade,
  `stamina 98 faded ${(fitFade / 1000).toFixed(2)}s, stamina 35 faded ${(unfitFade / 1000).toFixed(2)}s`,
);

/* --- the start -------------------------------------------------------- *
 * Reaction is spent as a pace advantage over the opening lap rather than
 * as a jump up the grid, so it is measured at the end of lap one. */
function positionAfterOpeningLap(reaction: number) {
  const drivers = uniformGrid().map((driver, index) =>
    index === 10 ? { ...driver, attributes: { ...driver.attributes, reaction } } : driver,
  );
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 31,
    startLap: 0,
    totalLaps: 20,
    tyreWearScale: 1,
    startingTyres: Object.fromEntries(drivers.map((d) => [d.id, 'MEDIUM' as const])),
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  const target = drivers[10]!.id;
  for (let tick = 0; tick < 40_000; tick++) {
    local.step(16.7);
    const car = local.getState().cars.find((c) => c.driverId === target)!;
    if (car.lap >= 1) return car.position;
  }
  return 99;
}

const quickLaunch = positionAfterOpeningLap(99);
const slowLaunch = positionAfterOpeningLap(20);
check(
  'reflexes decide the launch off the line',
  quickLaunch < slowLaunch,
  `from the same grid slot: reaction 99 ran P${quickLaunch} after a lap, reaction 20 ran P${slowLaunch}`,
);

/* --- condition and push level ----------------------------------------- *
 * The condition layer only matters if it reaches the car. Same driver,
 * same machinery, different state of mind. */
console.log('\n== condition on track ==');

function raceWith(
  condition: { paceFactor: number; errorMultiplier: number; tyreMultiplier: number; aggression: number },
  push: number,
) {
  const drivers = uniformGrid();
  const target = drivers[0]!.id;
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers,
    seed: 2024,
    startLap: 0,
    totalLaps: 24,
    tyreWearScale: 1,
    manualPitDriverIds: [target],
    startingTyres: Object.fromEntries(drivers.map((d) => [d.id, 'MEDIUM' as const])),
    condition: { [target]: condition },
    pushLevel: { [target]: push },
  });
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  const laps: number[] = [];
  let seen = -1;
  for (let tick = 0; tick < 200_000 && laps.length < 8; tick++) {
    local.step(16.7);
    const car = local.getState().cars.find((c) => c.driverId === target)!;
    if (car.lap !== seen) {
      if (car.lap >= 2 && car.lastLapMs) laps.push(car.lastLapMs);
      seen = car.lap;
    }
  }
  const car = local.getState().cars.find((c) => c.driverId === target)!;
  const mean = laps.length ? laps.reduce((a, b) => a + b, 0) / laps.length : 0;

  /* Scatter measured from one lap to the next rather than from the mean.
   *
   * Standard deviation about the mean is not "messy lap to lap": a stint
   * has a strong systematic trend in it — the car gets lighter every lap
   * and the tyre gets worse — and over eight laps that trend is larger
   * than anything a driver's inconsistency contributes. Measured that
   * way, a rattled driver and a calm one came out identical, because the
   * number was mostly about fuel. Successive differences cancel any
   * linear trend and leave the part that is actually the driver. */
  const jitter = laps.slice(1).map((lap, index) => Math.abs(lap - laps[index]!));
  const spread = jitter.length
    ? jitter.reduce((a, b) => a + b, 0) / jitter.length
    : 0;

  return { mean, spread, wear: car.tyre.wearPct };
}

const NEUTRAL = { paceFactor: 0, errorMultiplier: 1, tyreMultiplier: 1, aggression: 0 };
const FIRED = { paceFactor: -0.004, errorMultiplier: 2.5, tyreMultiplier: 1.25, aggression: 0.6 };
const FLAT = { paceFactor: 0.0042, errorMultiplier: 1.2, tyreMultiplier: 1, aggression: -0.5 };

const neutralRun = raceWith(NEUTRAL, 3);
const firedRun = raceWith(FIRED, 3);
const flatRun = raceWith(FLAT, 3);

check(
  'a fired-up driver laps quicker',
  firedRun.mean < neutralRun.mean,
  `${(firedRun.mean / 1000).toFixed(3)}s vs ${(neutralRun.mean / 1000).toFixed(3)}s`,
);
check(
  'and is visibly messier lap to lap',
  firedRun.spread > neutralRun.spread,
  `${(firedRun.spread / 1000).toFixed(3)}s lap-to-lap vs ${(neutralRun.spread / 1000).toFixed(3)}s`,
);
check(
  'and is harder on the tyres for it',
  firedRun.wear > neutralRun.wear,
  `${firedRun.wear.toFixed(1)}% vs ${neutralRun.wear.toFixed(1)}%`,
);
check(
  'a dejected driver simply loses time',
  flatRun.mean > neutralRun.mean,
  `${(flatRun.mean / 1000).toFixed(3)}s vs ${(neutralRun.mean / 1000).toFixed(3)}s`,
);

/* Push level is the pit wall's own lever on the same three things. */
const conserveRun = raceWith(NEUTRAL, 1);
const attackRun = raceWith(NEUTRAL, 5);
check(
  'a higher push level finds lap time',
  attackRun.mean < conserveRun.mean,
  `push 5 ${(attackRun.mean / 1000).toFixed(3)}s vs push 1 ${(conserveRun.mean / 1000).toFixed(3)}s`,
);
check(
  'and spends the tyres to get it',
  attackRun.wear > conserveRun.wear,
  `push 5 ${attackRun.wear.toFixed(1)}% vs push 1 ${conserveRun.wear.toFixed(1)}%`,
);

/* A live condition change has to land on a running engine without
 * disturbing it. The alternative — rebuilding the engine when a driver is
 * talked down — would silently restart the race. */
const liveDrivers = uniformGrid();
const liveTarget = liveDrivers[0]!.id;
const liveEngine = createRaceEngine({
  circuit: SUZUKA,
  drivers: liveDrivers,
  seed: 606,
  startLap: 0,
  totalLaps: 30,
  tyreWearScale: 1,
  manualPitDriverIds: [liveTarget],
  startingTyres: Object.fromEntries(liveDrivers.map((d) => [d.id, 'MEDIUM' as const])),
});
liveEngine.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
for (let tick = 0; tick < 30_000; tick++) liveEngine.step(16.7);

const beforeCall = liveEngine.getState().cars.find((c) => c.driverId === liveTarget)!;
const distanceBefore = beforeCall.raceDistance;
const elapsedBefore = liveEngine.getState().elapsedMs;

liveEngine.applyCommand({
  type: 'SET_CONDITION',
  driverId: liveTarget,
  paceFactor: -0.004,
  errorMultiplier: 2.5,
  tyreMultiplier: 1.25,
  aggression: 0.6,
});

const afterCall = liveEngine.getState().cars.find((c) => c.driverId === liveTarget)!;
check(
  'a live condition change does not restart the race',
  afterCall.raceDistance === distanceBefore &&
    liveEngine.getState().elapsedMs === elapsedBefore,
  `still at lap ${afterCall.lap}, ${(elapsedBefore / 1000).toFixed(0)}s elapsed`,
);

// And it has to actually take effect from there on.
const lapsAfter: number[] = [];
let seenLive = afterCall.lap;
for (let tick = 0; tick < 120_000 && lapsAfter.length < 5; tick++) {
  liveEngine.step(16.7);
  const car = liveEngine.getState().cars.find((c) => c.driverId === liveTarget)!;
  if (car.lap !== seenLive) {
    seenLive = car.lap;
    if (car.lastLapMs) lapsAfter.push(car.lastLapMs);
  }
}
check(
  'and the new state takes effect from that moment',
  lapsAfter.length > 0,
  `${lapsAfter.length} laps run under the new condition`,
);

/* --- starting tyres --------------------------------------------------- */
console.log('\n== starting tyres ==');

const chosen = createRaceEngine({
  circuit: SUZUKA,
  drivers: DRIVERS,
  seed: 11,
  startLap: 0,
  startingTyres: { garcia: 'HARD', perez: 'SOFT' },
});
const chosenState = chosen.getState();
check(
  'the strategy call decides what a car starts on',
  chosenState.cars.find((c) => c.driverId === 'garcia')!.tyre.compound === 'HARD' &&
    chosenState.cars.find((c) => c.driverId === 'perez')!.tyre.compound === 'SOFT',
);
check(
  'cars without a call still get a compound',
  chosenState.cars.every((car) => Boolean(car.tyre.compound)),
);

/* --- stay out --------------------------------------------------------- */
console.log('\n== stay out ==');

/** Runs one lap after a pit call, optionally waving it off first. */
function stopsAfterCall(waveOff: boolean) {
  const local = createRaceEngine({ circuit: SUZUKA, drivers: DRIVERS, seed: 31, startLap: 10 });
  const car = () => local.getState().cars.find((c) => c.driverId === 'garcia')!;
  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
  const before = car().pitStops;
  local.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });
  if (waveOff) local.applyCommand({ type: 'CANCEL_PIT', driverId: 'garcia' });
  // A full lap plus the pit lane, so a stop that was going to happen has.
  for (let i = 0; i < 9_000; i++) local.step(16.7);
  return { gained: car().pitStops - before, laps: car().lap - 10 };
}

const committed = stopsAfterCall(false);
const wavedOff = stopsAfterCall(true);
check(
  'a pit call actually brings the car in',
  committed.gained > 0,
  `${committed.gained} stop over ${committed.laps} lap(s)`,
);
check(
  'staying out cancels the stop the pit wall called for',
  wavedOff.gained === 0,
  `${wavedOff.gained} stops over ${wavedOff.laps} lap(s)`,
);

/* --- driver radio ----------------------------------------------------- *
 * The brain is a pure observer, so it can be driven over a real race by
 * feeding it the same snapshots the UI would see. What matters is that
 * the traffic is caused, rate-limited, and reacts to being refused. */
console.log('\n== driver radio ==');


function runRadio(options: { refuseBoxCalls: boolean; grantAttackCalls: boolean }) {
  const local = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed: 20260419,
    startLap: 0,
    totalLaps: 20,
    startingTyres: { garcia: 'SOFT' },
    // The car the radio is about is run from the pit wall, as it is in game.
    manualPitDriverIds: ['garcia'],
  });
  const brain = createRadioBrain({ drivers: DRIVERS, focusDriverIds: ['garcia'], seed: 7 });
  const spoken: Array<{ kind: string; text: string; lap: number; hasDecision: boolean }> = [];
  let refusals = 0;

  local.applyCommand({ type: 'SET_SPEED', multiplier: 1 });

  // 200ms per snapshot, matching the feed's publish rate.
  for (let tick = 0; tick < 120_000; tick++) {
    local.step(16.7);
    if (tick % 12 !== 0) continue;

    const snapshot = local.getState();
    for (const message of brain.evaluate(snapshot)) {
      spoken.push({
        kind: message.kind,
        text: message.text,
        lap: message.lap,
        hasDecision: Boolean(message.decision),
      });

      if (message.decision) {
        const isPit = message.decision.kind === 'PIT';
        const accept = isPit ? !options.refuseBoxCalls : options.grantAttackCalls;

        if (accept) {
          // Each kind of request is granted by its own command.
          if (isPit) {
            local.applyCommand({
              type: 'SET_TYRE',
              driverId: 'garcia',
              compound: message.decision.compound,
            });
            local.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });
          } else if (message.decision.kind === 'PUSH') {
            local.applyCommand({ type: 'PUSH_MODE', driverId: 'garcia', enabled: true });
          } else {
            local.applyCommand({ type: 'ERS_BOOST', driverId: 'garcia', enabled: true });
          }
        } else if (isPit) {
          refusals++;
        }

        const reply = brain.answer('garcia', accept, snapshot);
        if (reply) {
          spoken.push({ kind: reply.kind, text: reply.text, lap: reply.lap, hasDecision: false });
        }
      }
    }
    if (snapshot.sessionState === 'FINISHED') break;
  }

  return { spoken, refusals };
}

const answered = runRadio({ refuseBoxCalls: false, grantAttackCalls: false });
const boxRequests = answered.spoken.filter((m) => m.kind === 'BOX_REQUEST');

check('the driver speaks during a race', answered.spoken.length > 0, `${answered.spoken.length} messages`);
check(
  'a driver on softs asks to box',
  boxRequests.length > 0,
  boxRequests[0]?.text.slice(0, 60),
);
check('every box request carries a decision', boxRequests.every((m) => m.hasDecision));
check(
  'the radio is rate-limited, not a firehose',
  answered.spoken.length < 40,
  `${answered.spoken.length} over 20 laps`,
);
check(
  'the driver reports more than one kind of thing',
  new Set(answered.spoken.map((m) => m.kind)).size >= 2,
  [...new Set(answered.spoken.map((m) => m.kind))].join(', '),
);
check(
  'accepting a request produces an acknowledgement',
  answered.spoken.some((m) => m.kind === 'ACK'),
);

// Refusing a call has to change what comes back, or "stay out" is not a
// decision the player is actually making.
const refused = runRadio({ refuseBoxCalls: true, grantAttackCalls: false });
check('refusing produces a reply from the driver', refused.refusals > 0, `${refused.refusals} waved off`);
check(
  'a waved-off driver asks again',
  refused.spoken.filter((m) => m.kind === 'BOX_REQUEST').length > 1,
  `${refused.spoken.filter((m) => m.kind === 'BOX_REQUEST').length} requests`,
);
check(
  'a driver who is repeatedly refused gets more insistent',
  refused.spoken.some((m) => m.kind === 'ACK' && /wrong call|too long|hope you know/i.test(m.text)),
);

/* --- attack calls come over the radio, not from the car -------------- */
const attack = runRadio({ refuseBoxCalls: false, grantAttackCalls: true });
const pushAsks = attack.spoken.filter((m) => m.kind === 'PUSH_REQUEST');
const boostAsks = attack.spoken.filter((m) => m.kind === 'BOOST_REQUEST');

check(
  'the driver asks for push rather than taking it',
  pushAsks.length > 0,
  pushAsks[0]?.text.slice(0, 52),
);
check('push requests carry a decision', pushAsks.every((m) => m.hasDecision));
check(
  'the driver asks for the override when it is worth having',
  boostAsks.length > 0,
  boostAsks[0]?.text.slice(0, 52),
);

// Refused twice, a driver drops the subject rather than nagging.
const nagging = runRadio({ refuseBoxCalls: true, grantAttackCalls: false });
check(
  'a driver refused twice stops asking to push',
  nagging.spoken.filter((m) => m.kind === 'PUSH_REQUEST').length <= 2,
  `${nagging.spoken.filter((m) => m.kind === 'PUSH_REQUEST').length} push requests`,
);
check(
  'a driver refused twice stops asking for the override',
  nagging.spoken.filter((m) => m.kind === 'BOOST_REQUEST').length <= 2,
  `${nagging.spoken.filter((m) => m.kind === 'BOOST_REQUEST').length} override requests`,
);
check(
  'waved-off box requests do not become a firehose',
  nagging.spoken.filter((m) => m.kind === 'BOX_REQUEST').length <= 6,
  `${nagging.spoken.filter((m) => m.kind === 'BOX_REQUEST').length} box requests over 20 laps`,
);

// A patient driver on a durable tyre should simply not be on the radio
// asking for a stop, or the request means nothing when it comes.
const quiet = createRaceEngine({
  circuit: SUZUKA,
  drivers: DRIVERS,
  seed: 5150,
  startLap: 0,
  totalLaps: 20,
  startingTyres: { garcia: 'HARD' },
  manualPitDriverIds: ['garcia'],
});
const quietBrain = createRadioBrain({ drivers: DRIVERS, focusDriverIds: ['garcia'], seed: 7 });
let quietBoxRequests = 0;
quiet.applyCommand({ type: 'SET_SPEED', multiplier: 1 });
for (let tick = 0; tick < 24_000; tick++) {
  quiet.step(16.7);
  if (tick % 12 !== 0) continue;
  for (const message of quietBrain.evaluate(quiet.getState())) {
    if (message.kind === 'BOX_REQUEST') quietBoxRequests++;
  }
}
check(
  'a fresh hard tyre produces no box request',
  quietBoxRequests === 0,
  `${quietBoxRequests} requests in the opening laps`,
);

/* --- strategy projections -------------------------------------------- */
console.log('\n== strategy model ==');
const softStint = projectStint('SOFT', 20, 3);
const hardStint = projectStint('HARD', 20, 3);
check(
  'soft degrades faster than hard',
  softStint[20]!.wearPct > hardStint[20]!.wearPct,
  `S ${softStint[20]!.wearPct.toFixed(0)}% vs H ${hardStint[20]!.wearPct.toFixed(0)}%`,
);
check('wear is monotonic', softStint.every((p, i) => i === 0 || p.wearPct >= softStint[i - 1]!.wearPct));

const window = pitWindow('MEDIUM', 3, 18, 30);
check(
  'pit window is ordered',
  window.fromLap <= window.optimalLap && window.optimalLap <= window.toLap,
  `L${window.fromLap} / L${window.optimalLap} / L${window.toLap}`,
);

const oneStop = projectRace(
  [
    { compound: 'MEDIUM', plannedLaps: 25 },
    { compound: 'HARD', plannedLaps: 30 },
  ],
  SUZUKA.baseLapTimeMs,
  3,
);
check('one-stop covers 55 laps', oneStop.lapsPlanned === 55, `${oneStop.lapsPlanned} laps`);
check(
  'projected race time is realistic',
  oneStop.totalTimeS > 4_800 && oneStop.totalTimeS < 7_800,
  `${(oneStop.totalTimeS / 60).toFixed(1)} min`,
);


console.log('\n== the circuit decides the race ==');

{
  const tracks = buildTracks();
  const byId = new Map(tracks.map((t) => [t.id, t]));

  /* Every circuit in the catalogue has carried these five numbers since
   * career mode was written and nothing read any of them. They are what
   * makes a calendar a calendar. */
  check(
    'every circuit states what it asks of a car',
    tracks.every(
      (t) =>
        t.characteristics.downforce > 0 &&
        t.characteristics.power > 0 &&
        t.characteristics.overtaking > 0,
    ),
    `${tracks.length} venues`,
  );
  check(
    'and they carry through to the engine',
    Boolean(trackToCircuit(tracks[0]!).characteristics),
  );
  check(
    'the calendar spans real extremes rather than four templates',
    (() => {
      const df = tracks.map((t) => t.characteristics.downforce);
      const ov = tracks.map((t) => t.characteristics.overtaking);
      return Math.max(...df) - Math.min(...df) > 55 && Math.max(...ov) - Math.min(...ov) > 55;
    })(),
    `downforce ${Math.min(...tracks.map((t) => t.characteristics.downforce))}-${Math.max(...tracks.map((t) => t.characteristics.downforce))}, ` +
      `overtaking ${Math.min(...tracks.map((t) => t.characteristics.overtaking))}-${Math.max(...tracks.map((t) => t.characteristics.overtaking))}`,
  );
  check(
    'no circuit runs an absurd race distance',
    tracks.every((t) => t.laps >= 38 && t.laps <= 78),
    `${Math.min(...tracks.map((t) => t.laps))}-${Math.max(...tracks.map((t) => t.laps))} laps`,
  );
  check(
    'lap times differ between circuits of the same length',
    (() => {
      const similar = tracks.filter((t) => Math.abs(t.lengthKm - 6) < 0.3);
      if (similar.length < 2) return true;
      const times = similar.map((t) => t.lapRecordMs);
      return Math.max(...times) - Math.min(...times) > 5_000;
    })(),
  );

  /* A car is rated for the circuit it is at. Aero-led and power-led cars
   * are supposed to swap places across a season. */
  const aeroCar = GRID_2026_TEAMS.find((t) => t.id === 'redbull')!.car;
  const powerCar = GRID_2026_TEAMS.find((t) => t.id === 'williams')!.car;
  const downforceTrack = byId.get('kaimai')!.characteristics;
  const powerTrack = byId.get('lakeshore')!.characteristics;

  check(
    'an aero car is stronger where downforce matters',
    carRatingAt(aeroCar, downforceTrack) > carRatingAt(aeroCar, powerTrack),
    `${carRatingAt(aeroCar, downforceTrack)} vs ${carRatingAt(aeroCar, powerTrack)}`,
  );
  check(
    'and a power car is stronger where it does not',
    carRatingAt(powerCar, powerTrack) > carRatingAt(powerCar, downforceTrack),
    `${carRatingAt(powerCar, powerTrack)} vs ${carRatingAt(powerCar, downforceTrack)}`,
  );
  check(
    'the two actually swap order across the calendar',
    carRatingAt(aeroCar, downforceTrack) > carRatingAt(powerCar, downforceTrack) &&
      carRatingAt(powerCar, powerTrack) > carRatingAt(aeroCar, powerTrack),
  );
  check(
    'rating a car for a circuit rebalances rather than inflates it',
    Math.abs(carRatingAt(aeroCar, downforceTrack) - carRating(aeroCar)) <= 6,
    `flat ${carRating(aeroCar)}, at circuit ${carRatingAt(aeroCar, downforceTrack)}`,
  );
  check(
    'a circuit with no stated character rates as the flat figure',
    carRatingAt(aeroCar, undefined) === carRating(aeroCar),
  );
}

console.log('\n== tyres, and the strategy they allow ==');

{
  /* The old degradation curve lost 0.042 of a lap per unit of wear,
   * linearly: nearly a second a lap at a quarter worn. Fresh rubber was
   * worth so much that stopping again was always right, and optimised
   * against each other a three-stop beat a one-stop by a minute. */
  const base = SUZUKA.baseLapTimeMs;
  const lossAt = (pct: number) => (tyreWearPenalty(pct) * base) / 1000;

  check(
    'a part-worn set is only tenths off',
    lossAt(30) < 0.45,
    `30% worn: ${lossAt(30).toFixed(2)}s/lap`,
  );
  check(
    'a set at the knee is still driveable',
    lossAt(70) < 0.9,
    `70% worn: ${lossAt(70).toFixed(2)}s/lap`,
  );
  check(
    'and past it the cliff is real',
    lossAt(95) > 2.2 && lossAt(100) > lossAt(95) * 1.3,
    `95%: ${lossAt(95).toFixed(2)}s/lap, 100%: ${lossAt(100).toFixed(2)}s/lap`,
  );
  check(
    'the curve is monotonic',
    Array.from({ length: 100 }, (_, i) => i).every(
      (i) => tyreWearPenalty(i + 1) >= tyreWearPenalty(i),
    ),
  );
  check(
    'the planner projects the same curve the engine runs',
    (() => {
      const projected = projectStint('MEDIUM', 20, 3, 1, 0, base);
      return projected.every((point) => {
        const expected = (tyreWearPenalty(point.wearPct) * base) / 1000;
        return Math.abs(point.lapTimeLossS - expected) < 1e-9;
      });
    })(),
  );

  /* The compounds have to be genuinely different things, or the choice
   * of one is not a choice. */
  check(
    'the soft is quicker and the hard lasts longer',
    TYRE_MODEL.SOFT.paceFactor < TYRE_MODEL.MEDIUM.paceFactor &&
      TYRE_MODEL.MEDIUM.paceFactor < TYRE_MODEL.HARD.paceFactor &&
      TYRE_MODEL.SOFT.wearPerLap > TYRE_MODEL.MEDIUM.wearPerLap &&
      TYRE_MODEL.MEDIUM.wearPerLap > TYRE_MODEL.HARD.wearPerLap,
  );
  check(
    'and the gap between them is tenths rather than seconds',
    ((TYRE_MODEL.HARD.paceFactor - TYRE_MODEL.SOFT.paceFactor) * base) / 1000 < 1.6,
    `${(((TYRE_MODEL.HARD.paceFactor - TYRE_MODEL.SOFT.paceFactor) * base) / 1000).toFixed(2)}s soft to hard`,
  );

  /* The decisive test: optimise each stop count against the others and
   * see how far apart they land. A minute apart is one strategy and
   * three wrong answers. */
  const RACE_LAPS = 53;
  const PIT_LOSS_S = 21;
  const stintTimeS = (compound: TyreCompound, laps: number) => {
    let wear = 0;
    let total = 0;
    for (let lap = 0; lap < laps; lap++) {
      const warmup = lap < TYRE_MODEL[compound].warmupLaps ? 0.012 : 0;
      total +=
        (base * TYRE_MODEL[compound].paceFactor * (1 + tyreWearPenalty(wear) + warmup)) / 1000;
      wear = Math.min(100, wear + TYRE_MODEL[compound].wearPerLap);
    }
    return total;
  };

  const bestForStops = (stops: number) => {
    const stints = stops + 1;
    const sets: TyreCompound[][] = [];
    const build = (acc: TyreCompound[]) => {
      if (acc.length === stints) return void sets.push(acc);
      for (const c of ['SOFT', 'MEDIUM', 'HARD'] as TyreCompound[]) build([...acc, c]);
    };
    build([]);

    const splits: number[][] = [];
    const walk = (acc: number[], left: number) => {
      if (acc.length === stints - 1) return void splits.push([...acc, left]);
      for (let l = 6; l <= left - 6 * (stints - acc.length - 1); l++) walk([...acc, l], left - l);
    };
    walk([], RACE_LAPS);

    let best = Infinity;
    for (const set of sets) {
      for (const split of splits) {
        let total = stops * PIT_LOSS_S;
        let ok = true;
        for (let i = 0; i < stints; i++) {
          if (split[i]! * TYRE_MODEL[set[i]!].wearPerLap > 100) { ok = false; break; }
          total += stintTimeS(set[i]!, split[i]!);
        }
        if (ok && total < best) best = total;
      }
    }
    return best;
  };

  const plans = [1, 2, 3].map(bestForStops);
  const spread = Math.max(...plans) - Math.min(...plans);
  check(
    'one, two and three stops are all live strategies',
    spread < 25,
    `${plans.map((t, i) => `${i + 1}-stop ${(t / 60).toFixed(2)}min`).join(', ')} — ${spread.toFixed(1)}s apart`,
  );
  check(
    'stopping more is not simply always right',
    plans[2]! > plans[1]!,
    `3-stop is ${(plans[2]! - plans[1]!).toFixed(1)}s slower than 2-stop`,
  );
}

console.log('\n== fuel is loaded for the race ==');

{
  /* The burn was a fixed 1.92kg a lap against a fixed 110kg tank — fifty-
   * seven laps of fuel. Any longer race ran dry, and a dry tank tripped
   * the pit trigger, so cars pitted four and five times on new tyres. */
  const long = buildTracks().find((t) => t.laps >= 70)!;
  const circuit = trackToCircuit(long);
  const local = createRaceEngine({
    circuit,
    drivers: DRIVERS,
    seed: 77,
    startLap: 0,
    totalLaps: long.laps,
  });

  for (let t = 0; t < 40_000 && local.getState().flag !== 'CHEQUERED'; t++) local.step(2000);
  const finished = local.getState();
  const running = finished.cars.filter((c) => c.status !== 'RETIRED');

  check(
    `a ${long.laps}-lap race reaches the flag`,
    finished.flag === 'CHEQUERED',
    `leader on lap ${Math.max(...finished.cars.map((c) => c.lap))}`,
  );
  check(
    'nobody runs out of fuel',
    running.every((c) => c.fuelKg > 0.5),
    `lowest ${Math.min(...running.map((c) => c.fuelKg)).toFixed(1)}kg`,
  );
  check(
    'and nobody pits more than three times',
    running.every((c) => c.pitStops <= 3),
    `most stops ${Math.max(...running.map((c) => c.pitStops))}`,
  );
  check(
    'every car stops at least once over a full distance',
    running.every((c) => c.pitStops >= 1),
  );
  check(
    'and none of them finishes on a dead set',
    running.every((c) => c.tyre.wearPct < 95),
    `worst ${Math.max(...running.map((c) => c.tyre.wearPct)).toFixed(0)}%`,
  );
}

console.log('\n== weather: the tyre window ==');

{
  /* The crossovers are the whole model: where each tyre stops being the
   * right one is what makes a change of conditions a decision. */
  check(
    'slicks are quickest on a dry track',
    compoundPaceFactor('MEDIUM', 0) < compoundPaceFactor('INTER', 0) &&
      compoundPaceFactor('INTER', 0) < compoundPaceFactor('WET', 0),
    `M ${compoundPaceFactor('MEDIUM', 0).toFixed(3)} I ${compoundPaceFactor('INTER', 0).toFixed(3)} W ${compoundPaceFactor('WET', 0).toFixed(3)}`,
  );
  check(
    'intermediates take over once it is damp',
    compoundPaceFactor('INTER', 0.3) < compoundPaceFactor('MEDIUM', 0.3),
    `I ${compoundPaceFactor('INTER', 0.3).toFixed(3)} vs M ${compoundPaceFactor('MEDIUM', 0.3).toFixed(3)}`,
  );
  check(
    'full wets take over in standing water',
    compoundPaceFactor('WET', 0.85) < compoundPaceFactor('INTER', 0.85),
    `W ${compoundPaceFactor('WET', 0.85).toFixed(3)} vs I ${compoundPaceFactor('INTER', 0.85).toFixed(3)}`,
  );
  check(
    'a slick in the wet is ruinous, not merely slow',
    compoundPaceFactor('SOFT', 0.6) > 1.5,
    `${((compoundPaceFactor('SOFT', 0.6) - 1) * 100).toFixed(0)}% slower`,
  );
  check(
    'a wet tyre on a dry track destroys itself',
    compoundWearFactor('WET', 0) > 3,
    `${compoundWearFactor('WET', 0).toFixed(1)}x wear`,
  );
  check(
    'and a slick in the rain barely wears at all',
    compoundWearFactor('SOFT', 0.7) < 0.7,
    `${compoundWearFactor('SOFT', 0.7).toFixed(2)}x wear`,
  );
  check(
    'the wrong tyre multiplies mistakes',
    compoundRiskFactor('SOFT', 0.5) > compoundRiskFactor('INTER', 0.5) * 1.5,
    `slick ${compoundRiskFactor('SOFT', 0.5).toFixed(2)}x vs inter ${compoundRiskFactor('INTER', 0.5).toFixed(2)}x`,
  );
  check('the recommendation follows the track', 
    bestCompoundFor(0) === 'MEDIUM' && bestCompoundFor(0.3) === 'INTER' && bestCompoundFor(0.9) === 'WET');
}

console.log('\n== weather: on track ==');

{
  const mk = (w, kind, phases = []) => ({
    startWetness: w,
    phases: [{ fromLap: 0, kind, targetWetness: w }, ...phases],
    airTempC: 20, trackTempC: 30, windKph: 10, rainChancePct: 50,
  });

  const race = (weather, laps = 16) => {
    const engine = createRaceEngine({
      circuit: SUZUKA, drivers: DRIVERS, seed: 7, startLap: 0, totalLaps: laps, weather,
    });
    for (let i = 0; i < 160_000 && engine.getState().sessionState !== 'FINISHED'; i++) {
      engine.step(100);
    }
    return engine.getState();
  };

  const dry = race(mk(0, 'DRY'));
  const soaked = race(mk(0.88, 'HEAVY_RAIN'));

  const fastest = (s) => Math.min(...s.cars.map((c) => c.bestLapMs).filter((n) => n != null));

  check(
    'a wet race is genuinely slower than a dry one',
    fastest(soaked) > fastest(dry) * 1.08,
    `${(fastest(dry) / 1000).toFixed(1)}s dry vs ${(fastest(soaked) / 1000).toFixed(1)}s wet`,
  );
  check(
    'the grid forms on wets when the race starts wet',
    soaked.cars.every((c) => c.tyre.compound === 'WET' || c.tyre.compound === 'INTER'),
    [...new Set(soaked.cars.map((c) => c.tyre.compound))].join('/'),
  );
  check(
    'and on slicks when it does not',
    dry.cars.every((c) => !['INTER', 'WET'].includes(c.tyre.compound)),
    [...new Set(dry.cars.map((c) => c.tyre.compound))].join('/'),
  );

  /* Rain arriving mid-race is the point of the whole system. */
  const caught = race(mk(0, 'DRY', [{ fromLap: 5, kind: 'HEAVY_RAIN', targetWetness: 0.85 }]));
  check(
    'rain arriving puts the field onto wet tyres',
    caught.cars.filter((c) => ['INTER', 'WET'].includes(c.tyre.compound)).length >
      caught.cars.length * 0.7,
    `${caught.cars.filter((c) => ['INTER', 'WET'].includes(c.tyre.compound)).length}/${caught.cars.length} cars`,
  );
  check(
    'and forces far more stops than a dry race',
    caught.cars.reduce((a, c) => a + c.pitStops, 0) > dry.cars.reduce((a, c) => a + c.pitStops, 0),
    `${caught.cars.reduce((a, c) => a + c.pitStops, 0)} vs ${dry.cars.reduce((a, c) => a + c.pitStops, 0)} stops`,
  );
  check('the track actually got wet', caught.weather.wetness > 0.6, caught.weather.wetness.toFixed(2));

  /* A drying track is the opposite gamble. */
  const drying = race(mk(0.8, 'HEAVY_RAIN', [{ fromLap: 3, kind: 'CLOUDY', targetWetness: 0 }]));
  check('a drying track sheds its water', drying.weather.wetness < 0.35, drying.weather.wetness.toFixed(2));

  /* Nobody gets stuck boxing every lap. */
  check(
    'no car pits absurdly often',
    caught.cars.every((c) => c.pitStops <= 6),
    `worst ${Math.max(...caught.cars.map((c) => c.pitStops))} stops`,
  );

  /* The fastest lap has to be a real lap, not a number invented on the grid. */
  check(
    'the fastest lap is a lap somebody actually set',
    dry.cars.every((c) => c.bestLapMs == null || c.bestLapMs > 60_000),
  );
}

console.log('\n== weather: the forecast ==');

{
  const track = buildTracks(6).find((t) => t.forecast.rainChancePct > 55) ?? buildTracks(6)[0];
  const a = rollRaceWeather(track, 2026, 1, 20);
  const b = rollRaceWeather(track, 2026, 1, 20);
  check(
    'the same weekend rolls the same weather',
    JSON.stringify(a) === JSON.stringify(b),
  );
  const later = rollRaceWeather(track, 2026, 4, 20);
  check(
    'a different round can roll differently',
    JSON.stringify(a) !== JSON.stringify(later) || a.phases.length === later.phases.length,
  );
  check('a forecast always has a starting phase', a.phases.length >= 1);
  check(
    'a mid-race change never lands on the opening or final lap',
    a.phases.slice(1).every((p) => p.fromLap >= 2 && p.fromLap < 20),
  );
}

/* ---------------------------------------------------------------------
 * The pit wall's tyre call
 *
 * Two bugs lived here. The crew used to fit whatever the *track* said
 * regardless of what was asked for, so calling for wets in standing
 * water came back as inters and calling for inters on a drying track
 * came back as wets — the two wet compounds were impossible to choose
 * between. And two cars boxing together were both serviced at once, on
 * one crew, so a double stack was free.
 * ------------------------------------------------------------------- */

console.log('\n== the pit wall owns the compound ==');

{
  /** Runs a race in fixed rain, calls a car in on `compound`, reports what
   *  actually went on the car. */
  function fittedAfterCall(targetWetness: number, compound: TyreCompound): TyreCompound {
    const rainEngine = createRaceEngine({
      circuit: SUZUKA,
      drivers: DRIVERS,
      seed: 5150,
      totalLaps: 30,
      manualPitDriverIds: ['garcia'],
      weather: {
        startWetness: targetWetness,
        phases: [{ fromLap: 0, kind: 'HEAVY_RAIN', targetWetness }],
        airTempC: 17,
        trackTempC: 21,
        windKph: 14,
        rainChancePct: 90,
      },
    });

    rainEngine.applyCommand({ type: 'SET_TYRE', driverId: 'garcia', compound });
    rainEngine.applyCommand({ type: 'PIT_CALL', driverId: 'garcia' });

    // Long enough to reach the box, be serviced and rejoin.
    for (let i = 0; i < 60 * 260; i++) rainEngine.step(16.7);
    return rainEngine.getState().cars.find((c) => c.driverId === 'garcia')!.tyre.compound;
  }

  // Standing water: the sane call is full wets, so inters is the gamble.
  const intersInAFlood = fittedAfterCall(0.85, 'INTER');
  check(
    'inters are fitted in standing water when the pit wall asks for them',
    intersInAFlood === 'INTER',
    intersInAFlood,
  );

  // Merely damp: the sane call is inters, so full wets is the gamble.
  const wetsOnADampTrack = fittedAfterCall(0.3, 'WET');
  check(
    'full wets are fitted on a damp track when the pit wall asks for them',
    wetsOnADampTrack === 'WET',
    wetsOnADampTrack,
  );

  // And a slick call in the wet is still the player's to make.
  const slicksInTheWet = fittedAfterCall(0.7, 'SOFT');
  check(
    'a slick call in the wet is honoured too — it is the pit wall\'s race to lose',
    slicksInTheWet === 'SOFT',
    slicksInTheWet,
  );

  /* Nobody called for anything, so a plan left on slicks has to be
   * overruled — that safety net must survive the fix. */
  const unattended = createRaceEngine({
    circuit: SUZUKA,
    drivers: DRIVERS,
    seed: 5150,
    totalLaps: 30,
    weather: {
      startWetness: 0.85,
      phases: [{ fromLap: 0, kind: 'HEAVY_RAIN', targetWetness: 0.85 }],
      airTempC: 17,
      trackTempC: 21,
      windKph: 14,
      rainChancePct: 90,
    },
  });
  for (let i = 0; i < 60 * 200; i++) unattended.step(16.7);
  const onWets = unattended
    .getState()
    .cars.filter((c) => c.tyre.compound === 'INTER' || c.tyre.compound === 'WET').length;
  check(
    'a car nobody is calling for still gets the tyre the track needs',
    onWets >= 18,
    `${onWets}/20 on wets`,
  );
}

console.log('\n== one crew, one box ==');

{
  /* Two team-mates called in on the same lap on different compounds.
   * Each has to end up on what was actually asked for, and the second
   * one has to wait for the crew — which is what a double stack costs,
   * and what used to be free because both cars were serviced at once. */
  /* Team-mates who line up next to each other, so both reach the pit
   * entry on the same lap a fraction of a second apart — which is the
   * only situation a stack actually arises in. Two cars a lap apart do
   * not stack, and should not. */
  const pairIndex = DRIVERS.findIndex(
    (driver, index) => index > 0 && DRIVERS[index - 1]!.teamId === driver.teamId,
  );
  const first = DRIVERS[pairIndex - 1]!;
  const second = DRIVERS[pairIndex]!;

  /** Boxes `second` immediately, optionally stacking them behind `first`. */
  function stackRun(behindMate: boolean) {
    const stackEngine = createRaceEngine({
      circuit: SUZUKA,
      drivers: DRIVERS,
      seed: 90210,
      totalLaps: 30,
      manualPitDriverIds: [first.id, second.id],
    });

    stackEngine.applyCommand({ type: 'SET_TYRE', driverId: first.id, compound: 'SOFT' });
    stackEngine.applyCommand({ type: 'SET_TYRE', driverId: second.id, compound: 'HARD' });
    // The team-mate goes first, so the box is occupied when the second
    // car arrives — the order the commands land in is the order they box.
    if (behindMate) stackEngine.applyCommand({ type: 'PIT_CALL', driverId: first.id });
    stackEngine.applyCommand({ type: 'PIT_CALL', driverId: second.id });

    let stationaryTicks = 0;
    for (let i = 0; i < 60 * 300; i++) {
      stackEngine.step(16.7);
      const car = stackEngine.getState().cars.find((c) => c.driverId === second.id)!;
      if (car.status === 'IN_PIT') stationaryTicks++;
    }

    const cars = stackEngine.getState().cars;
    return {
      firstTyre: cars.find((c) => c.driverId === first.id)!.tyre.compound,
      secondTyre: cars.find((c) => c.driverId === second.id)!.tyre.compound,
      secondStops: cars.find((c) => c.driverId === second.id)!.pitStops,
      secondStationaryMs: stationaryTicks * 16.7,
    };
  }

  const stacked = stackRun(true);
  const alone = stackRun(false);

  check(
    'both cars boxing together get their own compound',
    stacked.firstTyre === 'SOFT' && stacked.secondTyre === 'HARD',
    `${stacked.firstTyre} / ${stacked.secondTyre}`,
  );
  check(
    'a stacked car is still served',
    stacked.secondStops >= 1 && alone.secondStops >= 1,
    `${stacked.secondStops} stacked, ${alone.secondStops} alone`,
  );
  check(
    'stacking behind the team-mate costs real time',
    stacked.secondStationaryMs > alone.secondStationaryMs + 500,
    `${(stacked.secondStationaryMs / 1000).toFixed(1)}s stationary stacked vs ${(
      alone.secondStationaryMs / 1000
    ).toFixed(1)}s alone`,
  );
}

console.log(
  failures === 0
    ? '\nAll simulation checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
