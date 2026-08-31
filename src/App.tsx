import { Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { GameNotice } from '@/components/game/GameNotice';
import { GameProvider } from '@/state/GameProvider';
import { CareerRaceProvider } from '@/state/CareerRaceProvider';
import { useGame } from '@/state/gameContext';
import { TeamView } from '@/views/TeamView';
import { DriversView } from '@/views/DriversView';
import { CarDevView } from '@/views/CarDevView';
import { RaceStrategyView } from '@/views/RaceStrategyView';
import { PitwallView } from '@/views/PitwallView';
import { SponsorsView } from '@/views/SponsorsView';
import { StaffView } from '@/views/StaffView';
import { HistoryView } from '@/views/HistoryView';
import { SettingsView } from '@/views/SettingsView';
import { ProfileView } from '@/views/ProfileView';
import { GameShell } from '@/views/game/GameShell';
import { GameLoadingScreen } from '@/views/game/GameLoadingScreen';
import { isFullscreenPhase, isRacePhase } from '@/game/phases';
import type { ViewId } from '@/types';

/* The management screens are a self-contained area, so they are code-split
 * out of the race-weekend bundle and fetched on first navigation. */
const SeasonConfigView = lazy(() =>
  import('@/views/career/SeasonConfigView').then((m) => ({ default: m.SeasonConfigView })),
);
const DriverMarketView = lazy(() =>
  import('@/views/career/DriverMarketView').then((m) => ({ default: m.DriverMarketView })),
);
const YouthAcademyView = lazy(() =>
  import('@/views/career/YouthAcademyView').then((m) => ({ default: m.YouthAcademyView })),
);
const RndCenterView = lazy(() =>
  import('@/views/career/RndCenterView').then((m) => ({ default: m.RndCenterView })),
);
const SeasonCalendarView = lazy(() =>
  import('@/views/career/SeasonCalendarView').then((m) => ({ default: m.SeasonCalendarView })),
);
const MailView = lazy(() =>
  import('@/views/career/MailView').then((m) => ({ default: m.MailView })),
);
const SocialView = lazy(() =>
  import('@/views/career/SocialView').then((m) => ({ default: m.SocialView })),
);

/** Management screens need both the chunk and a loaded save. */
function Managed({ children }: { children: React.ReactNode }) {
  const { state } = useGame();
  if (!state) return <GameLoadingScreen />;
  return <Suspense fallback={<GameLoadingScreen />}>{children}</Suspense>;
}

function ViewRouter({
  view,
  onNavigate,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  switch (view) {
    case 'game-season':
      return <GameShell onNavigate={onNavigate} />;

    case 'team':
      return <TeamView onNavigate={onNavigate} />;
    case 'drivers':
      return <DriversView />;
    case 'car-dev':
      return <CarDevView />;
    case 'race-strategy':
      return <RaceStrategyView />;
    case 'sponsors':
      return <SponsorsView />;
    case 'staff':
      return <StaffView />;
    case 'history':
      return (
        <Managed>
          <HistoryView />
        </Managed>
      );
    case 'pitwall':
      return <PitwallView onNavigate={onNavigate} />;

    case 'career-season':
      return (
        <Managed>
          <SeasonConfigView />
        </Managed>
      );
    case 'career-market':
      return (
        <Managed>
          <DriverMarketView />
        </Managed>
      );
    case 'career-youth':
      return (
        <Managed>
          <YouthAcademyView />
        </Managed>
      );
    case 'career-rnd':
      return (
        <Managed>
          <RndCenterView />
        </Managed>
      );
    case 'career-calendar':
      return (
        <Managed>
          <SeasonCalendarView onNavigate={onNavigate} />
        </Managed>
      );
    case 'career-mail':
      return (
        <Managed>
          <MailView />
        </Managed>
      );
    case 'career-social':
      return (
        <Managed>
          <SocialView />
        </Managed>
      );

    case 'settings':
      return <SettingsView />;
    case 'profile':
      return <ProfileView onNavigate={onNavigate} />;
    default:
      return <GameShell onNavigate={onNavigate} />;
  }
}

function AppInner() {
  const { phase, booting } = useGame();
  const [view, setView] = useState<ViewId>('game-season');
  const [lastPhase, setLastPhase] = useState(phase);

  /* A phase change is the game demanding attention, and it decides where
   * the player is put. Race day goes to the pit wall, which is where the
   * race is actually run; the strategy gate goes to the strategy room,
   * because that is where the outstanding decision lives. */
  if (phase !== lastPhase) {
    setLastPhase(phase);
    setView(
      isRacePhase(phase)
        ? 'pitwall'
        : phase === 'RACE_STRATEGY'
          ? 'race-strategy'
          : 'game-season',
    );
  }

  if (booting) {
    return (
      <div className="grid h-full w-full place-items-center bg-carbon-950">
        <GameLoadingScreen />
      </div>
    );
  }

  /* Only the pre-career screens take over the display; once a career
   * exists the player stays in the shell so the sidebar is always there. */
  if (isFullscreenPhase(phase)) {
    return (
      <div className="h-full min-h-0 w-full overflow-y-auto bg-carbon-950">
        <GameShell />
        <GameNotice />
      </div>
    );
  }

  return (
    <CareerRaceProvider>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-carbon-950">
        <Sidebar active={view} onNavigate={setView} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar active={view} onNavigate={setView} />

          <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {/* Keyed on the view so each screen animates in on mount. No exit
                animation: navigation in a dashboard should feel instant. */}
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <ViewRouter view={view} onNavigate={setView} />
            </motion.div>
          </main>
        </div>

        <GameNotice />
      </div>
    </CareerRaceProvider>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
