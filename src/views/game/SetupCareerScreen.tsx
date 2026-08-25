import { ArrowLeft, ArrowRight, SlidersHorizontal, UserCog } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { cx } from '@/lib/format';
import { DIFFICULTY_ORDER, profileFor } from '@/game/difficulty';
import { useGame } from '@/state/gameContext';
import type { RaceLengthPct } from '@/game/types';

const RACE_LENGTHS: RaceLengthPct[] = [25, 50, 75, 100];

/** Phase: SETUP_CAREER — season rules before a team is chosen. */
export function SetupCareerScreen() {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const { settings, managerName } = state;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <p className="font-mono text-[10px] tracking-[0.22em] text-neon-cyan uppercase">
          Step 1 of 2
        </p>
        <h1 className="mt-1 text-2xl font-bold text-chrome-100">Career Setup</h1>
        <p className="mt-1 text-[12px] text-chrome-500">
          These rules apply for the whole championship. You can change difficulty later; race
          length is fixed once the season starts.
        </p>
      </header>

      <div className="grid gap-4">
        <Panel title="Manager" icon={<UserCog className="size-3.5" />}>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Your name</span>
            <input
              value={managerName}
              onChange={(event) =>
                dispatch({ type: 'SET_MANAGER_NAME', name: event.target.value })
              }
              maxLength={32}
              placeholder="e.g. K. Morrow"
              className="w-full rounded-lg border border-carbon-600 bg-carbon-900/70 px-3 py-2.5 text-[14px] text-chrome-100 placeholder:text-chrome-500 focus:border-neon-cyan/50 focus:outline-none"
            />
          </label>
          <p className="mt-2 text-[10px] text-chrome-500">
            Used across the paddock and on job applications.
          </p>
        </Panel>

        <Panel title="Season Rules" icon={<SlidersHorizontal className="size-3.5" />}>
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

            <p className="mt-3 text-[11px] text-chrome-500">
              Shorter races finish faster in real time. A 25% race is roughly 12-18 laps.
            </p>
          </div>

          {/* Difficulty */}
          <div className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow">Difficulty</span>
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
            <p className="text-[11px] leading-relaxed text-chrome-400">
              {profileFor(settings.difficulty).blurb}
            </p>
          </div>

          {/* Season length */}
          <div className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-4">
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
              onChange={(event) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  settings: { seasonLength: Number(event.target.value) },
                })
              }
              className="w-full"
              aria-label="Championship rounds"
            />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-chrome-500">
              <span>4</span>
              <span>12</span>
            </div>
          </div>

          <Toggle
            className="mt-3"
            label="Fastest lap point"
            description="Award one bonus point for the fastest lap, when finishing in the top ten."
            enabled={settings.fastestLapPoint}
            onChange={(next) =>
              dispatch({ type: 'SET_SETTINGS', settings: { fastestLapPoint: next } })
            }
          />
        </Panel>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <GameButton
          variant="ghost"
          onClick={() => dispatch({ type: 'RETURN_TO_MENU' })}
          icon={<ArrowLeft className="size-3.5" />}
        >
          Back to menu
        </GameButton>

        <GameButton
          size="lg"
          onClick={() => dispatch({ type: 'CONFIRM_SETUP' })}
          disabled={managerName.trim().length === 0}
          icon={<ArrowRight className="size-4" />}
        >
          Choose your team
        </GameButton>
      </div>
    </div>
  );
}
