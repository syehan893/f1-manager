import { useId } from 'react';
import { cx } from '@/lib/format';

export interface ChartSeries {
  id: string;
  data: number[];
  color: string;
  /** Fill under the line with a fading gradient. */
  area?: boolean;
  dashed?: boolean;
  strokeWidth?: number;
}

export interface ChartBand {
  /** 0-1 across the x axis. */
  from: number;
  to: number;
  color: string;
  label?: string;
}

interface TelemetryChartProps {
  series: ChartSeries[];
  height?: number;
  yMin?: number;
  yMax?: number;
  bands?: ChartBand[];
  /** Horizontal guide lines drawn at these y values. */
  thresholds?: Array<{ value: number; color: string; label?: string }>;
  xLabels?: string[];
  yLabels?: string[];
  showEndDot?: boolean;
  grid?: boolean;
  className?: string;
}

const VB_W = 100;
const VB_H = 100;

function buildPath(values: number[], min: number, max: number): string {
  if (values.length === 0) return '';
  const span = max - min || 1;
  const step = values.length === 1 ? VB_W : VB_W / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y = VB_H - ((value - min) / span) * VB_H;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function TelemetryChart({
  series,
  height = 96,
  yMin,
  yMax,
  bands = [],
  thresholds = [],
  xLabels,
  yLabels,
  showEndDot = true,
  grid = true,
  className,
}: TelemetryChartProps) {
  const uid = useId().replace(/:/g, '');

  const all = series.flatMap((s) => s.data);
  const min = yMin ?? (all.length ? Math.min(...all) : 0);
  const max = yMax ?? (all.length ? Math.max(...all) : 1);
  const span = max - min || 1;

  const toY = (value: number) => VB_H - ((value - min) / span) * VB_H;

  return (
    <div className={cx('w-full', className)}>
      <div className="flex gap-2">
        {yLabels && (
          <div
            className="flex shrink-0 flex-col justify-between py-0.5 font-mono text-[9px] text-chrome-500"
            style={{ height }}
          >
            {yLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        )}

        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label="telemetry chart"
          >
            <defs>
              {series.map((s) => (
                <linearGradient
                  key={s.id}
                  id={`${uid}-${s.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.42" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {grid &&
              [0.25, 0.5, 0.75].map((fraction) => (
                <line
                  key={fraction}
                  x1="0"
                  x2={VB_W}
                  y1={VB_H * fraction}
                  y2={VB_H * fraction}
                  stroke="var(--color-carbon-600)"
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="2 3"
                />
              ))}

            {bands.map((band, index) => (
              <rect
                key={`${band.label ?? 'band'}-${index}`}
                x={band.from * VB_W}
                width={Math.max(0, (band.to - band.from) * VB_W)}
                y="0"
                height={VB_H}
                fill={band.color}
                opacity="0.14"
              />
            ))}

            {thresholds.map((threshold) => (
              <line
                key={`${threshold.label ?? 'threshold'}-${threshold.value}`}
                x1="0"
                x2={VB_W}
                y1={toY(threshold.value)}
                y2={toY(threshold.value)}
                stroke={threshold.color}
                strokeWidth="1"
                strokeDasharray="3 2"
                opacity="0.65"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {series.map((s) => {
              const path = buildPath(s.data, min, max);
              if (!path) return null;
              const areaPath = `${path} L ${VB_W} ${VB_H} L 0 ${VB_H} Z`;

              return (
                <g key={s.id}>
                  {s.area && <path d={areaPath} fill={`url(#${uid}-${s.id})`} />}
                  <path
                    d={path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={s.dashed ? '4 3' : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>

          {/* End-of-trace dots sit outside the squashed viewBox so they stay round. */}
          {showEndDot &&
            series.map((s) => {
              if (s.data.length === 0) return null;
              const last = s.data[s.data.length - 1]!;
              return (
                <span
                  key={s.id}
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: '100%',
                    top: `${(toY(last) / VB_H) * 100}%`,
                    background: s.color,
                    boxShadow: `0 0 10px ${s.color}`,
                  }}
                />
              );
            })}

          {bands.map(
            (band, index) =>
              band.label && (
                <span
                  key={`${band.label}-label-${index}`}
                  className="pointer-events-none absolute top-1 -translate-x-1/2 font-mono text-[9px] font-semibold tracking-wider whitespace-nowrap"
                  style={{
                    left: `${((band.from + band.to) / 2) * 100}%`,
                    color: band.color,
                  }}
                >
                  {band.label}
                </span>
              ),
          )}
        </div>
      </div>

      {xLabels && (
        <div
          className={cx(
            'mt-1.5 flex justify-between font-mono text-[9px] text-chrome-500',
            yLabels && 'pl-8',
          )}
        >
          {xLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
