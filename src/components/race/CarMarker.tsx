import { memo } from 'react';
import { motion, useTransform } from 'framer-motion';
import type { PathSampler } from '@/lib/geometry';
import type { CarMotion } from '@/state/raceContext';

interface CarMarkerProps {
  driverId: string;
  code: string;
  position: number;
  teamColor: string;
  channel: CarMotion;
  track: PathSampler;
  pit: PathSampler;
  isUserTeam: boolean;
  isFocused: boolean;
  /** Currently completing a pass — draws the red attack ring. */
  isOvertaking: boolean;
  /** Currently being passed — dims and marks the car. */
  isOvertaken: boolean;
  showLabel: boolean;
  onSelect: (driverId: string) => void;
}

/**
 * A single car on the circuit.
 *
 * Position comes from MotionValues written by the race feed at ~60fps,
 * so this component renders only when its *appearance* changes — never
 * for movement. That keeps twenty cars smooth without twenty re-renders
 * per frame.
 */
function CarMarkerImpl({
  driverId,
  code,
  position,
  teamColor,
  channel,
  track,
  pit,
  isUserTeam,
  isFocused,
  isOvertaking,
  isOvertaken,
  showLabel,
  onSelect,
}: CarMarkerProps) {
  const inputs = [channel.progress, channel.pitProgress, channel.inPit];

  const x = useTransform(inputs, ([lap, pitT, inPit]: number[]) =>
    (inPit ?? 0) > 0.5 ? pit.at(pitT ?? 0).x : track.at(lap ?? 0).x,
  );
  const y = useTransform(inputs, ([lap, pitT, inPit]: number[]) =>
    (inPit ?? 0) > 0.5 ? pit.at(pitT ?? 0).y : track.at(lap ?? 0).y,
  );

  const radius = isUserTeam || isFocused ? 8 : 6.5;
  const highlighted = isFocused || isOvertaking;

  return (
    <motion.g
      style={{ x, y }}
      className="cursor-pointer"
      onClick={() => onSelect(driverId)}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: isOvertaken ? 0.75 : 1, scale: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* Generous invisible hit area — the dots themselves are tiny. */}
      <circle r={16} fill="transparent" />

      {/* Attack ring while a pass is in progress */}
      {isOvertaking && (
        <motion.circle
          r={radius + 5}
          fill="none"
          stroke="var(--color-neon-red)"
          strokeWidth={2}
          initial={{ scale: 0.7, opacity: 0.9 }}
          animate={{ scale: [0.8, 1.5, 0.8], opacity: [0.9, 0.15, 0.9] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {isFocused && !isOvertaking && (
        <circle
          r={radius + 4.5}
          fill="none"
          stroke={teamColor}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.85}
        />
      )}

      {/* Body */}
      <circle
        r={radius}
        fill={teamColor}
        stroke={highlighted ? '#ffffff' : 'rgba(5,7,11,0.85)'}
        strokeWidth={highlighted ? 2 : 1.6}
        style={{
          filter: `drop-shadow(0 0 ${highlighted ? 9 : 5}px ${teamColor})`,
        }}
      />

      {/* Position number inside the marker for the cars that matter most */}
      {(isUserTeam || isFocused) && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight={700}
          fontFamily="var(--font-mono)"
          fill="#05070b"
          pointerEvents="none"
        >
          {position}
        </text>
      )}

      {showLabel && (
        <g pointerEvents="none" transform="translate(0, -18)">
          <rect
            x={-19}
            y={-10}
            width={38}
            height={17}
            rx={4}
            fill="rgba(8,11,17,0.92)"
            stroke={isOvertaking ? 'var(--color-neon-red)' : teamColor}
            strokeWidth={1.2}
          />
          <text
            textAnchor="middle"
            y={2}
            fontSize={9.5}
            fontWeight={700}
            fontFamily="var(--font-mono)"
            fill={isOvertaking ? 'var(--color-neon-red)' : 'var(--color-chrome-100)'}
            letterSpacing="0.06em"
          >
            {code}
          </text>
        </g>
      )}
    </motion.g>
  );
}

export const CarMarker = memo(CarMarkerImpl);
