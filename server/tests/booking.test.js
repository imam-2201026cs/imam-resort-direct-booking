import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hasDb, setupDb, teardownDb } from './helpers/db.js';
import { Booking, Inventory, RoomType } from '../src/models/index.js';
import { createHold, payBooking, expireHolds, cancelBooking } from '../src/services/booking.js';
import { addDays, todayIST } from '../src/lib/dates.js';

const d = hasDb ? describe : describe.skip;
const today = todayIST();
const guest = (n) => ({ name: `Guest ${n}`, email: `guest${n}@example.com`, phone: '+91 98765 43210' });
const stay = (over = {}) => ({
  roomType: 'pool-villa', ratePlan: 'RO', checkIn: addDays(today, 20), checkOut: addDays(today, 22),
  units: 1, adults: 2, children: 0, guest: guest(1), ...over,
});

async function reservedOn(slug, dates) {
  const rt = await RoomType.findOne({ slug }).lean();
  const rows = await Inventory.find({ roomTypeId: rt._id, date: { $in: dates } }).lean();
  return Object.fromEntries(rows.map((r) => [r.date, r.reserved]));
}
async function setAllotment(slug, allotment) {
  const rt = await RoomType.findOne({ slug }).lean();
  await Inventory.updateMany({ roomTypeId: rt._id }, { allotment, reserved: 0, blackout: false });
  await Booking.deleteMany({});
}

d('booking engine: allotment control (DB, transactions)', () => {
  beforeAll(() => setupDb({ horizon: 60 }));
  afterAll(teardownDb);
  beforeEach(() => setAllotment('pool-villa', 2));

  it('NEVER oversells: 25 simultaneous guests, 2 units -> exactly 2 succeed', async () => {
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => createHold(stay({ guest: guest(i) }))));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(2);
    expect(failed).toHaveLength(23);
    expect(failed.every((f) => f.reason.code === 'SOLD_OUT')).toBe(true);
    const nights = [addDays(today, 20), addDays(today, 21)];
    expect(await reservedOn('pool-villa', nights)).toEqual({ [nights[0]]: 2, [nights[1]]: 2 });
    expect(await Booking.countDocuments({ status: 'held' })).toBe(2);
  });

  it('is all-or-nothing across nights: overlapping stays never leave partial reservations', async () => {
    await setAllotment('pool-villa', 1);
    const [n1, n2, n3, n4] = [20, 21, 22, 23].map((i) => addDays(today, i));
    const A = stay({ checkIn: n1, checkOut: addDays(n2, 1) }); // nights n1,n2
    const B = stay({ checkIn: n2, checkOut: addDays(n3, 1) }); // nights n2,n3
    const C = stay({ checkIn: n3, checkOut: addDays(n4, 1) }); // nights n3,n4
    const attempts = [A, B, C, A, B, C, A, B, C].map((s, i) => createHold({ ...s, guest: guest(i) }));
    const results = await Promise.allSettled(attempts);
    const won = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.booking);

    const reserved = await reservedOn('pool-villa', [n1, n2, n3, n4]);
    const expected = {};
    for (const b of won) for (const n of b.nights) expected[n.date] = (expected[n.date] || 0) + b.units;
    for (const date of [n1, n2, n3, n4]) {
      expect(reserved[date]).toBeLessThanOrEqual(1);
      expect(reserved[date]).toBe(expected[date] || 0); // inventory matches bookings exactly
    }
    // The only valid outcomes are {A,C} (no overlap) or {B} alone.
    const nightsBooked = won.reduce((s, b) => s + b.nights.length, 0);
    expect([2, 4]).toContain(nightsBooked);
  });

  it('rolls back earlier nights when a later night is sold out', async () => {
    const rt = await RoomType.findOne({ slug: 'pool-villa' });
    await Inventory.updateOne({ roomTypeId: rt._id, date: addDays(today, 21) }, { reserved: 2 }); // night 2 full
    await expect(createHold(stay())).rejects.toMatchObject({ code: 'SOLD_OUT' });
    expect(await reservedOn('pool-villa', [addDays(today, 20)])).toEqual({ [addDays(today, 20)]: 0 });
  });

  it('reserves several units atomically and refuses when not enough remain', async () => {
    await createHold(stay({ units: 2, adults: 4 }));
    await expect(createHold(stay({ units: 1, guest: guest(2) }))).rejects.toMatchObject({ code: 'SOLD_OUT' });
    const r = await reservedOn('pool-villa', [addDays(today, 20), addDays(today, 21)]);
    expect(Object.values(r)).toEqual([2, 2]);
  });

  it('refuses blackout dates', async () => {
    const rt = await RoomType.findOne({ slug: 'pool-villa' });
    await Inventory.updateOne({ roomTypeId: rt._id, date: addDays(today, 21) }, { blackout: true });
    await expect(createHold(stay())).rejects.toMatchObject({ code: 'SOLD_OUT' });
  });

  it('is idempotent: the same key twice (even in parallel) creates one booking and one reservation', async () => {
    const key = 'idem-key-12345678';
    const [a, b] = await Promise.all([createHold(stay(), key), createHold(stay(), key)]);
    expect(a.booking.reference).toBe(b.booking.reference);
    expect(await Booking.countDocuments()).toBe(1);
    expect(Object.values(await reservedOn('pool-villa', [addDays(today, 20), addDays(today, 21)]))).toEqual([1, 1]);
  });

  it('snapshots prices and GST on the booking', async () => {
    const { booking } = await createHold(stay());
    expect(booking.nights).toHaveLength(2);
    expect(booking.total).toBe(booking.subtotal + booking.gstTotal);
    expect(booking.nights.every((n) => n.gstRate === 18)).toBe(true); // villa tariffs are above ₹7,500
  });
});

