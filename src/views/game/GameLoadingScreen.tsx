import { motion } from 'framer-motion';
import { Database } from 'lucide-react';

/** Shown while the save is being read from MongoDB or the local mirror. */
export function GameLoadingScreen() {
  return (
    <div className="grid min-h-[420px] place-items-center">
      <div className="text-center">
        <motion.span
          className="mx-auto grid size-12 place-items-center rounded-xl border border-neon-cyan/30 bg-neon-cyan/8 text-neon-cyan"
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Database className="size-5" />
        </motion.span>
        <p className="mt-3 text-[12px] font-semibold text-chrome-200">Loading save</p>
        <p className="mt-1 font-mono text-[10px] text-chrome-500">
          Reading team, drivers, components and calendar…
        </p>
      </div>
    </div>
  );
}
