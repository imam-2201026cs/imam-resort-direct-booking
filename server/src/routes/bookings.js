import { Router } from 'express';
import { RoomType, RatePlan } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { limiter } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errors.js';
import { createHold, payBooking, findGuestBooking, bookingDto } from '../services/booking.js';
import { bookingSchema, paySchema, lookupSchema } from '../validators/booking.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function dto(b) {
  const [rt, plan] = await Promise.all([RoomType.findById(b.roomTypeId).lean(), RatePlan.findById(b.ratePlanId).lean()]);
  return bookingDto(b, { roomName: rt?.name, planName: plan?.name });
}

const bookingLimiter = limiter(20, 15 * 60 * 1000, 'Too many booking attempts. Please try again in a few minutes.');

router.post('/bookings', bookingLimiter, validate(bookingSchema), wrap(async (req, res) => {
  const key = req.get('idempotency-key');
  if (key && !/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new AppError(400, 'BAD_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key header');
  const { booking, replayed } = await createHold(req.body, key);
  res.status(replayed ? 200 : 201).json({ booking: await dto(booking) });
}));

router.post('/bookings/:reference/pay', bookingLimiter, validate(paySchema), wrap(async (req, res) => {
  const b = await payBooking({ reference: req.params.reference, ...req.body });
  res.json({ booking: await dto(b) });
}));

router.get('/bookings/:reference', bookingLimiter, validate(lookupSchema, 'query'), wrap(async (req, res) => {
  const b = await findGuestBooking(req.params.reference, req.query.email);
  res.json({ booking: await dto(b) });
}));

export default router;
