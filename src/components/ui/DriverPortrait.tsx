import { useId } from 'react';
import { cx } from '@/lib/format';
/* Generated helmet "portraits" — deterministic per driver, so the roster
 * reads as distinct people without shipping any photography. */

/** Structural minimum, so race-weekend and career drivers both fit. */
export interface PortraitDriver {
  id: string;
  firstName: string;
  lastName: string;
  carNumber: number | null;
}

interface DriverPortraitProps {
  driver: PortraitDriver;
  teamColor: string;
  size?: number;
  className?: string;
  showNumber?: boolean;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const HELMET =
  'M 50 7 C 77 7 91 26 91 53 L 91 72 C 91 87 81 95 66 95 L 34 95 C 19 95 9 87 9 72 L 9 53 C 9 26 23 7 50 7 Z';
const VISOR =
  'M 21 45 C 21 34 34 27 50 27 C 66 27 79 34 79 45 L 79 57 C 79 63 70 66 50 66 C 30 66 21 63 21 57 Z';

export function DriverPortrait({
  driver,
  teamColor,
  size = 56,
  className,
  showNumber = true,
}: DriverPortraitProps) {
  const uid = useId().replace(/:/g, '');
  const seed = hash(driver.id);
  const stripeStyle = seed % 3; // 0 = centre stripe, 1 = chevrons, 2 = split
  const tilt = ((seed >> 3) % 7) - 3;

  return (
    <span
      className={cx('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      title={`${driver.firstName} ${driver.lastName}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${driver.firstName} ${driver.lastName} helmet`}>
        <defs>
          <clipPath id={`${uid}-clip`}>
            <path d={HELMET} />
          </clipPath>
          <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="var(--color-carbon-500)" />
            <stop offset="100%" stopColor="var(--color-carbon-800)" />
          </linearGradient>
          <linearGradient id={`${uid}-visor`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#0b1118" />
            <stop offset="55%" stopColor={teamColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor="#050709" />
          </linearGradient>
        </defs>

        <path d={HELMET} fill={`url(#${uid}-shell)`} />

        <g clipPath={`url(#${uid}-clip)`} transform={`rotate(${tilt} 50 50)`}>
          {stripeStyle === 0 && (
            <>
              <rect x="38" y="-10" width="24" height="120" fill={teamColor} opacity="0.9" />
              <rect x="34" y="-10" width="4" height="120" fill={teamColor} opacity="0.45" />
              <rect x="62" y="-10" width="4" height="120" fill={teamColor} opacity="0.45" />
            </>
          )}
          {stripeStyle === 1 && (
            <>
              <path d="M -10 22 L 50 -2 L 110 22 L 110 40 L 50 16 L -10 40 Z" fill={teamColor} opacity="0.92" />
              <path d="M -10 74 L 50 58 L 110 74 L 110 84 L 50 68 L -10 84 Z" fill={teamColor} opacity="0.5" />
            </>
          )}
          {stripeStyle === 2 && (
            <>
              <path d="M -10 -10 L 110 -10 L 110 34 L -10 52 Z" fill={teamColor} opacity="0.88" />
              <path d="M -10 78 L 110 66 L 110 110 L -10 110 Z" fill={teamColor} opacity="0.34" />
            </>
          )}
        </g>

        <path d={HELMET} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
        <path d={VISOR} fill={`url(#${uid}-visor)`} stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
        <path
          d="M 26 40 C 32 34 42 31 52 31"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {showNumber && driver.carNumber != null && (
          <text
            x="50"
            y="86"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="17"
            fontWeight="700"
            fill="var(--color-chrome-100)"
            opacity="0.85"
          >
            {driver.carNumber}
          </text>
        )}
      </svg>
    </span>
  );
}
