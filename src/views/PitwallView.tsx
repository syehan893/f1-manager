import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Circle,
  FastForward,
  Flag,
  Gauge,
  Map as MapIcon,
  Pause,
  Play,
  Rabbit,
  Radio,
  Timer,
} from 'lucide-react';
import { CircuitMap } from '@/components/race/CircuitMap';
import { LiveTimingPanel } from '@/components/race/LiveTimingPanel';
import { RadioPanel } from '@/components/race/RadioPanel';
import { Panel } from '@/components/ui/Panel';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { GameButton } from '@/components/game/GameButton';
import { TrackThumbnail } from '@/components/career/TrackThumbnail';
import { GRID_2026_DRIVERS } from '@/data/grid2026';
import { SessionTelemetry } from '@/components/race/SessionTelemetry';
import type { TraceId } from '@/components/race/SessionTelemetry';
import { isRacePhase } from '@/game/phases';
import { scaledLaps } from '@/game/trackAdapter';
import { cx, flagEmoji, formatClock } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import { useRace } from '@/state/raceContext';
import type { GamePhase } from '@/game/types';
import type { ViewId } from '@/types';

const DRIVER_BY_ID = new Map(GRID_2026_DRIVERS.map((driver) => [driver.id, driver]));

/** Simulated seconds per real second at "1x". */
const TIME_COMPRESSION = 6;
const SPEEDS = [1, 2, 3, 5] as const;
type Speed = (typeof SPEEDS)[number];
const COUNTDOWN_SECONDS = 10;

/* ------------------------------ empty state ---------------------------- */

const STEPS: Array<{ phase: GamePhase; label: string; hint: string; view: ViewId }> = [
  {
    phase: 'HUB',
    label: 'Manager Hub',
    hint: 'Run the week, then head to qualifying.',
    view: 'game-season',
  },
  {
    phase: 'QUALIFYING',
    label: 'Qualifying',
    hint: 'Five laps each — the best sets the grid.',
    view: 'game-season',
  },
  {
    phase: 'RACE_STRATEGY',
    label: 'Strategy',
    hint: 'Choose the starting compound for both cars.',
    view: 'race-strategy',
  },
  {
    phase: 'RACE_COUNTDOWN',
    label: 'Race Day',
    hint: 'The pit wall goes live here.',
    view: 'pitwall',
  },
];

