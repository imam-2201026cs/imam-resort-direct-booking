import { RoomType, RatePlan } from '../models/index.js';
import { AppError } from '../middleware/errors.js';

/** Resolve slug/code to documents and enforce occupancy. Throws AppError. */
export async function resolveStay({ roomType, ratePlan, units, adults, children }) {
  const [rt, plan] = await Promise.all([
    RoomType.findOne({ slug: roomType }).lean(),
    RatePlan.findOne({ code: ratePlan }).lean(),
  ]);
  if (!rt) throw new AppError(404, 'ROOM_NOT_FOUND', 'That room type does not exist');
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'That rate plan does not exist');
  if (adults > units * rt.maxAdults || adults + children > units * (rt.maxAdults + rt.maxChildren)) {
    throw new AppError(
      422,
      'OCCUPANCY',
      `${rt.name} sleeps up to ${rt.maxAdults} adults and ${rt.maxChildren} child${rt.maxChildren === 1 ? '' : 'ren'} per unit. Add another unit or choose a larger stay.`,
    );
  }
  return { rt, plan };
}
