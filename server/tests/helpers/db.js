import mongoose from 'mongoose';
import { resetAll, seedCore } from '../../src/seed/core.js';

/** DB-backed tests need a replica set (transactions). Set MONGODB_URI_TEST to run them. */
export const TEST_URI = process.env.MONGODB_URI_TEST;
export const hasDb = Boolean(TEST_URI);

export async function setupDb(opts = { horizon: 60 }) {
  await mongoose.connect(TEST_URI);
  await resetAll();
  return seedCore(opts);
}
export const teardownDb = () => mongoose.disconnect();
