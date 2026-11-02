import { expireHolds } from '../services/booking.js';

/** Releases inventory held by abandoned checkouts. Safe to run on every instance. */
export function startHoldSweeper(intervalMs = 60_000) {
  const timer = setInterval(async () => {
    try {
      const n = await expireHolds();
      if (n) console.log(`Released ${n} expired hold(s)`);
    } catch (err) {
      console.error('Hold sweeper failed:', err.message);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
