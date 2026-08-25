import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Flag, Gauge, Radio, Thermometer } from 'lucide-react';
import { CarMarker } from './CarMarker';
import { OvertakeCallout } from './OvertakeCallout';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { DRIVER_BY_ID, driverOf } from '@/data/drivers';
import { useTeamOf } from '@/state/useTeamOf';
import { createClampedSampler, createPathSampler, splinePath } from '@/lib/geometry';
import { cx, formatGap, formatLapTime } from '@/lib/format';
import { useRace } from '@/state/raceContext';

/** Cars whose 3-letter code is drawn on the map. */
const LABELLED_POSITIONS = 5;

export function CircuitMap({ className }: { className?: string }) {
  const teamOfDriver = useTeamOf();
  const {
    circuit,
    snapshot,
    motion,
    activeOvertakes,
    focusedDriverId,
    setFocusedDriverId,
  } = useRace();

  /* Track geometry is derived once per circuit. */
  const { trackPath, pitPath, trackSampler, pitSampler } = useMemo(() => {
    const trackD = splinePath(circuit.anchors, true);
    const pitD = splinePath(circuit.pitAnchors, false);
    return {
      trackPath: trackD,
      pitPath: pitD,
      trackSampler: createPathSampler(trackD, 1400),
      pitSampler: createClampedSampler(pitD, 260),
    };
  }, [circuit]);

  const markerAt = (progress: number, rotate = true) => {
    const point = trackSampler.at(progress);
    return rotate
      ? `translate(${point.x} ${point.y}) rotate(${point.angle})`
      : `translate(${point.x} ${point.y})`;
  };

  const focusedCar = snapshot.cars.find((car) => car.driverId === focusedDriverId);
  const focusedDriver = focusedCar ? driverOf(focusedCar.driverId) : null;
  const leader = snapshot.cars[0];

  const overtakingIds = new Set(activeOvertakes.map((event) => event.overtakerId));
  const overtakenIds = new Set(activeOvertakes.map((event) => event.overtakenId));

  const sectorProgress = [
    0,
    circuit.sectorSplits[0],
    circuit.sectorSplits[1],
  ];

  return (
    <div className={cx('relative min-h-0 w-full', className)}>
      {/* Backdrop */}
      <div className="panel-grid absolute inset-0 opacity-60" />
      <div className="scanline pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,7,11,0.85)_100%)]" />

      <svg
        viewBox={`${circuit.viewBox.x} ${circuit.viewBox.y} ${circuit.viewBox.width} ${circuit.viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative h-full w-full"
        role="img"
        aria-label={`${circuit.name} live circuit map`}
      >
        <defs>
          <filter id="track-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="asphalt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#18212e" />
            <stop offset="50%" stopColor="#101825" />
            <stop offset="100%" stopColor="#161f2c" />
          </linearGradient>
        </defs>

        {/* Ambient glow under the ribbon */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--color-neon-cyan)"
          strokeWidth={26}
          opacity={0.07}
          filter="url(#track-glow)"
        />

        {/* Pit lane */}
        <g>
          <path
            d={pitPath}
            fill="none"
            stroke="#1b2431"
            strokeWidth={13}
            strokeLinecap="round"
          />
          <path
            d={pitPath}
            fill="none"
            stroke="var(--color-neon-amber)"
            strokeWidth={1.4}
            strokeDasharray="7 7"
            opacity={0.5}
            strokeLinecap="round"
          />
          <text
            x={circuit.pitAnchors[3]?.x ?? 0}
            y={(circuit.pitAnchors[3]?.y ?? 0) + 4}
            dx={22}
            fontSize={11}
            fontWeight={700}
            fontFamily="var(--font-mono)"
            fill="var(--color-neon-amber)"
            opacity={0.75}
            letterSpacing="0.18em"
          >
            PIT
          </text>
        </g>

        {/* Track: wide edge stroke under a narrower surface stroke */}
        <path
          d={trackPath}
          fill="none"
          stroke="#33445a"
          strokeWidth={21}
          strokeLinejoin="round"
        />
        <path
          d={trackPath}
          fill="none"
          stroke="url(#asphalt)"
          strokeWidth={17}
          strokeLinejoin="round"
        />

        {/* DRS activation zones, drawn as sub-segments of the same path.
            `pathLength={1}` lets a dash pattern address the racing line in
            the same 0-1 units the simulation uses. */}
        {circuit.drsZones.map((zone) => {
          const span = zone.end > zone.start ? zone.end - zone.start : 1 - zone.start + zone.end;
          return (
            <g key={zone.label}>
              <path
                d={trackPath}
                fill="none"
                stroke="var(--color-neon-cyan)"
                strokeWidth={17}
                opacity={0.1}
                pathLength={1}
                strokeDasharray={`${span} ${1 - span}`}
                strokeDashoffset={-zone.start}
              />
              <path
                d={trackPath}
                fill="none"
                stroke="var(--color-neon-cyan)"
                strokeWidth={3}
                opacity={0.75}
                pathLength={1}
                strokeDasharray={`${span} ${1 - span}`}
                strokeDashoffset={-zone.start}
              />
            </g>
          );
        })}

        {/* Racing line */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(180,205,235,0.16)"
          strokeWidth={1.2}
          strokeDasharray="10 12"
        />

        {/* Sector markers — the tick follows the track tangent, the label
            stays upright and is pushed out along the normal. */}
        {sectorProgress.map((progress, index) => {
          const point = trackSampler.at(progress);
          const normal = ((point.angle - 90) * Math.PI) / 180;
          const labelX = point.x + Math.cos(normal) * 20;
          const labelY = point.y + Math.sin(normal) * 20;

          return (
            <g key={`sector-${index}`}>
              <line
                transform={markerAt(progress)}
                x1={0}
                y1={-11}
                x2={0}
                y2={11}
                stroke="var(--color-chrome-500)"
                strokeWidth={1.5}
                opacity={0.6}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fontFamily="var(--font-mono)"
                fontWeight={700}
                fill="var(--color-chrome-500)"
                letterSpacing="0.1em"
              >
                S{index + 1}
              </text>
            </g>
          );
        })}

        {/* Start / finish */}
        <g transform={markerAt(circuit.startFinishProgress)}>
          <rect x={-2} y={-11} width={4} height={22} fill="var(--color-chrome-100)" opacity={0.9} />
          <rect x={-2} y={-11} width={4} height={5.5} fill="#05070b" />
          <rect x={-2} y={0} width={4} height={5.5} fill="#05070b" />
        </g>

        {/* Corner labels */}
        {circuit.corners.map((corner) => {
          const point = trackSampler.at(corner.progress);
          return (
            <text
              key={corner.label}
              x={point.x + (corner.offset?.x ?? 0)}
              y={point.y + (corner.offset?.y ?? 0)}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fontFamily="var(--font-mono)"
              fill="var(--color-chrome-500)"
              letterSpacing="0.1em"
              className="select-none"
            >
              {corner.label}
            </text>
          );
        })}

        {/* Cars — rendered slowest-first so the leader sits on top */}
        {[...snapshot.cars].reverse().map((car) => {
          const channel = motion.get(car.driverId);
          if (!channel) return null;
          const driver = DRIVER_BY_ID[car.driverId];
          if (!driver) return null;
          const team = teamOfDriver(car.driverId);

          return (
            <CarMarker
              key={car.driverId}
              driverId={car.driverId}
              code={driver.code}
              position={car.position}
              teamColor={team.color}
              channel={channel}
              track={trackSampler}
              pit={pitSampler}
              isUserTeam={team.isUserTeam}
              isFocused={car.driverId === focusedDriverId}
              isOvertaking={overtakingIds.has(car.driverId)}
              isOvertaken={overtakenIds.has(car.driverId)}
              showLabel={
                car.position <= LABELLED_POSITIONS ||
                team.isUserTeam ||
                car.driverId === focusedDriverId ||
                overtakingIds.has(car.driverId) ||
                overtakenIds.has(car.driverId)
              }
              onSelect={setFocusedDriverId}
            />
          );
        })}

        {/* Overtake callouts */}
        <AnimatePresence>
          {activeOvertakes.map((event) => {
            const overtaker = motion.get(event.overtakerId);
            if (!overtaker) return null;
            return (
              <OvertakeCallout
                key={event.id}
                event={event}
                overtaker={overtaker}
                overtaken={motion.get(event.overtakenId)}
                track={trackSampler}
                pit={pitSampler}
                overtakerCode={driverOf(event.overtakerId).code}
                overtakenCode={driverOf(event.overtakenId).code}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      {/* Circuit identity */}
      <div className="pointer-events-none absolute top-3 left-4">
        <p className="font-mono text-[10px] tracking-[0.2em] text-chrome-500 uppercase">
          {circuit.name}
        </p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-chrome-500">
          <span>{circuit.lengthKm.toFixed(3)} km</span>
          <span className="text-carbon-500">|</span>
          <span>{circuit.corners.length} marked corners</span>
          <span className="text-carbon-500">|</span>
          <span className="text-neon-cyan">2 DRS</span>
        </p>
      </div>

      {/* Conditions */}
      <div className="pointer-events-none absolute top-3 right-4 flex items-center gap-3 font-mono text-[10px] text-chrome-400">
        <span className="flex items-center gap-1">
          <Thermometer className="size-3 text-neon-amber" />
          {snapshot.weather.trackTempC}°C track
        </span>
        <span
          className="flex items-center gap-1"
          style={{
            color:
              snapshot.flag === 'GREEN'
                ? undefined
                : snapshot.flag === 'CHEQUERED'
                  ? 'var(--color-chrome-100)'
                  : 'var(--color-neon-amber)',
          }}
        >
          <Flag
            className="size-3"
            style={{
              color:
                snapshot.flag === 'GREEN'
                  ? 'var(--color-neon-lime)'
                  : 'var(--color-neon-amber)',
            }}
          />
          {snapshot.flag === 'VSC'
            ? `VSC · ${snapshot.neutralisedLapsRemaining}L`
            : snapshot.flag}
        </span>
      </div>

      {/* Focused-car HUD */}
      {focusedCar && focusedDriver && (
        <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-3 rounded-lg border border-carbon-600/80 bg-carbon-900/85 px-3 py-2 backdrop-blur-sm">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-md font-mono text-xs font-bold text-carbon-950"
            style={{ background: teamOfDriver(focusedDriver.id).color }}
          >
            {focusedCar.position}
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-bold tracking-wide text-chrome-100 uppercase">
              {focusedDriver.lastName}
            </p>
            <p className="font-mono text-[10px] text-chrome-500">
              {formatGap(focusedCar.gapToLeaderMs, focusedCar.position === 1)} to leader
            </p>
          </div>
          <span className="h-8 w-px bg-carbon-600" />
          <div className="leading-tight">
            <p className="flex items-center gap-1 font-mono text-[11px] text-chrome-100">
              <Gauge className="size-3 text-neon-cyan" />
              {formatLapTime(focusedCar.lastLapMs)}
            </p>
            <p className="font-mono text-[10px] text-chrome-500">last lap</p>
          </div>
          <span className="h-8 w-px bg-carbon-600" />
          <TyreBadge
            compound={focusedCar.tyre.compound}
            wearPct={focusedCar.tyre.wearPct}
            ageLaps={focusedCar.tyre.ageLaps}
            size="md"
          />
        </div>
      )}

      {/* Leader radio-style ticker */}
      {leader && (
        <div className="pointer-events-none absolute right-4 bottom-3 flex items-center gap-2 rounded-lg border border-carbon-600/80 bg-carbon-900/85 px-3 py-2 font-mono text-[10px] text-chrome-400 backdrop-blur-sm">
          <Radio className="size-3 text-neon-cyan" />
          <span className="text-chrome-300">
            P1 {driverOf(leader.driverId).code}
          </span>
          <span className="text-carbon-500">|</span>
          <span>LAP {snapshot.lap}/{snapshot.totalLaps}</span>
        </div>
      )}
    </div>
  );
}
