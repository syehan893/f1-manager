import { useState } from 'react';
import {
  Bell,
  Database,
  Gauge,
  HardDrive,
  Palette,
  Plug,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { GameButton } from '@/components/game/GameButton';
import { SLOT_ID } from '@/game/persistence';
import { cx } from '@/lib/format';
import { DIFFICULTY_ORDER, profileFor } from '@/game/difficulty';
import { playSound as playSample } from '@/lib/audio';
import { useSoundPrefs } from '@/state/useSound';
import { useGame } from '@/state/gameContext';

export function SettingsView() {
  const sound = useSoundPrefs();
  const { state, origin, dispatch, save } = useGame();

  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [toggles, setToggles] = useState({
    overtakeAlerts: true,
    radioChatter: true,
    autoPause: false,
    reducedMotion: false,
  });

  const setToggle = (key: keyof typeof toggles) => (next: boolean) =>
    setToggles((current) => ({ ...current, [key]: next }));

  const apiBase = (import.meta.env.VITE_CAREER_API_URL as string | undefined) ??
    (import.meta.env.DEV ? 'http://localhost:4000' : '');
  const online = origin === 'database';

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Simulation" icon={<Gauge className="size-3.5" />}>
        <div className="space-y-3">
          <p className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3 text-[11px] leading-relaxed text-chrome-400">
            Playback speed (pause, 1x, 2x, 3x, 5x) lives on Pitwall Live, alongside the rest of
            the race controls.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
            <div>
              <p className="text-[12px] font-semibold text-chrome-100">AI difficulty</p>
              <p className="mt-0.5 text-[10px] text-chrome-500">
                Tightens the field. Saved with the career.
              </p>
            </div>
            <SegmentedControl
              name="settings-difficulty"
              size="sm"
              value={state?.settings.difficulty ?? 'PRO'}
              onChange={(value) => dispatch({ type: 'SET_SETTINGS', settings: { difficulty: value } })}
              options={DIFFICULTY_ORDER.map((entry) => ({
                  value: entry,
                  label: profileFor(entry).label,
                }))}
            />
          </div>
          <p className="-mt-1 px-1 text-[10px] leading-relaxed text-chrome-500">
            {profileFor(state?.settings.difficulty ?? 'PRO').blurb}
          </p>

          <Toggle
            label="Auto-pause on incident"
            description="Halt the session whenever a retirement or flag is reported."
            enabled={toggles.autoPause}
            onChange={setToggle('autoPause')}
          />
        </div>
      </Panel>

      <Panel title="Notifications" icon={<Bell className="size-3.5" />}>
        <div className="space-y-3">
          <Toggle
            label="Overtake alerts"
            description="Flash the timing tower and drop a callout on the circuit map."
            enabled={toggles.overtakeAlerts}
            onChange={setToggle('overtakeAlerts')}
          />
          <Toggle
            label="Team radio chatter"
            description="Surface driver and engineer messages in the race feed."
            enabled={toggles.radioChatter}
            onChange={setToggle('radioChatter')}
          />
          <Toggle
            label="Reduce motion"
            description="Disable callout animations for lower GPU load."
            enabled={toggles.reducedMotion}
            onChange={setToggle('reducedMotion')}
          />
        </div>
      </Panel>

      <Panel title="Sound" icon={<Volume2 className="size-3.5" />}>
        <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
          Every sound in the game is generated in the browser rather than loaded — the engine
          note follows the leader's pace instead of looping a recording, and nothing is
          downloaded. Your setting is remembered on this device.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              sound.toggle();
              if (sound.muted) playSample('confirm');
            }}
            title={sound.muted ? 'Turn sound on' : 'Mute everything'}
            className={cx(
              'grid size-10 shrink-0 place-items-center rounded-lg border transition-colors',
              sound.muted
                ? 'border-carbon-600 bg-carbon-800/70 text-chrome-500'
                : 'border-neon-cyan/45 bg-neon-cyan/12 text-neon-cyan',
            )}
          >
            {sound.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>

          <label className="min-w-0 flex-1">
            <span className="flex items-center justify-between text-[10px] tracking-widest text-chrome-500 uppercase">
              Master volume
              <span className="font-mono text-chrome-300">
                {sound.muted ? 'muted' : `${Math.round(sound.volume * 100)}%`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sound.volume * 100)}
              disabled={sound.muted}
              aria-label="Master volume"
              onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
              onPointerUp={() => playSample('click')}
              className="mt-1.5 w-full accent-[var(--color-neon-cyan)] disabled:opacity-40"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ['Pit stop', 'pitStop'],
              ['Overtake', 'overtake'],
              ['Radio', 'radio'],
              ['Fastest lap', 'fastestLap'],
              ['Chequered', 'chequered'],
            ] as const
          ).map(([label, id]) => (
            <button
              key={id}
              type="button"
              disabled={sound.muted}
              onClick={() => playSample(id)}
              className="rounded-md border border-carbon-600 bg-carbon-900/60 px-2.5 py-1 text-[10px] font-bold tracking-wider text-chrome-400 uppercase transition-colors hover:text-chrome-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Interface" icon={<Palette className="size-3.5" />}>
        <div className="space-y-3">
          {[
            {
              name: 'units',
              label: 'Units',
              blurb: 'Temperature, speed and fuel readouts.',
              value: units,
              onChange: (value: string) => setUnits(value as 'metric' | 'imperial'),
              options: [
                { value: 'metric', label: 'Metric' },
                { value: 'imperial', label: 'Imperial' },
              ],
            },
            {
              name: 'density',
              label: 'Table density',
              blurb: 'Row height across timing and standings tables.',
              value: density,
              onChange: (value: string) => setDensity(value as 'comfortable' | 'compact'),
              options: [
                { value: 'comfortable', label: 'Comfort' },
                { value: 'compact', label: 'Compact' },
              ],
            },
          ].map((row) => (
            <div
              key={row.name}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
            >
              <div>
                <p className="text-[12px] font-semibold text-chrome-100">{row.label}</p>
                <p className="mt-0.5 text-[10px] text-chrome-500">{row.blurb}</p>
              </div>
              <SegmentedControl
                name={row.name}
                size="sm"
                value={row.value}
                onChange={row.onChange}
                options={row.options}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Save & Database" icon={<Plug className="size-3.5" />}>
        <div className="space-y-3">
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-chrome-100">
                {online ? (
                  <Database className="size-3.5 text-neon-lime" />
                ) : (
                  <HardDrive className="size-3.5 text-neon-amber" />
                )}
                Save location
              </p>
              <Badge tone={online ? 'lime' : 'amber'}>
                {online ? 'MongoDB' : 'Local only'}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-[11px] text-neon-cyan">
              {apiBase ? `${apiBase}/api/save?slot=${SLOT_ID}` : `browser storage · ${SLOT_ID}`}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-chrome-500">
              {apiBase
                ? 'MongoDB is authoritative. Every accepted action writes the whole save — drivers, car, components, budget, transfers and calendar. A localStorage mirror keeps the game playable if the database is unreachable.'
                : 'No save service is configured for this build, so the whole save lives in this browser. Every accepted action is written immediately, but the career will not follow you to another device or survive clearing site data.'}
            </p>
          </div>

          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
            <p className="eyebrow mb-2">Current Save</p>
            <dl className="space-y-1.5">
              {[
                { label: 'Manager', value: save?.managerName ?? '—' },
                { label: 'Season', value: String(state?.season ?? '—') },
                { label: 'Round', value: String(state?.round ?? '—') },
                { label: 'Save version', value: String(state?.version ?? '—') },
                { label: 'Updated', value: state?.updatedAt.slice(0, 19).replace('T', ' ') ?? '—' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] tracking-wider text-chrome-500 uppercase">
                    {row.label}
                  </dt>
                  <dd className="truncate font-mono text-[11px] text-chrome-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <GameButton
            variant="danger"
            className="w-full"
            onClick={() => {
              if (!window.confirm('Delete the save permanently? This cannot be undone.')) return;
              dispatch({ type: 'RESET' });
            }}
          >
            Reset game
          </GameButton>
        </div>
      </Panel>

      <Panel title="About" icon={<Settings className="size-3.5" />} className="xl:col-span-2">
        <p className={cx('text-[11px] leading-relaxed text-chrome-400')}>
          Motorsport Manager SIM — one save, one flow. Every screen in the sidebar reads and writes
          the same career state. Unofficial fan project, unaffiliated with Formula 1 or the FIA;
          the 2026 line-up is used for reference and all ratings are invented.
        </p>
      </Panel>
    </div>
  );
}
