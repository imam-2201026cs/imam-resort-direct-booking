import { Router } from 'express';
import { RoomType, RatePlan } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errors.js';
import { todayIST } from '../lib/dates.js';
import { availableForStay, calendar, fromPrices } from '../services/availability.js';
import { quoteStay } from '../services/pricing.js';
import { resolveStay } from '../services/stay.js';
import { quoteSchema, searchSchema, calendarSchema } from '../validators/stay.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const roomDto = (rt, extra = {}) => ({
  slug: rt.slug, name: rt.name, kind: rt.kind, tagline: rt.tagline, description: rt.description,
  photos: rt.photos, amenities: rt.amenities, maxAdults: rt.maxAdults, maxChildren: rt.maxChildren, ...extra,
});

router.get('/room-types', validate(searchSchema, 'query'), wrap(async (req, res) => {
  const { checkIn, checkOut, adults, children } = req.query;
  const types = await RoomType.find().sort({ sortOrder: 1 }).lean();
  const prices = await fromPrices(types.map((t) => t._id), checkIn, checkOut, todayIST());
  const items = await Promise.all(
    types.map(async (rt) => {
      const fits = adults <= rt.maxAdults && adults + children <= rt.maxAdults + rt.maxChildren;
      const available = checkIn ? await availableForStay(rt._id, checkIn, checkOut) : null;
      return roomDto(rt, { fromPrice: prices.get(String(rt._id)), available, fitsParty: fits });
    }),
  );
  res.json({ items });
}));

router.get('/room-types/:slug', wrap(async (req, res) => {
  const rt = await RoomType.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
  if (!rt) throw new AppError(404, 'ROOM_NOT_FOUND', 'That room type does not exist');
  const plans = await RatePlan.find().sort({ sortOrder: 1 }).lean();
  res.json({ roomType: roomDto(rt), ratePlans: plans.map((p) => ({ code: p.code, name: p.name, description: p.description })) });
}));

router.get('/room-types/:slug/calendar', validate(calendarSchema, 'query'), wrap(async (req, res) => {
  const rt = await RoomType.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
  if (!rt) throw new AppError(404, 'ROOM_NOT_FOUND', 'That room type does not exist');
  res.json({ days: await calendar(rt._id, req.query.from, req.query.to) });
}));

router.post('/quotes', validate(quoteSchema), wrap(async (req, res) => {
  const { rt, plan } = await resolveStay(req.body);
  const { checkIn, checkOut, units } = req.body;
  const [quote, available] = await Promise.all([
    quoteStay({ roomTypeId: rt._id, ratePlanId: plan._id, checkIn, checkOut, units }),
    availableForStay(rt._id, checkIn, checkOut),
  ]);
  res.json({ ...quote, units, available, bookable: available >= units, room: rt.name, plan: plan.name });
}));

export default router;
