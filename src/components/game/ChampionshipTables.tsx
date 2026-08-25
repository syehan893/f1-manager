import { motion } from 'framer-motion';
import { Panel } from '@/components/ui/Panel';
import { gridTeamOf } from '@/data/grid2026';
import { GRID_2026_DRIVERS } from '@/data/grid2026';
import { cx, flagEmoji } from '@/lib/format';
import type { Standings } from '@/game/types';

const DRIVER_BY_ID = new Map(GRID_2026_DRIVERS.map((driver) => [driver.id, driver]));

interface ChampionshipTablesProps {
  standings: Standings;
  playerTeamId: string | null;
  /** Cap the driver table; the constructor table always shows all ten. */
  driverLimit?: number;
  icon?: React.ReactNode;
}

export function ChampionshipTables({
  standings,
  playerTeamId,
  driverLimit = 10,
  icon,
}: ChampionshipTablesProps) {
  const topDriverPoints = standings.drivers[0]?.points || 1;
  const topTeamPoints = standings.constructors[0]?.points || 1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Drivers' Championship" icon={icon}>
        <ul className="space-y-1">
          {standings.drivers.slice(0, driverLimit).map((row) => {
            const driver = DRIVER_BY_ID.get(row.driverId);
            const team = gridTeamOf(row.teamId);
            const isPlayer = row.teamId === playerTeamId;

            return (
              <motion.li
                key={row.driverId}
                layout
                transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                className={cx(
                  'grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5',
                  isPlayer ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/60',
                )}
              >
                <span
                  className={cx(
                    'font-mono text-[11px] font-bold',
                    row.position <= 3 ? 'text-neon-amber' : 'text-chrome-400',
                  )}
                >
                  {row.position}
                </span>

                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-4 w-1 shrink-0 rounded-full"
                    style={{ background: team.color }}
                  />
                  <span className="text-[10px] leading-none">
                    {driver ? flagEmoji(driver.countryCode) : '🏁'}
                  </span>
                  <span className="truncate text-[12px] font-semibold text-chrome-200">
                    {driver ? `${driver.firstName.charAt(0)}. ${driver.lastName}` : row.driverId}
                  </span>
                  <span
                    className="ml-auto shrink-0 font-mono text-[9px] tracking-wider"
                    style={{ color: team.color }}
                  >
                    {team.shortName}
                  </span>
                </div>

                <div className="w-12 text-right">
                  <span className="font-mono text-[12px] font-bold text-chrome-100">
                    {row.points}
                  </span>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-carbon-700">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: team.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.points / topDriverPoints) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Constructors' Championship" icon={icon}>
        <ul className="space-y-1">
          {standings.constructors.map((row) => {
            const team = gridTeamOf(row.teamId);
            const isPlayer = row.teamId === playerTeamId;

            return (
              <motion.li
                key={row.teamId}
                layout
                transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                className={cx(
                  'grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5',
                  isPlayer ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/60',
                )}
              >
                <span
                  className={cx(
                    'font-mono text-[11px] font-bold',
                    row.position <= 3 ? 'text-neon-amber' : 'text-chrome-400',
                  )}
                >
                  {row.position}
                </span>

                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-4 w-1 shrink-0 rounded-full"
                    style={{ background: team.color }}
                  />
                  <span
                    className={cx(
                      'truncate text-[12px] font-semibold',
                      isPlayer ? 'text-neon-cyan' : 'text-chrome-200',
                    )}
                  >
                    {team.name}
                  </span>
                  {row.wins > 0 && (
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-neon-amber">
                      {row.wins}W
                    </span>
                  )}
                </div>

                <div className="w-12 text-right">
                  <span className="font-mono text-[12px] font-bold text-chrome-100">
                    {row.points}
                  </span>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-carbon-700">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: team.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.points / topTeamPoints) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
