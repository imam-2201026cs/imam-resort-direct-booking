import { DailyRate } from '../models/index.js';
import { AppError } from '../middleware/errors.js';
import { eachNight } from '../lib/dates.js';
import { roundPaise } from '../lib/money.js';
import { getConfig } from './config.js';

/** GST rate for one night's declared tariff (per room). Slab limits are inclusive. */
export function gstRateFor(pricePaise, slabs) {
  for (const s of slabs) {
    if (s.upToPaise === null || pricePaise <= s.upToPaise) return s.rate;
  }
  return slabs[slabs.length - 1].rate;
}

/** Pure: nightly rates -> priced nights and totals. All values are integer paise. */
export function priceNights(nightRates, units, slabs) {
  const nights = nightRates.map(({ date, price }) => {
    const gstRate = gstRateFor(price, slabs);
    return { date, price, gstRate, gst: roundPaise((price * gstRate) / 100) * units };
  });
  const subtotal = nights.reduce((s, n) => s + n.price * units, 0);
  const gstTotal = nights.reduce((s, n) => s + n.gst, 0);
  return { nights, subtotal, gstTotal, total: subtotal + gstTotal };
}

/** Looks up the rate table (the only source of prices) and prices a stay. */
export async function quoteStay({ roomTypeId, ratePlanId, checkIn, checkOut, units = 1 }) {
  const dates = eachNight(checkIn, checkOut);
  const rows = await DailyRate.find({ roomTypeId, ratePlanId, date: { $in: dates } }).lean();
  const byDate = new Map(rows.map((r) => [r.date, r.price]));
  if (dates.some((d) => !byDate.has(d))) {
    throw new AppError(422, 'NO_RATE', 'Rates for these dates are not published yet');
  }
  const slabs = await getConfig('gstSlabs');
  return priceNights(dates.map((date) => ({ date, price: byDate.get(date) })), units, slabs);
}
