import { motion } from 'framer-motion';
import { ArrowLeft, Check, TrendingUp, Users } from 'lucide-react';
import { GameButton } from '@/components/game/GameButton';
import { Badge } from '@/components/ui/Badge';
import { GRID_2026_TEAMS, carRating, driverRating } from '@/data/grid2026';
import type { CarStats, GridTeam } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { Driver } from '@/types';

const CAR_ROWS: Array<{ key: keyof CarStats; label: string }> = [
  { key: 'pace', label: 'Pace' },
  { key: 'aero', label: 'Aero' },
  { key: 'powerUnit', label: 'Power unit' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'pitCrew', label: 'Pit crew' },
];

function TeamCard({
  team,
  drivers,
  selected,
  onSelect,
}: {
  team: GridTeam;
  drivers: Driver[];
  selected: boolean;
  onSelect: () => void;
}) {
  const rating = carRating(team.car);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layout
      whileHover={{ y: -2 }}
      className={cx(
        'relative overflow-hidden rounded-panel border p-4 text-left transition-colors',
        selected
          ? 'border-neon-cyan bg-neon-cyan/8'
          : 'border-carbon-600/70 bg-carbon-850/70 hover:border-carbon-500',
      )}
      style={selected ? { boxShadow: `0 0 30px -10px ${team.color}` } : undefined}
    >
      {/* Livery stripe */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: team.color }}
      />
      {selected && (
        <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-neon-cyan text-carbon-950">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}

      <div className="pl-2">
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-black text-carbon-950"
            style={{ background: team.color }}
          >
            {team.shortName}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-chrome-100">{team.name}</p>
            <p className="truncate text-[10px] text-chrome-500">
              {flagEmoji(team.countryCode)} {team.base} · {team.principal}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl leading-none font-bold" style={{ color: team.color }}>
              {rating}
            </p>
            <p className="mt-0.5 text-[8.5px] tracking-widest text-chrome-500 uppercase">Car</p>
          </div>
        </div>

        {/* Car stats */}
        <div className="mt-3 space-y-1.5">
          {CAR_ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[9px] tracking-wider text-chrome-500 uppercase">
                {row.label}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-carbon-700">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${team.car[row.key]}%`, background: team.color }}
                />
              </div>
              <span className="w-7 shrink-0 text-right font-mono text-[10px] font-bold text-chrome-300">
                {team.car[row.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Drivers */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-carbon-600/60 pt-2.5">
          {drivers.map((driver) => (
            <div key={driver.id} className="min-w-0">
              <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-chrome-200">
                <span className="text-[10px]">{flagEmoji(driver.countryCode)}</span>
                <span className="truncate">
                  {driver.firstName.charAt(0)}. {driver.lastName}
                </span>
              </p>
              <p className="font-mono text-[9px] text-chrome-500">
                #{driver.carNumber} · OVR {driverRating(driver)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-carbon-600/60 pt-2.5">
          <span className="font-mono text-[10px] text-chrome-500">
            Budget {formatCurrency(team.budget, true)}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-neon-amber">
            <TrendingUp className="size-3" />
            Prestige {team.prestige}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/** Phase: TEAM_SELECTION — pick the team to manage from the 2024 grid. */
export function TeamSelectionScreen() {
  const { state, dispatch, roster } = useGame();
  if (!state) return null;

  const selectedId = state.pendingTeamId;
  const selectedTeam = GRID_2026_TEAMS.find((team) => team.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-neon-cyan uppercase">
            Step 2 of 2
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-chrome-100">
            <Users className="size-5 text-neon-cyan" />
            Choose your team
          </h1>
          <p className="mt-1 text-[12px] text-chrome-500">
            A stronger car wins races now; a weaker one earns you a bigger reputation for
            over-delivering. That reputation is what the job market judges.
          </p>
        </div>

        {selectedTeam && (
          <Badge tone="cyan" className="!px-3 !py-1.5">
            Selected: {selectedTeam.name}
          </Badge>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GRID_2026_TEAMS.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            drivers={roster.filter((driver) => driver.teamId === team.id)}
            selected={team.id === selectedId}
            onSelect={() => dispatch({ type: 'PREVIEW_TEAM', teamId: team.id })}
          />
        ))}
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
          onClick={() => dispatch({ type: 'CONFIRM_TEAM' })}
          disabled={!selectedId}
          title={selectedId ? undefined : 'Select a team first.'}
          icon={<Check className="size-4" />}
        >
          {selectedTeam ? `Sign with ${selectedTeam.name}` : 'Select a team'}
        </GameButton>
      </div>
    </div>
  );
}
