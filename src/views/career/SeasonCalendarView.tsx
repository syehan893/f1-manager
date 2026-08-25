import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Flag,
  Gauge,
  MapPin,
  Milestone,
  Thermometer,
  Trophy,
  Wind,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { TrackThumbnail } from '@/components/career/TrackThumbnail';
import { PROFILE_COLOR, PROFILE_LABEL } from '@/lib/trackProfile';
import { WEATHER_ICON, WEATHER_LABEL, WEATHER_TONE } from '@/lib/weather';
import { scaledLaps } from '@/game/trackAdapter';
import { cx, flagEmoji, formatLapTime } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import { PHASE_LABEL } from '@/game/phases';
import { GameButton } from '@/components/game/GameButton';
import type { RoundRecord } from '@/game/types';
import type { ViewId } from '@/types';
import type { Track, TrackCharacteristics } from '@/types/career';

const CHARACTERISTIC_ROWS: Array<{
  key: keyof TrackCharacteristics;
  label: string;
  color: string;
}> = [
  { key: 'downforce', label: 'Downforce', color: 'var(--color-neon-violet)' },
  { key: 'power', label: 'Power', color: 'var(--color-neon-red)' },
  { key: 'tyreStress', label: 'Tyre stress', color: 'var(--color-neon-amber)' },
  { key: 'braking', label: 'Braking', color: 'var(--color-neon-blue)' },
  { key: 'overtaking', label: 'Overtaking', color: 'var(--color-neon-lime)' },
];

type RoundStatus = 'COMPLETED' | 'NEXT' | 'UPCOMING';

interface CalendarRow {
  round: number;
  track: Track;
  status: RoundStatus;
  record: RoundRecord | undefined;
}

/* ------------------------------ next race ----------------------------- */