d('booking lifecycle (DB)', () => {
  beforeAll(() => setupDb({ horizon: 60 }));
  afterAll(teardownDb);
  beforeEach(() => setAllotment('pool-villa', 2));
  const nights = () => [addDays(today, 20), addDays(today, 21)];

  it('confirms on successful test payment and keeps the reservation', async () => {
    const { booking } = await createHold(stay());
    const paid = await payBooking({ reference: booking.reference, email: 'guest1@example.com', method: 'upi', testCase: 'success' });
    expect(paid.status).toBe('confirmed');
    expect(paid.payment.status).toBe('paid');
    expect(paid.holdExpiresAt).toBeUndefined();
    expect(Object.values(await reservedOn('pool-villa', nights()))).toEqual([1, 1]);
  });

  it('keeps the hold after a declined payment so the guest can retry', async () => {
    const { booking } = await createHold(stay());
    const args = { reference: booking.reference, email: 'guest1@example.com', method: 'card' };
    await expect(payBooking({ ...args, testCase: 'decline' })).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect((await Booking.findOne({ reference: booking.reference })).status).toBe('held');
    const ok = await payBooking({ ...args, testCase: 'success' });
    expect(ok.status).toBe('confirmed');
  });

  it('payment is idempotent once confirmed', async () => {
    const { booking } = await createHold(stay());
    const args = { reference: booking.reference, email: 'guest1@example.com', method: 'upi', testCase: 'success' };
    const a = await payBooking(args);
    const b = await payBooking(args);
    expect(b.payment.txnId).toBe(a.payment.txnId);
  });

  it('only the booking owner (matching email) can pay or view', async () => {
    const { booking } = await createHold(stay());
    await expect(payBooking({ reference: booking.reference, email: 'someone@else.com', method: 'upi', testCase: 'success' }))
      .rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' });
  });

  it('expired holds release inventory and cannot be paid', async () => {
    const { booking } = await createHold(stay());
    await Booking.updateOne({ reference: booking.reference }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await expect(payBooking({ reference: booking.reference, email: 'guest1@example.com', method: 'upi', testCase: 'success' }))
      .rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    expect((await Booking.findOne({ reference: booking.reference })).status).toBe('expired');
    expect(Object.values(await reservedOn('pool-villa', nights()))).toEqual([0, 0]);
  });

  it('the sweeper releases abandoned holds exactly once, and leaves confirmed bookings alone', async () => {
    const a = await createHold(stay({ guest: guest(1) }));
    const b = await createHold(stay({ guest: guest(2) }));
    await payBooking({ reference: b.booking.reference, email: 'guest2@example.com', method: 'upi', testCase: 'success' });
    await Booking.updateOne({ reference: a.booking.reference }, { holdExpiresAt: new Date(Date.now() - 1000) });
    expect(await expireHolds()).toBe(1);
    expect(await expireHolds()).toBe(0);
    expect(Object.values(await reservedOn('pool-villa', nights()))).toEqual([1, 1]);
  });

  it('a freed unit can be booked again after expiry', async () => {
    await setAllotment('pool-villa', 1);
    const a = await createHold(stay());
    await expect(createHold(stay({ guest: guest(2) }))).rejects.toMatchObject({ code: 'SOLD_OUT' });
    await Booking.updateOne({ reference: a.booking.reference }, { holdExpiresAt: new Date(Date.now() - 1000) });
    await expireHolds();
    await expect(createHold(stay({ guest: guest(2) }))).resolves.toBeTruthy();
  });

  it('staff cancellation releases inventory and cannot be repeated', async () => {
    const { booking } = await createHold(stay());
    await payBooking({ reference: booking.reference, email: 'guest1@example.com', method: 'upi', testCase: 'success' });
    await cancelBooking(booking.reference);
    expect(Object.values(await reservedOn('pool-villa', nights()))).toEqual([0, 0]);
    await expect(cancelBooking(booking.reference)).rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });
    expect(Object.values(await reservedOn('pool-villa', nights()))).toEqual([0, 0]); // no double release
  });
});
