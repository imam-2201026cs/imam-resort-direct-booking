import { Router } from 'express';
import { RoomType, RatePlan, DailyRate, Inventory, Booking } from '../models/index.js';
import { requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errors.js';
import { eachNight, addDays, weekday } from '../lib/dates.js';
import { toPaise } from '../lib/money.js';
import { toCsv } from '../lib/csv.js';
import { cancelBooking, bookingDto } from '../services/booking.js';
import { ratesQuery, rateUpdate, allotmentUpdate, blackoutUpdate, bookingsQuery, exportQuery } from '../validators/admin.js';

const router = Router();
router.use(requireStaff);
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function roomBySlug(slug) {
  const rt = await RoomType.findOne({ slug }).lean();
  if (!rt) throw new AppError(404, 'ROOM_NOT_FOUND', 'That room type does not exist');
  return rt;
}

router.get('/rates', validate(ratesQuery, 'query'), wrap(async (req, res) => {
  const { roomType, from, to } = req.query;
  const rt = await roomBySlug(roomType);
  const dates = eachNight(from, addDays(to, 1));
  const [plans, rates, inv] = await Promise.all([
    RatePlan.find().sort({ sortOrder: 1 }).lean(),
    DailyRate.find({ roomTypeId: rt._id, date: { $in: dates } }).lean(),
    Inventory.find({ roomTypeId: rt._id, date: { $in: dates } }).lean(),
  ]);
  const code = new Map(plans.map((p) => [String(p._id), p.code]));
  const invBy = new Map(inv.map((i) => [i.date, i]));
  const priceBy = new Map();
  for (const r of rates) priceBy.set(`${r.date}|${code.get(String(r.ratePlanId))}`, r.price);
  res.json({
    roomType: { slug: rt.slug, name: rt.name, totalUnits: rt.totalUnits },
    ratePlans: plans.map((p) => ({ code: p.code, name: p.name })),
    days: dates.map((date) => ({
      date,
      prices: Object.fromEntries(plans.map((p) => [p.code, priceBy.get(`${date}|${p.code}`) ?? null])),
      allotment: invBy.get(date)?.allotment ?? 0,
      reserved: invBy.get(date)?.reserved ?? 0,
      blackout: Boolean(invBy.get(date)?.blackout),
    })),
  });
}));

// Rate changes apply to future quotes only; existing bookings keep their snapshot prices.
router.put('/rates', validate(rateUpdate), wrap(async (req, res) => {
  const { roomType, ratePlan, from, to, priceRupees, weekdays } = req.body;
  const [rt, plan] = await Promise.all([roomBySlug(roomType), RatePlan.findOne({ code: ratePlan }).lean()]);
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'That rate plan does not exist');
  const dates = eachNight(from, addDays(to, 1)).filter((d) => !weekdays?.length || weekdays.includes(weekday(d)));
  if (!dates.length) throw new AppError(422, 'EMPTY_RANGE', 'No dates match that selection');
  await DailyRate.bulkWrite(
    dates.map((date) => ({
      updateOne: {
        filter: { roomTypeId: rt._id, ratePlanId: plan._id, date },
        update: { $set: { price: toPaise(priceRupees) } },
        upsert: true,
      },
    })),
  );
  res.json({ updated: dates.length });
}));

router.put('/allotment', validate(allotmentUpdate), wrap(async (req, res) => {
  const { roomType, from, to, allotment } = req.body;
  const rt = await roomBySlug(roomType);
  if (allotment > rt.totalUnits) throw new AppError(422, 'OVER_CAPACITY', `${rt.name} has only ${rt.totalUnits} units in total`);
  const dates = eachNight(from, addDays(to, 1));
  const conflicts = await Inventory.find({ roomTypeId: rt._id, date: { $in: dates }, reserved: { $gt: allotment } }).lean();
  if (conflicts.length) {
    throw new AppError(409, 'BELOW_RESERVED', 'Allotment cannot be lower than units already sold or held on some dates', {
      dates: conflicts.map((c) => ({ date: c.date, reserved: c.reserved })),
    });
  }
  // Re-checked in the filter so a booking landing between the check above and this write is still safe.
  const r = await Inventory.bulkWrite(
    dates.map((date) => ({
      updateOne: {
        filter: { roomTypeId: rt._id, date, reserved: { $lte: allotment } },
        update: { $set: { allotment } },
        upsert: false,
      },
    })),
  );
  res.json({ updated: r.matchedCount, requested: dates.length });
}));

router.put('/blackouts', validate(blackoutUpdate), wrap(async (req, res) => {
  const { roomType, from, to, blackout } = req.body;
  const ids = roomType === 'all' ? (await RoomType.find().lean()).map((r) => r._id) : [(await roomBySlug(roomType))._id];
  const dates = eachNight(from, addDays(to, 1));
  const filter = { roomTypeId: { $in: ids }, date: { $in: dates } };
  const existing = blackout ? await Inventory.aggregate([{ $match: { ...filter, reserved: { $gt: 0 } } }, { $group: { _id: null, n: { $sum: '$reserved' } } }]) : [];
  const r = await Inventory.updateMany(filter, { $set: { blackout } });
  // Blacking out stops new sales only; bookings already made are honoured.
  res.json({ updated: r.modifiedCount, existingReservationsHonoured: existing[0]?.n ?? 0 });
}));

router.get('/bookings', validate(bookingsQuery, 'query'), wrap(async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ reference: rx }, { 'guest.name': rx }, { 'guest.email': rx }];
  }
  const [rows, rooms, plans] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
    RoomType.find().lean(),
    RatePlan.find().lean(),
  ]);
  const rn = new Map(rooms.map((r) => [String(r._id), r.name]));
  const pn = new Map(plans.map((p) => [String(p._id), p.name]));
  res.json({ items: rows.map((b) => bookingDto(b, { roomName: rn.get(String(b.roomTypeId)), planName: pn.get(String(b.ratePlanId)) })) });
}));

router.patch('/bookings/:reference/cancel', wrap(async (req, res) => {
  const b = await cancelBooking(req.params.reference);
  res.json({ booking: bookingDto(b) });
}));

// Daily export for the reservation system: confirmed bookings made on the given IST calendar day.
router.get('/export/bookings.csv', validate(exportQuery, 'query'), wrap(async (req, res) => {
  const { date } = req.query;
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 86400000);
  const [rows, rooms, plans] = await Promise.all([
    Booking.find({ status: 'confirmed', 'payment.paidAt': { $gte: start, $lt: end } }).sort({ 'payment.paidAt': 1 }).lean(),
    RoomType.find().lean(),
    RatePlan.find().lean(),
  ]);
  const rn = new Map(rooms.map((r) => [String(r._id), r.name]));
  const pn = new Map(plans.map((p) => [String(p._id), p.code]));
  const rupees = (p) => (p / 100).toFixed(2);
  const header = ['reference', 'guest_name', 'guest_email', 'guest_phone', 'room_type', 'rate_plan', 'check_in', 'check_out', 'nights', 'units', 'adults', 'children', 'subtotal_inr', 'gst_inr', 'total_inr', 'paid_at'];
  const body = rows.map((b) => [b.reference, b.guest.name, b.guest.email, b.guest.phone, rn.get(String(b.roomTypeId)), pn.get(String(b.ratePlanId)), b.checkIn, b.checkOut, b.nights.length, b.units, b.adults, b.children, rupees(b.subtotal), rupees(b.gstTotal), rupees(b.total), b.payment.paidAt.toISOString()]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookings-${date}.csv"`);
  res.send(toCsv([header, ...body]));
}));

export default router;
