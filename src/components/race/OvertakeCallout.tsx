import { motion, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import type { PathSampler } from '@/lib/geometry';
import type { CarMotion } from '@/state/raceContext';
import type { OvertakeEvent } from '@/types';

/** Resolve a car's live map coordinates from its motion channel. */
function useCarPoint(channel: CarMotion, track: PathSampler, pit: PathSampler) {
  const inputs = [channel.progress, channel.pitProgress, channel.inPit];
  const x = useTransform(inputs, ([lap, pitT, inPit]: number[]) =>
    (inPit ?? 0) > 0.5 ? pit.at(pitT ?? 0).x : track.at(lap ?? 0).x,
  );
  const y = useTransform(inputs, ([lap, pitT, inPit]: number[]) =>
    (inPit ?? 0) > 0.5 ? pit.at(pitT ?? 0).y : track.at(lap ?? 0).y,
  );
  return { x, y };
}

interface ConnectorProps {
  from: { x: MotionValue<number>; y: MotionValue<number> };
  to: { x: MotionValue<number>; y: MotionValue<number> };
}

/**
 * Red attack arrow drawn from the passed car to the passing car.
 * Everything is expressed as transforms so it tracks both dots at 60fps
 * without a single React render.
 */
function AttackConnector({ from, to }: ConnectorProps) {
  const coords = [from.x, from.y, to.x, to.y];

  const midX = useTransform(coords, ([x1, , x2]: number[]) => ((x1 ?? 0) + (x2 ?? 0)) / 2);
  const midY = useTransform(coords, ([, y1, , y2]: number[]) => ((y1 ?? 0) + (y2 ?? 0)) / 2);
  const angle = useTransform(
    coords,
    ([x1, y1, x2, y2]: number[]) =>
      (Math.atan2((y2 ?? 0) - (y1 ?? 0), (x2 ?? 0) - (x1 ?? 0)) * 180) / Math.PI,
  );
  const length = useTransform(coords, ([x1, y1, x2, y2]: number[]) =>
    Math.hypot((x2 ?? 0) - (x1 ?? 0), (y2 ?? 0) - (y1 ?? 0)),
  );

  // Stop the shaft short of the marker so the head sits just off the dot.
  const shaftScale = useTransform(length, (l) => Math.max(0, l - 20));
  const headOffset = useTransform(length, (l) => Math.max(0, l - 20) / 2);

  return (
    <motion.g
      style={{ x: midX, y: midY, rotate: angle }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0.55] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      pointerEvents="none"
    >
      <motion.rect
        x={-0.5}
        y={-1.6}
        width={1}
        height={3.2}
        rx={1.4}
        fill="var(--color-neon-red)"
        style={{ scaleX: shaftScale }}
        opacity={0.85}
      />
      <motion.g style={{ x: headOffset }}>
        <path
          d="M 0 -7 L 13 0 L 0 7 L 3.5 0 Z"
          fill="var(--color-neon-red)"
          style={{ filter: 'drop-shadow(0 0 6px var(--color-neon-red))' }}
        />
      </motion.g>
    </motion.g>
  );
}

interface OvertakeCalloutProps {
  event: OvertakeEvent;
  overtaker: CarMotion;
  overtaken: CarMotion | undefined;
  track: PathSampler;
  pit: PathSampler;
  overtakerCode: string;
  overtakenCode: string;
}

export function OvertakeCallout({
  event,
  overtaker,
  overtaken,
  track,
  pit,
  overtakerCode,
  overtakenCode,
}: OvertakeCalloutProps) {
  const head = useCarPoint(overtaker, track, pit);
  const tailChannel = overtaken ?? overtaker;
  const tail = useCarPoint(tailChannel, track, pit);

  return (
    <g pointerEvents="none">
      {overtaken && <AttackConnector from={tail} to={head} />}

      <motion.g
        style={{ x: head.x, y: head.y }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7, y: -8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      >
        <motion.g
          animate={{ y: [-34, -39, -34] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Pointer down to the dot */}
          <path d="M 0 14 L -6 6 L 6 6 Z" fill="var(--color-neon-red)" />

          <rect
            x={-56}
            y={-16}
            width={112}
            height={23}
            rx={6}
            fill="rgba(10,4,7,0.94)"
            stroke="var(--color-neon-red)"
            strokeWidth={1.5}
            style={{ filter: 'drop-shadow(0 0 14px rgba(255,45,70,0.55))' }}
          />
          <text
            textAnchor="middle"
            y={-6}
            fontSize={10}
            fontWeight={800}
            fontFamily="var(--font-sans)"
            fill="var(--color-neon-red)"
            letterSpacing="0.14em"
          >
            OVERTAKE!
          </text>
          <text
            textAnchor="middle"
            y={3.5}
            fontSize={7.5}
            fontWeight={600}
            fontFamily="var(--font-mono)"
            fill="var(--color-chrome-300)"
            letterSpacing="0.08em"
          >
            {overtakerCode} ▸ {overtakenCode} · {event.cornerLabel}
          </text>
        </motion.g>
      </motion.g>
    </g>
  );
}
