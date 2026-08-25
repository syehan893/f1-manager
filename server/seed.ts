import 'dotenv/config';
import { collections, connect, disconnect, ensureIndexes } from './db.ts';
import { buildComponents, buildTracks } from '../src/lib/careerGen.ts';
import { GRID_2026_DRIVERS, GRID_2026_TEAMS } from '../src/data/grid2026.ts';

/* Seeds the catalog and one starter career. Safe to re-run: catalog
 * documents are upserted, and the career is only created if missing
 * unless --force is passed. */

const force = process.argv.includes('--force');

const db = await connect();
await ensureIndexes(db);
const { tracks, components } = collections(db);

const trackDocs = buildTracks();
const componentDocs = buildComponents();

await tracks.bulkWrite(
  trackDocs.map((track) => ({
    updateOne: {
      filter: { _id: track.id },
      update: { $set: { _id: track.id, track } },
      upsert: true,
    },
  })),
);

await components.bulkWrite(
  componentDocs.map((component) => ({
    updateOne: {
      filter: { _id: component.id },
      update: { $set: { _id: component.id, component } },
      upsert: true,
    },
  })),
);

if (force) {
  const saves = db.collection('saves');
  const removed = await saves.deleteMany({});
  console.log(`cleared ${removed.deletedCount} save slot(s)`);
}

console.log(
  `seeded ${trackDocs.length} tracks, ${componentDocs.length} components ` +
    `(${componentDocs.reduce((n, c) => n + c.variants.length, 0)} variants), ` +
    `${GRID_2026_TEAMS.length} teams and ${GRID_2026_DRIVERS.length} drivers`,
);

await disconnect();
