import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsUp, Zap } from 'lucide-react';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { driverOf } from '@/data/drivers';
import { useTeamOf } from '@/state/useTeamOf';
import type { TeamResolver } from '@/state/useTeamOf';
import { cx, flagEmoji, formatGap } from '@/lib/format';
import { useRace } from '@/state/raceContext';
import type { CarState, DriverStatus } from '@/types';

const STATUS_STYLE: Record<DriverStatus, { label: string; className: string }> = {
  LAPPING: { label: 'LAPPING', className: 'text-neon-lime' },
  PIT_ENTRY: { label: 'PIT ENTRY', className: 'text-neon-amber' },
  IN_PIT: { label: 'IN BOX', className: 'text-neon-red' },
  PIT_EXIT: { label: 'PIT EXIT', className: 'text-neon-amber' },
  OUT_LAP: { label: 'OUT LAP', className: 'text-neon-blue' },
  RETIRED: { label: 'DNF', className: 'text-chrome-500 line-through' },
};

interface TimingRowProps {
  car: CarState;
  lapsDown: number;
  isOvertaking: boolean;
  isOvertaken: boolean;
  isFocused: boolean;
  onSelect: (driverId: string) => void;
  /** Resolved from the save, so a transferred driver wears the right colours. */
  teamOfDriver: TeamResolver;
}

function TimingRow({
  car,
  lapsDown,
  isOvertaking,
  isOvertaken,
  isFocused,
  onSelect,
  teamOfDriver,
}: TimingRowProps) {
  const driver = driverOf(car.driverId);
  const team = teamOfDriver(car.driverId);
  const status = STATUS_STYLE[car.status];

  return (
    <motion.li
      layout
      layoutId={`timing-${car.driverId}`}
      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.6 }}
      onClick={() => onSelect(car.driverId)}
      className={cx(
        'relative cursor-pointer overflow-hidden border-b border-carbon-700/60 transition-colors',
        isOvertaking
          ? 'bg-neon-red/12'
          : isFocused
            ? 'bg-carbon-700/45'
            : 'hover:bg-carbon-800/70',
      )}
    >
      {/* Team livery stripe */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: team.color }}
      />
      {isOvertaking && (
        <motion.span
          className="absolute inset-0 border border-neon-red/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        />
      )}

      <div className="relative grid grid-cols-[30px_1fr_auto_28px_60px] items-center gap-2 py-2 pr-3 pl-3">
        {/* Position */}
        <span
          className={cx(
            'font-mono text-[13px] font-bold',
            car.position <= 3 ? 'text-neon-amber' : 'text-chrome-300',
          )}
        >
          P{car.position}
        </span>

        {/* Driver */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[13px] leading-none">{flagEmoji(driver.countryCode)}</span>
          <div className="min-w-0">
            <p
              className={cx(
                'truncate font-mono text-[12px] leading-tight font-bold tracking-wide',
                isOvertaking ? 'text-neon-red' : 'text-chrome-100',
              )}
            >
              {driver.code}
            </p>
            <p
              className="truncate text-[9px] leading-tight tracking-wider uppercase"
              style={{ color: team.isUserTeam ? team.color : 'var(--color-chrome-500)' }}
            >
              {team.isUserTeam ? 'User Team' : team.shortName}
            </p>
          </div>
          {car.attacking && car.status === 'LAPPING' && (
            <Zap className="size-3 shrink-0 text-neon-amber" />
          )}
        </div>

        {/* Gap */}
        <span
          className={cx(
            'font-mono text-[12px] tabular-nums',
            car.position === 1 ? 'text-chrome-500' : 'text-chrome-300',
          )}
        >
          {lapsDown >= 1 ? `+${lapsDown}L` : formatGap(car.gapToLeaderMs, car.position === 1)}
        </span>

        {/* Tyre */}
        <TyreBadge
          compound={car.tyre.compound}
          wearPct={car.tyre.wearPct}
          ageLaps={car.tyre.ageLaps}
          size="sm"
        />

        {/* Status */}
        <span
          className={cx(
            'text-right font-mono text-[10px] font-bold tracking-wider',
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>

      {/* Overtake banner */}
      <AnimatePresence>
        {isOvertaking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="relative overflow-hidden bg-neon-red/20"
          >
            <p className="flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.16em] text-neon-red">
              <ChevronsUp className="size-3" />
              OVERTAKE COMMENCED
            </p>
          </motion.div>
        )}
        {isOvertaken && !isOvertaking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="relative overflow-hidden bg-carbon-700/60"
          >
            <p className="px-3 py-1 font-mono text-[10px] font-bold tracking-[0.16em] text-chrome-400">
              POSITION LOST
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function LiveTimingPanel({ limit }: { limit?: number }) {
  const { snapshot, activeOvertakes, focusedDriverId, setFocusedDriverId } = useRace();
  const teamOfDriver = useTeamOf();

  const overtakingIds = new Set(activeOvertakes.map((event) => event.overtakerId));
  const overtakenIds = new Set(activeOvertakes.map((event) => event.overtakenId));
  const leaderDistance = snapshot.cars[0]?.raceDistance ?? 0;
  const cars = limit ? snapshot.cars.slice(0, limit) : snapshot.cars;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-[30px_1fr_auto_28px_60px] items-center gap-2 border-b border-carbon-600/60 bg-carbon-900/60 py-2 pr-3 pl-3">
        {['P', 'Driver', 'Gap', 'Tyre', 'Status'].map((label, index) => (
          <span
            key={label}
            className={cx(
              'text-[9px] font-bold tracking-[0.16em] text-chrome-500 uppercase',
              index === 4 && 'text-right',
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {cars.map((car) => (
          <TimingRow
            key={car.driverId}
            car={car}
            lapsDown={Math.floor(leaderDistance - car.raceDistance)}
            isOvertaking={overtakingIds.has(car.driverId)}
            isOvertaken={overtakenIds.has(car.driverId)}
            isFocused={car.driverId === focusedDriverId}
            onSelect={setFocusedDriverId}
            teamOfDriver={teamOfDriver}
          />
        ))}
      </ul>
    </div>
  );
}
