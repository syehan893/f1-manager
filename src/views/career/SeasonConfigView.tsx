import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  CalendarCog,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { TrackThumbnail } from '@/components/career/TrackThumbnail';
import { PROFILE_COLOR, PROFILE_LABEL } from '@/lib/trackProfile';
import { scaledLaps } from '@/game/trackAdapter';
import { cx, flagEmoji } from '@/lib/format';
import { DIFFICULTY_ORDER, profileFor } from '@/game/difficulty';
import { useGame } from '@/state/gameContext';
import type { RaceLengthPct } from '@/game/types';
import type { Track } from '@/types/career';

const RACE_LENGTHS: RaceLengthPct[] = [25, 50, 75, 100];

/* ---------------------------- calendar builder ------------------------ */

function CalendarBuilder({
  tracks,
  draft,
  size,
  onChange,
}: {
  tracks: Track[];
  draft: string[];
  size: number;
  onChange: (next: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [poolHot, setPoolHot] = useState(false);

  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const pool = useMemo(
    () => tracks.filter((track) => !draft.includes(track.id)),
    [tracks, draft],
  );

  const resetDrag = () => {
    setDraggingId(null);
    setHoverIndex(null);
    setPoolHot(false);
  };

  const placeAt = (trackId: string, index: number) => {
    const without = draft.filter((id) => id !== trackId);
    if (draft.length >= size && !draft.includes(trackId)) return;
    const clamped = Math.max(0, Math.min(without.length, index));
    onChange([...without.slice(0, clamped), trackId, ...without.slice(clamped)]);
  };

  const append = (trackId: string) => {
    if (draft.length >= size || draft.includes(trackId)) return;
    onChange([...draft, trackId]);
  };

  const remove = (trackId: string) => onChange(draft.filter((id) => id !== trackId));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* Pool */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setPoolHot(true);
        }}
        onDragLeave={() => setPoolHot(false)}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingId) remove(draggingId);
          resetDrag();
        }}
        className={cx(
          'rounded-lg border p-3 transition-colors',
          poolHot ? 'border-neon-red/50 bg-neon-red/6' : 'border-carbon-600/70 bg-carbon-900/40',
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Circuit Pool</p>
          <Badge tone={pool.length ? 'neutral' : 'lime'} mono>
            {pool.length} available
          </Badge>
        </div>

        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <AnimatePresence initial={false}>
            {pool.map((track) => (
              <motion.li
                key={track.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                draggable
                onDragStart={() => setDraggingId(track.id)}
                onDragEnd={resetDrag}
                className={cx(
                  'group flex cursor-grab items-center gap-2 rounded-lg border border-carbon-700/70 bg-carbon-800/50 p-2 active:cursor-grabbing',
                  'transition-colors hover:border-carbon-500',
                  draggingId === track.id && 'opacity-40',
                )}
              >
                <GripVertical className="size-3.5 shrink-0 text-chrome-500" />
                <span className="size-8 shrink-0">
                  <TrackThumbnail track={track} strokeWidth={40} muted />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-chrome-100">{track.name}</p>
                  <p className="truncate text-[9px] text-chrome-500">
                    {flagEmoji(track.countryCode)} {PROFILE_LABEL[track.profile]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => append(track.id)}
                  disabled={draft.length >= size}
                  aria-label={`Add ${track.name} to the calendar`}
                  className="grid size-6 shrink-0 place-items-center rounded-md border border-carbon-600 text-chrome-400 transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan disabled:opacity-30"
                >
                  <Plus className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>

          {pool.length === 0 && (
            <li className="col-span-full py-8 text-center text-[11px] text-chrome-500">
              Every circuit is scheduled. Drag one back here to drop it from the season.
            </li>
          )}
        </ul>
      </div>

      {/* Calendar */}
      <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Season Calendar</p>
          <Badge tone={draft.length === size ? 'lime' : 'amber'} mono>
            {draft.length}/{size} rounds
          </Badge>
        </div>

        <ul className="space-y-1.5">
          {draft.map((trackId, index) => {
            const track = byId.get(trackId);
            if (!track) return null;
            const isHovered = hoverIndex === index && draggingId !== null;

            return (
              <motion.li
                key={trackId}
                layout
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                draggable
                onDragStart={() => setDraggingId(trackId)}
                onDragEnd={resetDrag}
                onDragOver={(event) => {
                  event.preventDefault();
                  setHoverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingId) placeAt(draggingId, index);
                  resetDrag();
                }}
                className={cx(
                  'flex cursor-grab items-center gap-2 rounded-lg border p-2 transition-colors active:cursor-grabbing',
                  isHovered
                    ? 'border-neon-cyan bg-neon-cyan/10'
                    : 'border-carbon-700/70 bg-carbon-800/50 hover:border-carbon-500',
                  draggingId === trackId && 'opacity-40',
                )}
              >
                <GripVertical className="size-3.5 shrink-0 text-chrome-500" />
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold text-carbon-950"
                  style={{ background: PROFILE_COLOR[track.profile] }}
                >
                  {index + 1}
                </span>
                <span className="size-8 shrink-0">
                  <TrackThumbnail track={track} strokeWidth={40} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-chrome-100">{track.name}</p>
                  <p className="truncate text-[9px] text-chrome-500">
                    {flagEmoji(track.countryCode)} {track.country} · {PROFILE_LABEL[track.profile]}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${track.name} earlier`}
                    className="grid size-6 place-items-center rounded-md border border-carbon-600 text-chrome-400 transition-colors hover:text-chrome-100 disabled:opacity-25"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                    aria-label={`Move ${track.name} later`}
                    className="grid size-6 place-items-center rounded-md border border-carbon-600 text-chrome-400 transition-colors hover:text-chrome-100 disabled:opacity-25"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(trackId)}
                    aria-label={`Remove ${track.name} from the calendar`}
                    className="grid size-6 place-items-center rounded-md border border-carbon-600 text-chrome-400 transition-colors hover:border-neon-red/50 hover:text-neon-red"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </motion.li>
            );
          })}

          <li
            onDragOver={(event) => {
              event.preventDefault();
              setHoverIndex(draft.length);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingId) placeAt(draggingId, draft.length);
              resetDrag();
            }}
            className={cx(
              'rounded-lg border border-dashed py-3 text-center text-[10px] tracking-wider uppercase transition-colors',
              hoverIndex === draft.length && draggingId
                ? 'border-neon-cyan text-neon-cyan'
                : 'border-carbon-600 text-chrome-500',
            )}
          >
            {draft.length >= size ? 'Calendar full' : 'Drop a circuit here to append'}
          </li>
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------- view -------------------------------- */

export function SeasonConfigView() {
  const { state, allTracks, calendar, dispatch } = useGame();

  const [draft, setDraft] = useState<string[]>([]);
  const [syncedCalendar, setSyncedCalendar] = useState<string | null>(null);

  if (!state) return null;

  const serverCalendar = state.calendarTrackIds;
  const calendarSignature = serverCalendar.join('|');

  /* Adjust the draft during render rather than in an effect, and only when
   * the saved calendar itself changed — so editing a rule never wipes an
   * unsaved calendar the player is still arranging. */
  if (calendarSignature !== syncedCalendar) {
    setSyncedCalendar(calendarSignature);
    setDraft(serverCalendar);
  }

  const { settings } = state;
  const calendarDirty = draft.join('|') !== calendarSignature;
  const nextTrack = calendar[0];
  const previewLaps = nextTrack ? scaledLaps(nextTrack, settings.raceLengthPct) : 0;
  const inSeason = state.phase !== 'PRE_SEASON';

  return (
    <div className="grid gap-4">
      <Panel
        title="Season Configuration"
        icon={<SlidersHorizontal className="size-3.5" />}
        actions={
          <Badge tone={inSeason ? 'amber' : 'cyan'}>
            {inSeason ? 'Season under way' : 'Pre-season'}
          </Badge>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Race length */}
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="eyebrow">Race Length</span>
              <span className="font-mono text-2xl leading-none font-bold text-neon-cyan">
                {settings.raceLengthPct}%
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={RACE_LENGTHS.length - 1}
              step={1}
              value={RACE_LENGTHS.indexOf(settings.raceLengthPct)}
              onChange={(event) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  settings: { raceLengthPct: RACE_LENGTHS[Number(event.target.value)]! },
                })
              }
              className="w-full"
              aria-label="Race length percentage"
            />

            <div className="mt-2 flex justify-between">
              {RACE_LENGTHS.map((length) => (
                <button
                  key={length}
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'SET_SETTINGS', settings: { raceLengthPct: length } })
                  }
                  className={cx(
                    'font-mono text-[10px] font-bold transition-colors',
                    settings.raceLengthPct === length
                      ? 'text-neon-cyan'
                      : 'text-chrome-500 hover:text-chrome-300',
                  )}
                >
                  {length}%
                </button>
              ))}
            </div>

            {nextTrack && (
              <p className="mt-3 rounded-md border border-carbon-600/70 bg-carbon-800/50 px-2.5 py-2 text-[11px] text-chrome-400">
                Round 1 at <span className="text-chrome-200">{nextTrack.name}</span> becomes{' '}
                <span className="font-mono font-bold text-neon-cyan">{previewLaps} laps</span> of{' '}
                <span className="font-mono">{nextTrack.laps}</span>.
              </p>
            )}
          </div>

          {/* Discrete rules */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2.5">
              <span className="text-[12px] font-semibold text-chrome-100">AI difficulty</span>
              <SegmentedControl
                name="difficulty"
                size="sm"
                value={settings.difficulty}
                onChange={(value) =>
                  dispatch({ type: 'SET_SETTINGS', settings: { difficulty: value } })
                }
                options={DIFFICULTY_ORDER.map((entry) => ({
                  value: entry,
                  label: profileFor(entry).label,
                }))}
              />
            </div>
            <p className="-mt-1 px-1 text-[10px] leading-relaxed text-chrome-500">
              {profileFor(settings.difficulty).blurb}
            </p>

            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="eyebrow">Championship rounds</span>
                <span className="font-mono text-[15px] font-bold text-chrome-100">
                  {settings.seasonLength}
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={12}
                step={1}
                value={settings.seasonLength}
                disabled={inSeason}
                onChange={(event) =>
                  dispatch({
                    type: 'SET_SETTINGS',
                    settings: { seasonLength: Number(event.target.value) },
                  })
                }
                className="w-full disabled:opacity-40"
                aria-label="Championship rounds"
              />
              <p className="mt-1 text-[10px] text-chrome-500">
                {inSeason
                  ? 'Locked while the championship is running.'
                  : 'Rebuilds the calendar when changed.'}
              </p>
            </div>

            <Toggle
              label="Fastest lap point"
              description="One bonus point for the fastest lap, when finishing in the top ten."
              enabled={settings.fastestLapPoint}
              onChange={(next) =>
                dispatch({ type: 'SET_SETTINGS', settings: { fastestLapPoint: next } })
              }
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Calendar Builder"
        icon={<CalendarCog className="size-3.5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(serverCalendar)}
              disabled={!calendarDirty}
              className="flex items-center gap-1.5 rounded-md border border-carbon-600 px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-chrome-400 uppercase transition-colors hover:text-chrome-100 disabled:opacity-30"
            >
              <RotateCcw className="size-3" /> Revert
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_CALENDAR', trackIds: draft })}
              disabled={inSeason || !calendarDirty || draft.length !== settings.seasonLength}
              title={inSeason ? 'The calendar is fixed once the championship starts.' : undefined}
              className="flex items-center gap-1.5 rounded-md border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-neon-cyan uppercase transition-colors hover:bg-neon-cyan/20 disabled:border-carbon-600 disabled:bg-carbon-800 disabled:text-chrome-500"
            >
              <Save className="size-3" />
              {draft.length === settings.seasonLength
                ? 'Save calendar'
                : `Need ${settings.seasonLength - draft.length} more`}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-[11px] text-chrome-500">
          {inSeason
            ? 'The calendar is fixed once the championship is running — this is the season as it stands.'
            : `Drag circuits between the pool and the calendar to build a ${settings.seasonLength}-round season, or reorder rounds with the arrows. Changes are staged until you save.`}
        </p>
        <CalendarBuilder
          tracks={allTracks}
          draft={draft}
          size={settings.seasonLength}
          onChange={setDraft}
        />
      </Panel>
    </div>
  );
}
