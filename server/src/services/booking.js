import mongoose from 'mongoose';
import { randomInt } from 'node:crypto';
import { Booking, Inventory } from '../models/index.js';
import { AppError } from '../middleware/errors.js';
import { quoteStay } from './pricing.js';
import { resolveStay } from './stay.js';
import { getConfig } from './config.js';
import { chargeTest } from './payments.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newReference = () => `HKR-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

async function inTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

const release = (booking, session) =>
  Promise.all(
    booking.nights.map((n) =>
      Inventory.updateOne({ roomTypeId: booking.roomTypeId, date: n.date }, { $inc: { reserved: -booking.units } }, { session }),
    ),
  );

/**
 * Reserve website allotment for every night of the stay, or nothing at all.
 * Each night is a single conditional update ("only if allotment - reserved >= units"), so two
 * guests can never both take the last unit. Wrapped in a transaction so a failure on any night
 * rolls back the nights already taken.
 */
export async function createHold(body, idempotencyKey) {
  const findByKey = () => Booking.findOne({ idempotencyKey }).lean();
  if (idempotencyKey) {
    const existing = await findByKey();
    if (existing) return { booking: existing, replayed: true };
  }

  const { rt, plan } = await resolveStay(body);
  const { checkIn, checkOut, units, adults, children } = body;
  const quote = await quoteStay({ roomTypeId: rt._id, ratePlanId: plan._id, checkIn, checkOut, units });
  const holdMinutes = await getConfig('holdMinutes');

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let created;
      await inTransaction(async (session) => {
        for (const n of quote.nights) {
          const r = await Inventory.updateOne(
            { roomTypeId: rt._id, date: n.date, blackout: false, $expr: { $gte: [{ $subtract: ['$allotment', '$reserved'] }, units] } },
            { $inc: { reserved: units } },
            { session },
          );
          if (r.modifiedCount !== 1) {
            throw new AppError(409, 'SOLD_OUT', 'Sorry, that room is no longer available for all of these dates. Please try different dates.');
          }
        }
        [created] = await Booking.create(
          [
            {
              reference: newReference(),
              roomTypeId: rt._id, ratePlanId: plan._id, checkIn, checkOut, units, adults, children,
              nights: quote.nights, subtotal: quote.subtotal, gstTotal: quote.gstTotal, total: quote.total,
              guest: body.guest, specialRequests: body.specialRequests, consentAt: new Date(),
              status: 'held', holdExpiresAt: new Date(Date.now() + holdMinutes * 60000),
              idempotencyKey: idempotencyKey || undefined,
            },
          ],
          { session },
        );
      });
      return { booking: created.toObject(), replayed: false };
    } catch (err) {
      if (err?.code === 11000) {
        if (idempotencyKey && err.keyPattern?.idempotencyKey) return { booking: await findByKey(), replayed: true };
        continue; // reference collision: pick another
      }
      throw err;
    }
  }
  throw new AppError(500, 'REFERENCE_FAILED', 'Could not create a booking reference. Please try again.');
}

/** A guest proves ownership of a booking with its reference plus the email used. */
export async function findGuestBooking(reference, email) {
  const b = await Booking.findOne({ reference: String(reference).toUpperCase() }).lean();
  if (!b || b.guest.email !== String(email).trim().toLowerCase()) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'We could not find a booking with those details');
  }
  return b;
}

export async function expireHolds(now = new Date(), limit = 100) {
  const due = await Booking.find({ status: 'held', holdExpiresAt: { $lte: now } }).limit(limit).lean();
  let expired = 0;
  for (const b of due) {
    let won = false;
    await inTransaction(async (session) => {
      won = false;
      const upd = await Booking.findOneAndUpdate(
        { _id: b._id, status: 'held', holdExpiresAt: { $lte: now } },
        { $set: { status: 'expired' } },
        { session },
      );
      if (upd) {
        await release(b, session);
        won = true;
      }
    });
    if (won) expired++;
  }
  return expired;
}

export async function payBooking({ reference, email, method, testCase }) {
  const b = await findGuestBooking(reference, email);
  if (b.status === 'confirmed') return b; // safe to retry
  if (b.status !== 'held') throw new AppError(409, 'NOT_PAYABLE', 'This booking can no longer be paid. Please start a new booking.');

  const expiredErr = async () => {
    await expireHolds();
    return new AppError(410, 'HOLD_EXPIRED', 'Your hold expired before payment. Please start again, your dates may still be available.');
  };
  if (b.holdExpiresAt <= new Date()) throw await expiredErr();

  const result = chargeTest({ method, testCase });
  if (!result.ok) {
    await Booking.updateOne({ _id: b._id }, { $set: { 'payment.status': 'failed', 'payment.method': method }, $inc: { 'payment.attempts': 1 } });
    throw new AppError(402, 'PAYMENT_DECLINED', result.message);
  }
  // Only succeeds if the hold is still live; mutually exclusive with expireHolds().
  const updated = await Booking.findOneAndUpdate(
    { _id: b._id, status: 'held', holdExpiresAt: { $gt: new Date() } },
    {
      $set: { status: 'confirmed', 'payment.method': method, 'payment.status': 'paid', 'payment.txnId': result.txnId, 'payment.paidAt': new Date() },
      $unset: { holdExpiresAt: 1 },
      $inc: { 'payment.attempts': 1 },
    },
    { new: true },
  ).lean();
  if (!updated) throw await expiredErr();
  return updated;
}

export async function cancelBooking(reference) {
  let result;
  await inTransaction(async (session) => {
    result = undefined;
    const b = await Booking.findOneAndUpdate(
      { reference: String(reference).toUpperCase(), status: { $in: ['held', 'confirmed'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { holdExpiresAt: 1 } },
      { session, new: true },
    ).lean();
    if (b) {
      await release(b, session);
      result = b;
    }
  });
  if (!result) throw new AppError(409, 'NOT_CANCELLABLE', 'Only held or confirmed bookings can be cancelled');
  return result;
}

export const bookingDto = (b, { roomName, planName } = {}) => ({
  reference: b.reference, status: b.status, room: roomName, plan: planName,
  checkIn: b.checkIn, checkOut: b.checkOut, units: b.units, adults: b.adults, children: b.children,
  nights: b.nights, subtotal: b.subtotal, gstTotal: b.gstTotal, total: b.total,
  guest: b.guest, specialRequests: b.specialRequests,
  holdExpiresAt: b.holdExpiresAt, paymentStatus: b.payment?.status, paidAt: b.payment?.paidAt, createdAt: b.createdAt,
});
