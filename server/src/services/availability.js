import { Inventory, DailyRate, RatePlan } from '../models/index.js';
import { eachNight, addDays } from '../lib/dates.js';

const free = (inv) => (!inv || inv.blackout ? 0 : Math.max(0, inv.allotment - inv.reserved));

/** Units the website can still sell for every night of the stay (the minimum across nights). */
export async function availableForStay(roomTypeId, checkIn, checkOut) {
  const dates = eachNight(checkIn, checkOut);
  const rows = await Inventory.find({ roomTypeId, date: { $in: dates } }).lean();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return Math.min(...dates.map((d) => free(byDate.get(d))));
}

/** Per-day availability and the lowest published price, for the room page calendar. */
export async function calendar(roomTypeId, from, to) {
  const dates = eachNight(from, addDays(to, 1));
  const [inv, rates] = await Promise.all([
    Inventory.find({ roomTypeId, date: { $in: dates } }).lean(),
    DailyRate.find({ roomTypeId, date: { $in: dates } }).lean(),
  ]);
  const invBy = new Map(inv.map((r) => [r.date, r]));
  const minPrice = new Map();
  for (const r of rates) {
    if (!minPrice.has(r.date) || r.price < minPrice.get(r.date)) minPrice.set(r.date, r.price);
  }
  return dates.map((date) => ({
    date,
    available: free(invBy.get(date)),
    blackout: Boolean(invBy.get(date)?.blackout),
    fromPrice: minPrice.get(date) ?? null,
  }));
}

/** "From" price for a listing: average Room-only nightly rate for the stay, else the lowest of the next 30 days. */
export async function fromPrices(roomTypeIds, checkIn, checkOut, today) {
  const ro = await RatePlan.findOne({ code: 'RO' }).lean();
  const dates = checkIn && checkOut ? eachNight(checkIn, checkOut) : eachNight(today, addDays(today, 30));
  const rows = await DailyRate.find({ roomTypeId: { $in: roomTypeIds }, ratePlanId: ro._id, date: { $in: dates } }).lean();
  const out = new Map();
  for (const id of roomTypeIds) {
    const mine = rows.filter((r) => String(r.roomTypeId) === String(id));
    if (!mine.length) out.set(String(id), null);
    else if (checkIn && checkOut) out.set(String(id), Math.round(mine.reduce((s, r) => s + r.price, 0) / mine.length));
    else out.set(String(id), Math.min(...mine.map((r) => r.price)));
  }
  return out;
}