function NextRaceHero({ row, laps }: { row: CalendarRow; laps: number }) {
  const { track } = row;
  const WeatherIcon = WEATHER_ICON[track.forecast.kind];
  const accent = PROFILE_COLOR[track.profile];

  const setupBias =
    track.characteristics.downforce - track.characteristics.power > 15
      ? 'High-downforce setup — trade top speed for corner load.'
      : track.characteristics.power - track.characteristics.downforce > 15
        ? 'Low-drag setup — straight-line speed wins here.'
        : 'Balanced setup — no single axis dominates this layout.';

  return (
    <Panel
      title="Next Race"
      icon={<Flag className="size-3.5" />}
      actions={
        <span className="flex items-center gap-2">
          <StatusDot tone="red" />
          <Badge tone="red">Round {row.round}</Badge>
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="relative">
          <div
            className="relative overflow-hidden rounded-lg border border-carbon-600/70 bg-carbon-900/50 p-3"
            style={{ boxShadow: `inset 0 0 60px -30px ${accent}` }}
          >
            <div className="panel-grid absolute inset-0 opacity-40" />
            <div className="relative aspect-[16/10]">
              <TrackThumbnail track={track} strokeWidth={22} showStartLine />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: 'Race laps', value: laps, icon: Milestone },
              { label: 'Length', value: `${track.lengthKm.toFixed(3)}km`, icon: MapPin },
              { label: 'Corners', value: track.cornerCount, icon: Gauge },
              { label: 'DRS', value: track.drsZones, icon: Wind },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2 py-2 text-center"
                >
                  <Icon className="mx-auto size-3.5 text-chrome-500" />
                  <p className="mt-1 font-mono text-[13px] font-bold text-chrome-100">
                    {stat.value}
                  </p>
                  <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
                    {stat.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-lg leading-tight font-bold text-chrome-100">
                <span className="text-xl leading-none">{flagEmoji(track.countryCode)}</span>
                <span className="truncate">{track.name}</span>
              </h3>
              <p className="mt-0.5 text-[11px] text-chrome-500">
                {track.city}, {track.country}
              </p>
            </div>
            <Badge tone="neutral" className="shrink-0">
              <span style={{ color: accent }}>{PROFILE_LABEL[track.profile]}</span>
            </Badge>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: 'Conditions',
                value: WEATHER_LABEL[track.forecast.kind],
                icon: WeatherIcon,
                tone: WEATHER_TONE[track.forecast.kind],
              },
              { label: 'Air', value: `${track.forecast.airTempC}°C`, icon: Thermometer, tone: 'text-neon-amber' },
              { label: 'Track', value: `${track.forecast.trackTempC}°C`, icon: Thermometer, tone: 'text-neon-red' },
              { label: 'Rain', value: `${track.forecast.rainChancePct}%`, icon: Droplets, tone: 'text-neon-blue' },
            ].map((cell) => {
              const Icon = cell.icon;
              return (
                <div
                  key={cell.label}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2"
                >
                  <Icon className={cx('size-3.5', cell.tone)} />
                  <p className="mt-1 font-mono text-[12px] font-bold text-chrome-100">
                    {cell.value}
                  </p>
                  <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
                    {cell.label}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
            <p className="eyebrow mb-2.5">Track Characteristics</p>
            <div className="space-y-2">
              {CHARACTERISTIC_ROWS.map((characteristic) => (
                <div key={characteristic.key}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[10px] tracking-wide text-chrome-400 uppercase">
                      {characteristic.label}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-chrome-200">
                      {track.characteristics[characteristic.key]}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${track.characteristics[characteristic.key]}%` }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                      style={{
                        background: characteristic.color,
                        boxShadow: `0 0 8px ${characteristic.color}`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 border-t border-carbon-600/60 pt-2.5 text-[11px] leading-relaxed text-chrome-400">
              {setupBias} Lap record{' '}
              <span className="font-mono text-chrome-200">{formatLapTime(track.lapRecordMs)}</span>.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------- timeline ----------------------------- */

function RoundCard({ row }: { row: CalendarRow }) {
  const { track, status, record } = row;
  const isNext = status === 'NEXT';
  const isDone = status === 'COMPLETED';
  const accent = PROFILE_COLOR[track.profile];
  const WeatherIcon = WEATHER_ICON[track.forecast.kind];

  return (
    <motion.li
      layout
      className={cx(
        'relative w-[186px] shrink-0 rounded-lg border p-3 transition-colors',
        isNext
          ? 'border-neon-red/50 bg-neon-red/8'
          : isDone
            ? 'border-carbon-700/60 bg-carbon-900/30'
            : 'border-carbon-600/70 bg-carbon-900/45 hover:border-carbon-500',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cx(
            'grid size-6 place-items-center rounded-md font-mono text-[10px] font-bold',
            isNext ? 'bg-neon-red text-white' : 'bg-carbon-700 text-chrome-300',
          )}
        >
          {row.round}
        </span>
        {isNext ? (
          <Badge tone="red">Next</Badge>
        ) : isDone && record?.bestFinish ? (
          <span className="font-mono text-[11px] font-bold text-chrome-300">
            P{record.bestFinish}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-chrome-500">—</span>
        )}
      </div>

      <div className={cx('mt-2 h-16', isDone && 'opacity-55')}>
        <TrackThumbnail track={track} strokeWidth={30} muted={isDone} />
      </div>

      <p className="mt-2 truncate text-[11px] font-semibold text-chrome-100">{track.name}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-chrome-500">
        <span>{flagEmoji(track.countryCode)}</span>
        <span className="truncate">{track.country}</span>
      </p>

      <div className="mt-2 flex items-center justify-between border-t border-carbon-700/60 pt-2">
        <span className="font-mono text-[9px] tracking-wider" style={{ color: accent }}>
          {PROFILE_LABEL[track.profile].toUpperCase()}
        </span>
        <span className="flex items-center gap-1">
          <WeatherIcon className={cx('size-3', WEATHER_TONE[track.forecast.kind])} />
          <span className="font-mono text-[9px] text-chrome-500">
            {track.forecast.rainChancePct}%
          </span>
        </span>
      </div>

      {isDone && record && (
        <p className="mt-1.5 font-mono text-[9px] text-neon-lime">
          +{record.pointsScored} pts
        </p>
      )}
    </motion.li>
  );
}

/* --------------------------------- view -------------------------------- */

export function SeasonCalendarView({ onNavigate }: { onNavigate?: (view: ViewId) => void } = {}) {
  const { state, calendar, phase } = useGame();
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo<CalendarRow[]>(() => {
    if (!state) return [];
    return calendar.map((track, index) => {
      const round = index + 1;
      return {
        round,
        track,
        status:
          round < state.round ? 'COMPLETED' : round === state.round ? 'NEXT' : 'UPCOMING',
        record: state.history.find(
          (entry) => entry.season === state.season && entry.round === round,
        ),
      };
    });
  }, [state, calendar]);

  const summary = useMemo(() => {
    const completed = rows.filter((row) => row.status === 'COMPLETED');
    const points = completed.reduce((sum, row) => sum + (row.record?.pointsScored ?? 0), 0);
    const finishes = completed
      .map((row) => row.record?.bestFinish)
      .filter((value): value is number => typeof value === 'number');
    return {
      completed: completed.length,
      total: rows.length,
      points,
      best: finishes.length ? Math.min(...finishes) : null,
    };
  }, [rows]);

  if (!state) return null;

  const nextRow = rows.find((row) => row.status === 'NEXT') ?? rows[0];
  const laps = nextRow ? scaledLaps(nextRow.track, state.settings.raceLengthPct) : 0;
  const scrollBy = (direction: -1 | 1) =>
    scroller.current?.scrollBy({ left: direction * 400, behavior: 'smooth' });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Season', value: String(state.season), tone: 'text-chrome-100' },
          {
            label: 'Rounds run',
            value: `${summary.completed} / ${summary.total}`,
            tone: 'text-neon-cyan',
          },
          { label: 'Points', value: String(summary.points), tone: 'text-neon-lime' },
          {
            label: 'Best finish',
            value: summary.best ? `P${summary.best}` : '—',
            tone: 'text-neon-amber',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-carbon-600/70 bg-carbon-850/70 px-3 py-2.5"
          >
            <p className="text-[9px] tracking-widest text-chrome-500 uppercase">{stat.label}</p>
            <p className={cx('mt-1 font-mono text-lg font-bold', stat.tone)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Where the weekend currently stands */}
      {nextRow && (
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-carbon-600/70 bg-carbon-850/70 px-4 py-3">
          <Badge tone="cyan" mono>
            {PHASE_LABEL[phase]}
          </Badge>
          <p className="min-w-0 flex-1 truncate text-[12px] text-chrome-400">
            Round {nextRow.round} at{' '}
            <span className="font-semibold text-chrome-200">{nextRow.track.name}</span> is the
            next race on the calendar.
          </p>
          {onNavigate && (
            <GameButton size="sm" onClick={() => onNavigate('game-season')}>
              Go to the weekend
            </GameButton>
          )}
        </div>
      )}

      {nextRow && <NextRaceHero row={nextRow} laps={laps} />}

      <Panel
        title="Season Calendar"
        icon={<CalendarDays className="size-3.5" />}
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral" mono>
              {rows.length} rounds
            </Badge>
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => scrollBy(direction)}
                aria-label={direction === -1 ? 'Scroll calendar left' : 'Scroll calendar right'}
                className="grid size-7 place-items-center rounded-md border border-carbon-600 text-chrome-400 transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan"
              >
                {direction === -1 ? (
                  <ChevronLeft className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            ))}
          </div>
        }
      >
        <div className="relative">
          <div className="absolute top-[38px] right-0 left-0 h-px bg-gradient-to-r from-transparent via-carbon-500 to-transparent" />
          <div
            ref={scroller}
            className="relative flex gap-3 overflow-x-auto pb-2"
            role="list"
            aria-label="Season calendar"
          >
            {rows.map((row) => (
              <RoundCard key={row.track.id} row={row} />
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-carbon-600/60 pt-3">
          {[
            { label: 'Completed', tone: 'bg-carbon-500' },
            { label: 'Next race', tone: 'bg-neon-red' },
            { label: 'Upcoming', tone: 'bg-carbon-400' },
          ].map((legend) => (
            <span key={legend.label} className="flex items-center gap-1.5">
              <span className={cx('size-2 rounded-full', legend.tone)} />
              <span className="text-[10px] tracking-wider text-chrome-500 uppercase">
                {legend.label}
              </span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-chrome-500">
            <Trophy className="size-3 text-neon-amber" />
            {summary.points} points banked this season
          </span>
        </div>
      </Panel>
    </div>
  );
}