function PitwallEmptyState({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, phase, currentTrack, playerTeam } = useGame();

  const activeIndex = STEPS.findIndex((step) =>
    step.phase === 'RACE_COUNTDOWN'
      ? isRacePhase(phase)
      : step.phase === phase ||
        (step.phase === 'HUB' &&
          (phase === 'PRE_SEASON' || phase === 'POST_RACE' || phase === 'SEASON_REVIEW')),
  );

  /* The next thing the player has to do, which is not always the season
   * screen: the strategy gate lives on its own screen and is the one
   * step that will otherwise silently block race day. */
  const nextStep = STEPS[Math.max(0, activeIndex)];
  const gatingStrategy = phase === 'RACE_STRATEGY';

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Panel title="Pitwall Live" icon={<Radio className="size-3.5" />}>
        <div className="py-4 text-center">
          <motion.span
            className="mx-auto grid size-14 place-items-center rounded-2xl border border-carbon-500 bg-carbon-900/60 text-chrome-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Radio className="size-6" />
          </motion.span>

          <h2 className="mt-4 text-lg font-bold text-chrome-100">
            {gatingStrategy ? 'Waiting on the strategy call' : 'No session running'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-chrome-500">
            {gatingStrategy
              ? 'Qualifying is done and the grid is set. The cars go nowhere until you have chosen what each one starts on.'
              : 'The pit wall only comes alive on race day. Work through the weekend from the season screen — the race starts there, and you will be brought straight back here.'}
          </p>

          {/* Where the player is in the weekend */}
          <ol className="mx-auto mt-6 grid max-w-lg gap-2 text-left">
            {STEPS.map((step, index) => {
              const done = activeIndex > index;
              const active = activeIndex === index;

              return (
                <li
                  key={step.phase}
                  className={cx(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    active
                      ? 'border-neon-cyan/45 bg-neon-cyan/8'
                      : done
                        ? 'border-carbon-600/70 bg-carbon-900/40'
                        : 'border-carbon-700/60 bg-carbon-900/25',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-neon-lime" />
                  ) : (
                    <Circle
                      className={cx(
                        'size-4 shrink-0',
                        active ? 'text-neon-cyan' : 'text-chrome-500',
                      )}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        'text-[12px] font-bold',
                        active ? 'text-neon-cyan' : 'text-chrome-200',
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="truncate text-[10px] text-chrome-500">{step.hint}</p>
                  </div>
                  {active && <Badge tone="cyan">You are here</Badge>}
                </li>
              );
            })}
          </ol>

          <GameButton
            size="lg"
            className="mt-6"
            onClick={() => onNavigate(nextStep?.view ?? 'game-season')}
            icon={<ArrowRight className="size-4" />}
          >
            {gatingStrategy ? 'Choose the starting tyres' : 'Go to the season screen'}
          </GameButton>
        </div>

        {/* Next race context so the screen still earns its place */}
        {currentTrack && state && (
          <div className="mt-2 grid gap-4 border-t border-carbon-600/60 pt-4 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/50 p-2">
              <div className="aspect-[4/3]">
                <TrackThumbnail track={currentTrack} strokeWidth={26} showStartLine />
              </div>
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-1.5">Next up</p>
              <p className="flex items-center gap-2 text-[14px] font-bold text-chrome-100">
                <span className="text-lg leading-none">{flagEmoji(currentTrack.countryCode)}</span>
                <span className="truncate">{currentTrack.name}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-chrome-500">
                Round {state.round} of {state.settings.seasonLength} ·{' '}
                {scaledLaps(currentTrack, state.settings.raceLengthPct)} laps ·{' '}
                {playerTeam?.name}
              </p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------- cockpit ------------------------------ */

function PitwallRace({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, dispatch, currentTrack, playerTeam, phase } = useGame();
  const { snapshot, send } = useRace();
  const [trace, setTrace] = useState<TraceId>('PACE');

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);

  const inCountdown = phase === 'RACE_COUNTDOWN';

  /* A real one-second interval; the engine is held at zero speed behind it. */
  useEffect(() => {
    if (!inCountdown) return;
    const timer = setInterval(() => {
      setCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1_000);
    return () => clearInterval(timer);
  }, [inCountdown]);

  // Lights out.
  useEffect(() => {
    if (!inCountdown || countdown > 0) return;
    send({ type: 'SET_SPEED', multiplier: TIME_COMPRESSION });
    dispatch({ type: 'COUNTDOWN_COMPLETE' });
  }, [inCountdown, countdown, send, dispatch]);

  const applySpeed = useCallback(
    (next: Speed) => {
      setSpeed(next);
      setPaused(false);
      send({ type: 'SET_SPEED', multiplier: next * TIME_COMPRESSION });
    },
    [send],
  );

  const togglePause = useCallback(() => {
    const nextPaused = !paused;
    setPaused(nextPaused);
    send({ type: 'SET_SPEED', multiplier: nextPaused ? 0 : speed * TIME_COMPRESSION });
  }, [paused, speed, send]);

  if (!state || !currentTrack) return null;

  const totalLaps = scaledLaps(currentTrack, state.settings.raceLengthPct);
  const progressPct = Math.min(100, (snapshot.lap / totalLaps) * 100);
  const ourCars = snapshot.cars.filter(
    (car) => state.driverTeams[car.driverId] === playerTeam?.id,
  );

  const neutralised = snapshot.neutralisedLapsRemaining > 0;

  return (
    <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_374px]">
      {/* Neutralisation banner. The window a VSC opens is short and easy
          to miss, and it is the cheapest stop the race will ever offer. */}
      <AnimatePresence>
        {neutralised && (
          <motion.div
            key="vsc"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-3 rounded-panel border border-neon-amber/50 bg-neon-amber/10 px-4 py-2.5 xl:col-span-2"
          >
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="grid size-7 shrink-0 place-items-center rounded-md bg-neon-amber/20 text-neon-amber"
            >
              <Flag className="size-4" />
            </motion.span>
            <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-neon-amber uppercase">
              Virtual Safety Car
            </span>
            <span className="text-[11px] text-chrome-300">
              The field is neutralised for{' '}
              <span className="font-mono font-bold text-neon-amber">
                {snapshot.neutralisedLapsRemaining}
              </span>{' '}
              more lap{snapshot.neutralisedLapsRemaining === 1 ? '' : 's'}. A stop now costs
              roughly half what it would under green.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session header */}
      <div className="xl:col-span-2">
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-neon-red/30 bg-neon-red/6 px-4 py-3">
          <span className="flex items-center gap-2">
            <StatusDot tone="red" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-neon-red uppercase">
              Race Day
            </span>
          </span>

          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-chrome-100">
              {flagEmoji(currentTrack.countryCode)} {currentTrack.name}
            </p>
            <p className="truncate font-mono text-[10px] text-chrome-500">
              Round {state.round}/{state.settings.seasonLength} · Lap{' '}
              {Math.min(snapshot.lap, totalLaps)}/{totalLaps} · {formatClock(snapshot.elapsedMs)}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {ourCars.map((car) => (
              <Badge key={car.driverId} tone="cyan" mono>
                {DRIVER_BY_ID.get(car.driverId)?.code ?? car.driverId}{' '}
                {car.status === 'RETIRED' ? 'DNF' : `P${car.position}`}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-neon-red/60 to-neon-red"
            style={{ boxShadow: '0 0 12px var(--color-neon-red)' }}
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ ease: 'linear', duration: 0.3 }}
          />
        </div>
      </div>

      {/* Map */}
      <Panel
        title="Circuit"
        icon={<MapIcon className="size-3.5" />}
        flush
        className="min-h-[380px] xl:min-h-[540px]"
        bodyClassName="relative"
        actions={
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-chrome-400 uppercase">
            <StatusDot tone={snapshot.sessionState === 'RUNNING' ? 'lime' : 'amber'} />
            {snapshot.sessionState}
          </span>
        }
      >
        <CircuitMap className="h-full" />
      </Panel>

      {/* Radio + tyres */}
      <RadioPanel />

      {/* Session control */}
      <Panel title="Session Control" icon={<Gauge className="size-3.5" />}>
        <p className="eyebrow mb-2">Playback speed</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={togglePause}
            disabled={inCountdown}
            className={cx(
              'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold tracking-wider uppercase transition-colors disabled:opacity-40',
              paused
                ? 'border-neon-amber/50 bg-neon-amber/12 text-neon-amber'
                : 'border-carbon-500 bg-carbon-800 text-chrome-300 hover:text-chrome-100',
            )}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </button>

          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => applySpeed(option)}
              disabled={inCountdown}
              title={`${option}x — ${option * TIME_COMPRESSION} simulated seconds per real second`}
              className={cx(
                'flex items-center gap-1 rounded-lg border px-3.5 py-2 text-[11px] font-bold tracking-wider uppercase transition-all disabled:opacity-40',
                speed === option && !paused
                  ? 'border-neon-cyan/50 bg-neon-cyan/15 text-neon-cyan shadow-[0_0_18px_-6px_var(--color-neon-cyan)]'
                  : 'border-carbon-500 bg-carbon-800 text-chrome-300 hover:text-chrome-100',
              )}
            >
              {option === 5 ? (
                <Rabbit className="size-3.5" />
              ) : option === 3 ? (
                <FastForward className="size-3.5" />
              ) : null}
              {option}x
            </button>
          ))}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-chrome-500">
          A Grand Prix is time-compressed so it fits into a couple of minutes; each button's
          tooltip shows the effective ratio.
        </p>

        {/* The traces the next strategy call will be made on. */}
        <SessionTelemetry trace={trace} onTraceChange={setTrace} />

        {snapshot.sessionState === 'FINISHED' && (
          <GameButton
            size="lg"
            className="mt-3 w-full"
            onClick={() => onNavigate('game-season')}
            icon={<Flag className="size-4" />}
          >
            Chequered flag — see the result
          </GameButton>
        )}
      </Panel>

      {/* Timing tower */}
      <Panel
        title="Live Timing"
        icon={<Activity className="size-3.5" />}
        flush
        className="max-h-[520px] min-h-[360px]"
      >
        <LiveTimingPanel />
      </Panel>

      {/* Race feed */}
      <Panel
        title="Race Feed"
        icon={<Timer className="size-3.5" />}
        bodyClassName="max-h-[320px] overflow-y-auto"
      >
        <ul className="space-y-1.5">
          {snapshot.incidents.slice(0, 16).map((incident) => {
            const driver = incident.driverId ? DRIVER_BY_ID.get(incident.driverId) : undefined;
            return (
              <li
                key={incident.id}
                className="flex items-start gap-2 rounded-md border border-carbon-700/60 bg-carbon-900/40 px-2.5 py-1.5"
              >
                <Badge
                  tone={
                    incident.kind === 'OVERTAKE'
                      ? 'red'
                      : incident.kind === 'PIT_STOP'
                        ? 'amber'
                        : incident.kind === 'RADIO'
                          ? 'violet'
                          : 'neutral'
                  }
                  className="shrink-0"
                >
                  L{incident.lap}
                </Badge>
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-chrome-300">
                  {driver && (
                    <span className="font-mono font-bold text-chrome-100">{driver.code} </span>
                  )}
                  {incident.message}
                </p>
              </li>
            );
          })}
          {snapshot.incidents.length === 0 && (
            <li className="py-6 text-center text-[11px] text-chrome-500">
              No incidents reported yet this session.
            </li>
          )}
        </ul>
      </Panel>

      {/* Countdown */}
      <AnimatePresence>
        {inCountdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-carbon-950/88 backdrop-blur-sm"
          >
            <div className="text-center">
              <p className="font-mono text-[11px] tracking-[0.3em] text-chrome-400 uppercase">
                Grid set from qualifying
              </p>

              <motion.p
                key={countdown}
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                className={cx(
                  'my-4 font-mono text-[9rem] leading-none font-black tabular-nums',
                  countdown <= 3 ? 'text-neon-red' : 'text-chrome-100',
                )}
                style={{
                  textShadow:
                    countdown <= 3
                      ? '0 0 60px var(--color-neon-red)'
                      : '0 0 50px rgba(46,230,214,0.45)',
                }}
              >
                {countdown}
              </motion.p>

              <div className="flex items-center justify-center gap-2.5">
                {Array.from({ length: 5 }).map((_, index) => {
                  const lit = COUNTDOWN_SECONDS - countdown > index * 2;
                  return (
                    <span
                      key={index}
                      className={cx(
                        'size-5 rounded-full border-2 transition-colors duration-300',
                        lit ? 'border-neon-red bg-neon-red' : 'border-carbon-500 bg-carbon-800',
                      )}
                      style={lit ? { boxShadow: '0 0 20px var(--color-neon-red)' } : undefined}
                    />
                  );
                })}
              </div>

              <p className="mt-5 flex items-center justify-center gap-2 text-[12px] text-chrome-400">
                <Flag className="size-4" />
                {totalLaps} laps · {currentTrack.name}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------- view -------------------------------- */

/**
 * Pitwall Live. On race day this is the cockpit; the rest of the weekend
 * it tells the player where they actually are.
 */
export function PitwallView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { phase } = useGame();

  // The hook that reads the race session lives in the child, so it is only
  // called when a session actually exists.
  if (!isRacePhase(phase)) return <PitwallEmptyState onNavigate={onNavigate} />;
  return <PitwallRace onNavigate={onNavigate} />;
}
