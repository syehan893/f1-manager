import { motion } from 'framer-motion';
import { MessageSquare, Radio, User, Wrench } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { GameButton } from '@/components/game/GameButton';
import { cx } from '@/lib/format';
import type { BriefingLine, BriefingTone } from '@/game/briefing';
import type { ViewId } from '@/types';

/* =====================================================================
 * The room talking.
 *
 * Drivers and staff read differently on purpose: a driver is a person
 * with an opinion, a staff member is a department with a recommendation.
 * The accent colour carries the tone so the player can scan a briefing
 * without reading every word, and anything actionable carries the button
 * that takes them straight to the screen where they can act on it.
 * ===================================================================== */

const TONE_ACCENT: Record<BriefingTone, string> = {
  GOOD: 'border-neon-lime/35 bg-neon-lime/[0.04]',
  NEUTRAL: 'border-carbon-600 bg-carbon-900/40',
  WARN: 'border-neon-amber/40 bg-neon-amber/[0.04]',
  BAD: 'border-neon-red/40 bg-neon-red/[0.05]',
};

const TONE_TEXT: Record<BriefingTone, string> = {
  GOOD: 'text-neon-lime',
  NEUTRAL: 'text-chrome-400',
  WARN: 'text-neon-amber',
  BAD: 'text-neon-red',
};

export function BriefingRoom({
  title,
  lines,
  onNavigate,
  emptyText = 'Nobody has anything to add.',
}: {
  title: string;
  lines: BriefingLine[];
  onNavigate?: (view: ViewId) => void;
  emptyText?: string;
}) {
  return (
    <Panel title={title} icon={<MessageSquare className="size-3.5" />}>
      {lines.length === 0 ? (
        <p className="text-[11px] text-chrome-500">{emptyText}</p>
      ) : (
        <div className="grid gap-2">
          {lines.map((line, index) => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              /* Staggered so the room reads as a conversation rather than
               * a block of text appearing at once. */
              transition={{ delay: Math.min(index * 0.045, 0.5) }}
              className={cx('rounded-lg border p-2.5', TONE_ACCENT[line.tone])}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cx(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-md',
                    line.kind === 'DRIVER'
                      ? 'bg-neon-cyan/12 text-neon-cyan'
                      : 'bg-chrome-500/12 text-chrome-400',
                  )}
                >
                  {line.kind === 'DRIVER' ? (
                    <User className="size-3.5" />
                  ) : (
                    <Wrench className="size-3.5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] font-bold text-chrome-100">{line.name}</span>
                    <span className="font-mono text-[10px] tracking-wider text-chrome-500 uppercase">
                      {line.subtitle}
                    </span>
                    <span
                      className={cx(
                        'ml-auto font-mono text-[9px] tracking-wider uppercase',
                        TONE_TEXT[line.tone],
                      )}
                    >
                      {line.topic.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="mt-1 text-[12px] leading-relaxed text-chrome-300">
                    {line.kind === 'DRIVER' ? `“${line.text}”` : line.text}
                  </p>

                  {line.action && onNavigate && (
                    <GameButton
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => onNavigate(line.action!.view)}
                      icon={<Radio className="size-3" />}
                    >
                      {line.action.label}
                    </GameButton>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}
