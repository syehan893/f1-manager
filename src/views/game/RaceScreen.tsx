import { motion } from 'framer-motion';
import { Flag, Radio } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { GameButton } from '@/components/game/GameButton';
import { TrackThumbnail } from '@/components/career/TrackThumbnail';
import { scaledLaps } from '@/game/trackAdapter';
import { flagEmoji } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';

/**
 * Phases RACE_COUNTDOWN and RACE_SESSION on the season screen.
 *
 * The race itself is run from Pitwall Live, so this is a signpost rather
 * than a second cockpit. The player is normally sent straight to Pitwall
 * when the lights go out; this covers the case where they navigate back.
 */
export function RaceScreen({ onNavigate }: { onNavigate?: (view: ViewId) => void }) {
  const { state, currentTrack, playerTeam } = useGame();
  if (!state || !currentTrack) return null;

  const laps = scaledLaps(currentTrack, state.settings.raceLengthPct);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Panel
        title="Race in Progress"
        icon={<Flag className="size-3.5" />}
        actions={
          <span className="flex items-center gap-2">
            <StatusDot tone="red" />
            <Badge tone="red">Round {state.round}</Badge>
          </span>
        }
      >
        <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/50 p-2">
            <div className="aspect-[4/3]">
              <TrackThumbnail track={currentTrack} strokeWidth={26} showStartLine />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-chrome-100">
              <span className="text-xl leading-none">{flagEmoji(currentTrack.countryCode)}</span>
              <span className="truncate">{currentTrack.name}</span>
            </h2>
            <p className="mt-1 text-[12px] text-chrome-500">
              {laps} laps · {playerTeam?.name} · the grid is set from qualifying.
            </p>

            <p className="mt-4 flex items-start gap-2 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3 text-[11px] leading-relaxed text-chrome-400">
              <Radio className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
              <span>
                The race is run from <strong className="text-chrome-200">Pitwall Live</strong> —
                tyre calls, push mode, the override and pit stops all live there, along with the
                playback speed controls.
              </span>
            </p>

            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <GameButton
                size="lg"
                className="mt-4"
                onClick={() => onNavigate?.('pitwall')}
                icon={<Radio className="size-4" />}
              >
                Open Pitwall Live
              </GameButton>
            </motion.div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
