import { useMemo } from 'react';
import { splinePath } from '@/lib/geometry';
import { cx } from '@/lib/format';
import { PROFILE_COLOR } from '@/lib/trackProfile';
import type { Track } from '@/types/career';

interface TrackThumbnailProps {
  track: Track;
  /** Ribbon width in view-box units — larger reads better at small sizes. */
  strokeWidth?: number;
  className?: string;
  muted?: boolean;
  showStartLine?: boolean;
}

/**
 * Renders a circuit from its anchor points. The same `splinePath` used
 * by the live race map, so a career track and a race-day track are the
 * same curve drawn at different scales.
 */
export function TrackThumbnail({
  track,
  strokeWidth = 26,
  className,
  muted = false,
  showStartLine = false,
}: TrackThumbnailProps) {
  const path = useMemo(() => splinePath(track.layout.anchors, true), [track.layout.anchors]);
  const { x, y, width, height } = track.layout.viewBox;
  const color = PROFILE_COLOR[track.profile];
  const start = track.layout.anchors[0];

  return (
    <svg
      viewBox={`${x} ${y} ${width} ${height}`}
      className={cx('h-full w-full', className)}
      role="img"
      aria-label={`${track.name} layout`}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-carbon-600)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth * 0.42}
        strokeLinejoin="round"
        opacity={muted ? 0.45 : 0.95}
        style={muted ? undefined : { filter: `drop-shadow(0 0 6px ${color})` }}
      />
      {showStartLine && start && (
        <circle
          cx={start.x}
          cy={start.y}
          r={strokeWidth * 0.42}
          fill="var(--color-chrome-100)"
        />
      )}
    </svg>
  );
}
