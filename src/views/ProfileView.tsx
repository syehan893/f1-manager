import { Award, Briefcase, CalendarDays, CircleUser, Star, Target, Trophy } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { GameButton } from '@/components/game/GameButton';
import { ROLE_LABEL } from '@/game/jobMarket';
import { gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { ViewId } from '@/types';

/** Profile — the manager's record, read from the save. */
export function ProfileView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, playerTeam, calendar } = useGame();

  if (!state || !playerTeam) return null;

  const wcc = state.standings.constructors.find((row) => row.teamId === playerTeam.id);
  const budget = state.teams.find((team) => team.teamId === playerTeam.id)?.budget ?? 0;

  const seasonHistory = state.history.filter((entry) => entry.season === state.season);
  const podiums = state.history.filter(
    (entry) => entry.bestFinish != null && entry.bestFinish <= 3,
  ).length;
  const wins = state.history.filter((entry) => entry.bestFinish === 1).length;
  const bestFinish = state.history.reduce<number | null>(
    (best, entry) =>
      entry.bestFinish == null ? best : best == null ? entry.bestFinish : Math.min(best, entry.bestFinish),
    null,
  );

  const objectives = [
    {
      label: `Finish top ${Math.ceil(state.teams.length / 2)} in the constructors`,
      progress: wcc
        ? Math.max(0, Math.min(100, ((state.teams.length - wcc.position + 1) / state.teams.length) * 100))
        : 0,
      target: `P${wcc?.position ?? '—'}`,
      tone: 'cyan' as const,
    },
    {
      label: 'Score points in every round',
      progress:
        seasonHistory.length === 0
          ? 0
          : (seasonHistory.filter((entry) => entry.pointsScored > 0).length / seasonHistory.length) * 100,
      target: `${seasonHistory.filter((entry) => entry.pointsScored > 0).length} / ${seasonHistory.length}`,
      tone: 'lime' as const,
    },
    {
      label: 'Build a reputation worth hiring',
      progress: state.managerPerformanceScore,
      target: `${Math.round(state.managerPerformanceScore)} / 100`,
      tone: 'violet' as const,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {/* Identity */}
      <Panel title="Manager Profile" icon={<CircleUser className="size-3.5" />} className="xl:col-span-2">
        <div className="flex flex-wrap items-start gap-5">
          <div
            className="grid size-20 shrink-0 place-items-center rounded-2xl font-mono text-2xl font-black text-carbon-950"
            style={{ background: playerTeam.color }}
          >
            {playerTeam.shortName}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-chrome-100">{state.managerName}</h3>
            <p className="text-[12px] text-chrome-500">
              Team Principal · {playerTeam.fullName} · Season {state.season}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="cyan">P{wcc?.position ?? '—'} Constructors</Badge>
              <Badge tone="lime">{wcc?.points ?? 0} pts</Badge>
              <Badge tone="neutral">{formatCurrency(budget, true)} budget</Badge>
              <Badge tone="violet">{flagEmoji(playerTeam.countryCode)} {playerTeam.base}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Races', value: state.history.length, icon: Briefcase },
            { label: 'Wins', value: wins, icon: Award },
            { label: 'Podiums', value: podiums, icon: Star },
            { label: 'Best finish', value: bestFinish ? `P${bestFinish}` : '—', icon: Target },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2.5"
              >
                <Icon className="size-4 text-neon-cyan" />
                <p className="mt-1.5 font-mono text-xl font-bold text-chrome-100">{stat.value}</p>
                <p className="text-[9px] tracking-widest text-chrome-500 uppercase">
                  {stat.label}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Reputation */}
      <Panel title="Reputation" icon={<Star className="size-3.5" />}>
        <StatBar
          label="Manager performance score"
          value={state.managerPerformanceScore}
          color="var(--color-neon-violet)"
          segmented
        />
        <p className="mt-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5 text-[11px] leading-relaxed text-chrome-400">
          The score moves with how far you beat — or fall short of — the position your car should
          deliver. Rival teams judge job applications against it.
        </p>

        <div className="mt-3">
          <p className="eyebrow mb-2">Recent Applications</p>
          {state.jobApplications.length === 0 ? (
            <p className="text-[11px] text-chrome-500">
              No applications sent. The job market is on the Manager Hub.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {state.jobApplications.slice(0, 4).map((application) => (
                <li
                  key={application.id}
                  className={cx(
                    'rounded-lg border px-2.5 py-2',
                    application.accepted
                      ? 'border-neon-lime/35 bg-neon-lime/8'
                      : 'border-carbon-600/70 bg-carbon-900/40',
                  )}
                >
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-chrome-200">
                      {gridTeamOf(application.teamId).name}
                    </span>
                    <Badge tone={application.accepted ? 'lime' : 'red'} className="shrink-0">
                      {application.accepted ? 'Accepted' : 'Rejected'}
                    </Badge>
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-chrome-500">
                    {ROLE_LABEL[application.role]} · rating {application.scoreAtApplication} vs{' '}
                    {application.requiredScore} required
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* Objectives */}
      <Panel title="Season Objectives" icon={<Target className="size-3.5" />}>
        <ul className="space-y-3">
          {objectives.map((objective) => (
            <li key={objective.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-medium text-chrome-200">
                  {objective.label}
                </span>
                <Badge tone={objective.tone} className="shrink-0">
                  {objective.target}
                </Badge>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${objective.progress}%`,
                    background: `var(--color-neon-${objective.tone})`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Season record */}
      <Panel
        title="Season Record"
        icon={<CalendarDays className="size-3.5" />}
        className="xl:col-span-2"
        actions={
          <GameButton size="sm" variant="secondary" onClick={() => onNavigate('game-season')}>
            Back to season
          </GameButton>
        }
      >
        {seasonHistory.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-chrome-500">
            No rounds completed yet this season.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {seasonHistory.map((entry) => {
              const track = calendar[entry.round - 1];
              return (
                <div
                  key={`${entry.season}-${entry.round}`}
                  className="flex items-center gap-3 rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2"
                >
                  <span className="font-mono text-[11px] font-bold text-chrome-500">
                    R{String(entry.round).padStart(2, '0')}
                  </span>
                  {track && (
                    <span className="text-base leading-none">{flagEmoji(track.countryCode)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-chrome-100">
                      {track?.name ?? entry.trackId}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="font-mono text-[12px] font-bold text-chrome-200">
                      {entry.bestFinish ? `P${entry.bestFinish}` : 'DNF'}
                    </span>
                    <span className="block font-mono text-[9px] text-neon-lime">
                      +{entry.pointsScored} pts
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-chrome-500">
          <Trophy className="size-3 text-neon-amber" />
          {state.history.reduce((sum, entry) => sum + entry.pointsScored, 0)} points banked across
          the career.
        </p>
      </Panel>
    </div>
  );
}
