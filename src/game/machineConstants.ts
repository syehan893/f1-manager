/* =====================================================================
 * Shared numbers that both the state machine and the modules it calls
 * need. They live here rather than in `machine.ts` so importing one does
 * not drag in the whole reducer and create a cycle.
 * ===================================================================== */

/** Cost per R&D point, and the ceiling any single car stat can reach. */
export const RND_COST_PER_POINT = 900_000;
export const RND_STAT_CEILING = 99;
