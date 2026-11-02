import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { startHoldSweeper } from './jobs/holdSweeper.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const app = createApp();
  startHoldSweeper();
  app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
