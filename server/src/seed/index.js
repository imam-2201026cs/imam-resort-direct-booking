import mongoose from 'mongoose';
import { env, isProd } from '../config/env.js';
import { resetAll, seedCore } from './core.js';
import { seedBookings, seedEnquiries, counts } from './demo.js';

if (isProd && process.env.ALLOW_SEED !== 'true') {
  console.error('Refusing to seed with NODE_ENV=production. Set ALLOW_SEED=true if you really mean it.');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
await resetAll();
const { users, roomTypes } = await seedCore();
console.log(`Seeded ${users.length} users and ${roomTypes.length} room types with rates and inventory.`);
await seedBookings();
await seedEnquiries();
console.log('Demo data:', await counts());
await mongoose.disconnect();
