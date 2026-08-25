import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cx } from '@/lib/format';
import { useGame } from '@/state/gameContext';

const TONE = {
  error: {
    box: 'border-neon-red/45 bg-[rgba(30,6,10,0.94)]',
    icon: <CircleAlert className="mt-0.5 size-4 shrink-0 text-neon-red" />,
  },
  success: {
    box: 'border-neon-lime/45 bg-[rgba(6,22,12,0.94)]',
    icon: <CircleCheck className="mt-0.5 size-4 shrink-0 text-neon-lime" />,
  },
  info: {
    box: 'border-neon-cyan/40 bg-[rgba(4,20,22,0.94)]',
    icon: <Info className="mt-0.5 size-4 shrink-0 text-neon-cyan" />,
  },
} as const;

/** Surfaces refused transitions and machine feedback. */
export function GameNotice() {
  const { notice, dismissNotice } = useGame();

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            role="status"
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 backdrop-blur-md',
              TONE[notice.kind].box,
            )}
          >
            {TONE[notice.kind].icon}
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-chrome-200">
              {notice.text}
            </p>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Dismiss notification"
              className="shrink-0 text-chrome-500 transition-colors hover:text-chrome-100"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
