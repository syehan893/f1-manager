import { motion } from 'framer-motion';
import { MainMenuScreen } from './MainMenuScreen';
import { SetupCareerScreen } from './SetupCareerScreen';
import { TeamSelectionScreen } from './TeamSelectionScreen';
import { PreSeasonScreen } from './PreSeasonScreen';
import { HubScreen } from './HubScreen';
import { QualifyingScreen } from './QualifyingScreen';
import { RaceScreen } from './RaceScreen';
import { PostRaceScreen } from './PostRaceScreen';
import { SeasonReviewScreen } from './SeasonReviewScreen';
import { StrategyBriefingScreen } from './StrategyBriefingScreen';
import { useGame } from '@/state/gameContext';
import type { GamePhase } from '@/game/types';
import type { ViewId } from '@/types';

function ScreenForPhase({
  phase,
  onNavigate,
}: {
  phase: GamePhase;
  onNavigate?: (view: ViewId) => void;
}) {
  switch (phase) {
    case 'MAIN_MENU':
      return <MainMenuScreen />;
    case 'SETUP_CAREER':
      return <SetupCareerScreen />;
    case 'TEAM_SELECTION':
      return <TeamSelectionScreen />;
    case 'PRE_SEASON':
      return <PreSeasonScreen />;
    case 'HUB':
      return <HubScreen onNavigate={onNavigate} />;
    case 'QUALIFYING':
      return <QualifyingScreen />;
    case 'RACE_STRATEGY':
      return <StrategyBriefingScreen onNavigate={onNavigate} />;
    case 'RACE_COUNTDOWN':
    case 'RACE_SESSION':
      return <RaceScreen onNavigate={onNavigate} />;
    case 'POST_RACE':
      return <PostRaceScreen onNavigate={onNavigate} />;
    case 'SEASON_REVIEW':
      return <SeasonReviewScreen />;
    default:
      return <MainMenuScreen />;
  }
}

/** Renders whichever screen the current phase calls for. */
export function GameShell({ onNavigate }: { onNavigate?: (view: ViewId) => void }) {
  const { phase } = useGame();

  return (
    <motion.div
      // Keyed on phase so each screen animates in, except across the
      // countdown -> session boundary, which must not remount the race.
      key={phase === 'RACE_SESSION' ? 'RACE_COUNTDOWN' : phase}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="min-h-full"
    >
      <ScreenForPhase phase={phase} onNavigate={onNavigate} />
    </motion.div>
  );
}
