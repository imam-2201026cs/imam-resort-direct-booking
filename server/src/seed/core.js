import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { RoomType, RatePlan, DailyRate, Inventory, Booking, Enquiry, Config } from '../models/index.js';
import { DEFAULTS } from '../services/config.js';
import { addDays, todayIST, weekday } from '../lib/dates.js';
import { ROOM_TYPES, RATE_PLANS, USERS, DEMO_PASSWORD, nightlyPaise } from './data.js';

export const HORIZON_DAYS = 300; // covers Feb 2027 enquiries and beyond

export async function resetAll() {
  await Promise.all([User, RoomType, RatePlan, DailyRate, Inventory, Booking, Enquiry, Config].map((m) => m.deleteMany({})));
}

export async function seedCore({ today = todayIST(), horizon = HORIZON_DAYS } = {}) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = await User.insertMany(USERS.map((u) => ({ ...u, passwordHash: hash })));

  const roomTypes = await RoomType.insertMany(
    ROOM_TYPES.map(({ baseRupees, ...rt }) => ({ ...rt, photos: [`/photos/${rt.slug}.webp`] })),
  );
  const plans = await RatePlan.insertMany(RATE_PLANS.map(({ addRupees, ...p }) => p));

  const rates = [];
  const inventory = [];
  for (const rt of roomTypes) {
    const base = ROOM_TYPES.find((r) => r.slug === rt.slug).baseRupees;
    const allotment = Math.ceil(rt.totalUnits * 0.3); // 30% of stock released to the website
    for (let i = 0; i < horizon; i++) {
      const date = addDays(today, i);
      const wd = weekday(date);
      inventory.push({ roomTypeId: rt._id, date, allotment, reserved: 0, blackout: false });
      for (const plan of plans) {
        const add = RATE_PLANS.find((p) => p.code === plan.code).addRupees;
        rates.push({ roomTypeId: rt._id, ratePlanId: plan._id, date, price: nightlyPaise(base, add, date, wd) });
      }
    }
  }
  await DailyRate.insertMany(rates, { ordered: false });
  await Inventory.insertMany(inventory, { ordered: false });

  // A private wedding buy-out: villas are blacked out for the website on 12 and 13 Feb 2027.
  const villaIds = roomTypes.filter((r) => r.kind === 'villa').map((r) => r._id);
  await Inventory.updateMany({ roomTypeId: { $in: villaIds }, date: { $in: ['2027-02-12', '2027-02-13'] } }, { blackout: true });

  await Config.insertMany([
    { key: 'gstSlabs', value: DEFAULTS.gstSlabs },
    { key: 'aiConfidenceThreshold', value: DEFAULTS.aiConfidenceThreshold },
    { key: 'holdMinutes', value: DEFAULTS.holdMinutes },
  ]);

  return { users, roomTypes, plans };
}
