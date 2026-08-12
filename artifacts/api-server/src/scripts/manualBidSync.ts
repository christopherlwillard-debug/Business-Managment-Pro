/**
 * One-time manual sync script — runs the bid sync directly without HTTP auth.
 * Usage: pnpm --filter @workspace/api-server exec tsx src/scripts/manualBidSync.ts
 */
import { runBidSync } from "../jobs/bidSync.js";

async function main() {
  const ids = [1, 2]; // General Contracting, Asphalt Sealing
  for (const id of ids) {
    console.log(`\n[manual-sync] ── Starting sync for business ${id} ──`);
    try {
      const result = await runBidSync(id);
      console.log(`[manual-sync] ✓ business ${id} done:`, result);
    } catch (err) {
      console.error(`[manual-sync] ✗ business ${id} error:`, err);
    }
  }
  console.log("\n[manual-sync] All done.");
  process.exit(0);
}

main();
