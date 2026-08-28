import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, FlaskConical, Rocket, Wallet, Wrench } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { Panel } from '@/components/ui/Panel';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { carRating, driverRating, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { PARTS } from '@/game/carModel';
import {
  canDevelop,
  developmentCost,
  developmentGain,
  developmentWeeks,
  partLevel,
} from '@/game/partDevelopment';
import { useGame } from '@/state/gameContext';
import type { PartCategory } from '@/game/types';

/**
 * The parts worth starting over a winter: the big, slow programmes that
 * cannot be squeezed in between races. Everything else is on Car Dev.
 */
const WINTER_PARTS: PartCategory[] = [
  'CHASSIS',
  'FLOOR',
  'ICE',
  'MGU_K',
  'SUSPENSION',
  'GEARBOX',
];

/** Phase: PRE_SEASON — R&D and transfers before lights out on round 1. */
export function PreSeasonScreen() {
  const { state, dispatch, playerTeam, playerSquad, roster } = useGame();
  /* Keyed by the driver being swapped out. One shared value meant
   * picking a replacement for the first car put the same name in the
   * second car's selector too. */
  const [transferTarget, setTransferTarget] = useState<Record<string, string>>({});

  if (!state || !playerTeam) return null;

  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const rating = carRating(team.car);
  const otherDrivers = roster.filter((driver) => driver.teamId !== playerTeam.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Header with the prominent Start Season action */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-neon-cyan uppercase">
            Pre-season · {state.season}
          </p>
          <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold text-chrome-100">
            <span
              className="grid size-9 place-items-center rounded-lg font-mono text-[11px] font-black text-carbon-950"
              style={{ background: playerTeam.color }}
            >
              {playerTeam.shortName}
            </span>
            {playerTeam.name}
          </h1>
          <p className="mt-1 text-[12px] text-chrome-500">
            Spend the development budget and settle the driver line-up. Nothing here can be
            changed once the season is under way.
          </p>
        </div>

        <GameButton
          size="lg"
          onClick={() => dispatch({ type: 'START_SEASON' })}
          icon={<Rocket className="size-4" />}
        >
          Start Season
        </GameButton>
      </header>

      {/* Resource strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Budget', value: formatCurrency(team.budget, true), tone: 'text-neon-lime', icon: Wallet },
          { label: 'Car rating', value: String(rating), tone: 'text-neon-cyan', icon: Wrench },
          { label: 'R&D spent', value: formatCurrency(Object.values(state.rndSpent).reduce((a, b) => a + b, 0), true), tone: 'text-neon-violet', icon: FlaskConical },
          { label: 'Rounds', value: String(state.settings.seasonLength), tone: 'text-chrome-100', icon: Rocket },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-lg border border-carbon-600/70 bg-carbon-850/70 px-3 py-2.5"
            >
              <Icon className="size-3.5 text-chrome-500" />
              <p className={cx('mt-1 font-mono text-lg font-bold', stat.tone)}>{stat.value}</p>
              <p className="text-[9px] tracking-widest text-chrome-500 uppercase">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Winter development */}
        <Panel title="Winter Programme" icon={<FlaskConical className="size-3.5" />}>
          <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
            Money no longer buys a statistic. It commissions work on a part, that work takes
            weeks, and the car improves when it lands — so what you start now is what you race
            in the opening rounds. The full programme lives on the Car Dev screen.
          </p>

          <ul className="grid gap-2 sm:grid-cols-2">
            {WINTER_PARTS.map((category) => {
              const definition = PARTS.find((entry) => entry.id === category)!;
              const level = partLevel(team, category);
              const project = team.development.find((entry) => entry.category === category);
              const cost = developmentCost(category, level, 2);
              const gain = developmentGain(state, category, level, 2);
              const weeks = developmentWeeks(category, 2);
              const check = canDevelop(team, category, 2);

              return (
                <li
                  key={category}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-chrome-100">
                        {definition.label}
                      </p>
                      <p className="truncate text-[10px] text-chrome-500">{definition.effect}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[16px] font-bold text-neon-cyan">
                      {level.toFixed(1)}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-carbon-700">
                    <motion.div
                      className="h-full rounded-full"
                      initial={false}
                      animate={{ width: `${level}%` }}
                      transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                      style={{
                        background: 'var(--color-neon-cyan)',
                        boxShadow: '0 0 10px var(--color-neon-cyan)',
                      }}
                    />
                  </div>

                  {project ? (
                    <p className="mt-2.5 font-mono text-[10px] text-neon-amber">
                      In build · +{project.gain.toFixed(1)} in {project.weeksRemaining}w
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={!check.ok}
                      title={check.reason}
                      onClick={() =>
                        dispatch({ type: 'DEVELOP_PART', category, intensity: 2 })
                      }
                      className="mt-2.5 w-full rounded-md border border-carbon-500 bg-carbon-800/70 py-1.5 font-mono text-[10px] font-bold text-chrome-300 transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +{gain.toFixed(1)} · {weeks}w · {formatCurrency(cost, true)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Transfers */}
        <Panel title="Driver Line-up" icon={<ArrowRightLeft className="size-3.5" />}>
          <p className="mb-3 text-[11px] text-chrome-500">
            Swap one of your drivers for anyone on the grid — a straight exchange, the other
            team takes yours in return. To sign somebody without giving anybody up, or to move
            a reserve into the car, use the Driver Market screen.
          </p>

          <div className="grid gap-2.5">
            {playerSquad.map((driver) => (
              <div
                key={driver.id}
                className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <DriverPortrait driver={driver} teamColor={playerTeam.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-chrome-100">
                      {driver.firstName} {driver.lastName}
                    </p>
                    <p className="truncate text-[10px] text-chrome-500">
                      {flagEmoji(driver.countryCode)} #{driver.carNumber} · Age {driver.age} ·{' '}
                      {formatCurrency(driver.contract.salaryPerSeason, true)}/yr
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-2 py-1 font-mono text-[13px] font-bold"
                    style={{
                      background: `${playerTeam.color}22`,
                      color: playerTeam.color,
                    }}
                  >
                    {driverRating(driver)}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select
                    value={transferTarget[driver.id] ?? ''}
                    onChange={(event) =>
                      setTransferTarget((current) => ({
                        ...current,
                        [driver.id]: event.target.value,
                      }))
                    }
                    aria-label={`Replacement for ${driver.lastName}`}
                    className="min-w-0 flex-1 rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 text-[11px] text-chrome-200 focus:border-neon-cyan/50 focus:outline-none"
                  >
                    <option value="">Select a replacement…</option>
                    {otherDrivers.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.firstName} {candidate.lastName} ({driverRating(candidate)}) ·{' '}
                        {gridTeamOf(candidate.teamId).shortName}
                      </option>
                    ))}
                  </select>

                  <GameButton
                    size="sm"
                    variant="secondary"
                    disabled={!transferTarget[driver.id]}
                    onClick={() => {
                      const incoming = transferTarget[driver.id];
                      if (!incoming) return;
                      const ok = dispatch({
                        type: 'SWAP_DRIVER',
                        incomingDriverId: incoming,
                        outgoingDriverId: driver.id,
                      });
                      if (ok) {
                        setTransferTarget((current) => ({ ...current, [driver.id]: '' }));
                      }
                    }}
                    icon={<ArrowRightLeft className="size-3" />}
                  >
                    Swap
                  </GameButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
