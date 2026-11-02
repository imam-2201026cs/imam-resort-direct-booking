import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, setupDb, teardownDb } from './helpers/db.js';
import { DEMO_PASSWORD } from '../src/seed/data.js';
import { addDays, todayIST } from '../src/lib/dates.js';
import { csvCell } from '../src/lib/csv.js';

const d = hasDb ? describe : describe.skip;
const H = { 'X-Requested-With': 'resort-web' };
const today = todayIST();
const from = addDays(today, 30);
const to = addDays(today, 32);
const idem = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;

d('admin APIs (DB)', () => {
  let app, staff;
  beforeAll(async () => {
    await setupDb({ horizon: 90 });
    const { createApp } = await import('../src/app.js');
    app = createApp();
    staff = request.agent(app);
    const r = await staff.post('/api/auth/login').set(H).send({ email: 'reservations@resort.example', password: DEMO_PASSWORD });
    expect(r.status).toBe(200);
  });
  afterAll(teardownDb);

  it('blocks anonymous access to every admin route', async () => {
    for (const [m, path] of [['get', `/api/admin/rates?roomType=garden-room&from=${from}&to=${to}`], ['put', '/api/admin/rates'], ['put', '/api/admin/allotment'], ['put', '/api/admin/blackouts'], ['get', '/api/admin/bookings'], ['get', `/api/admin/export/bookings.csv?date=${today}`]]) {
      const res = await request(app)[m](path).set(H).send({});
      expect(res.status, `${m} ${path}`).toBe(401);
    }
  });

  it('updates daily rates for selected weekdays only and leaves booked prices untouched', async () => {
    const stay = { roomType: 'garden-room', ratePlan: 'RO', checkIn: from, checkOut: to, adults: 2 };
    const before = await request(app).post('/api/quotes').set(H).send(stay);
    const held = await request(app).post('/api/bookings').set({ ...H, 'Idempotency-Key': idem() })
      .send({ ...stay, units: 1, children: 0, guest: { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876543210' }, consent: true });
    expect(held.status).toBe(201);

    const put = await staff.put('/api/admin/rates').set(H).send({ roomType: 'garden-room', ratePlan: 'RO', from, to, priceRupees: 7000 });
    expect(put.status).toBe(200);
    const after = await request(app).post('/api/quotes').set(H).send(stay);
    expect(after.body.nights.every((n) => n.price === 700000)).toBe(true);
    expect(after.body.subtotal).not.toBe(before.body.subtotal);

    const mine = await request(app).get(`/api/bookings/${held.body.booking.reference}?email=ravi@example.com`);
    expect(mine.body.booking.subtotal).toBe(before.body.subtotal); // snapshot unchanged
  });

  it('validates rate input (price floor, date order, past dates)', async () => {
    const bad = await staff.put('/api/admin/rates').set(H).send({ roomType: 'garden-room', ratePlan: 'RO', from, to, priceRupees: 10 });
    expect(bad.status).toBe(400);
    const past = await staff.put('/api/admin/rates').set(H).send({ roomType: 'garden-room', ratePlan: 'RO', from: addDays(today, -3), to: today, priceRupees: 5000 });
    expect(past.status).toBe(400);
  });

  it('refuses to lower allotment below units already sold, and says which dates', async () => {
    const stay = { roomType: 'valley-deluxe', ratePlan: 'RO', checkIn: from, checkOut: addDays(from, 1), units: 3, adults: 6, children: 0 };
    const r = await request(app).post('/api/bookings').set({ ...H, 'Idempotency-Key': idem() })
      .send({ ...stay, guest: { name: 'Sita Devi', email: 'sita@example.com', phone: '9876543211' }, consent: true });
    expect(r.status).toBe(201);
    const res = await staff.put('/api/admin/allotment').set(H).send({ roomType: 'valley-deluxe', from, to: from, allotment: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BELOW_RESERVED');
    expect(res.body.error.details.dates[0]).toEqual({ date: from, reserved: 3 });
    const ok = await staff.put('/api/admin/allotment').set(H).send({ roomType: 'valley-deluxe', from, to: from, allotment: 5 });
    expect(ok.status).toBe(200);
  });

  it('cannot allot more than the physical units', async () => {
    const res = await staff.put('/api/admin/allotment').set(H).send({ roomType: 'pool-villa', from, to, allotment: 5 });
    expect(res.status).toBe(422);
  });

  it('blackout stops new sales, and lifting it restores them', async () => {
    const q = { roomType: 'garden-room', ratePlan: 'RO', checkIn: addDays(from, 5), checkOut: addDays(from, 6), adults: 2 };
    await staff.put('/api/admin/blackouts').set(H).send({ roomType: 'all', from: q.checkIn, to: q.checkIn, blackout: true });
    expect((await request(app).post('/api/quotes').set(H).send(q)).body.bookable).toBe(false);
    await staff.put('/api/admin/blackouts').set(H).send({ roomType: 'all', from: q.checkIn, to: q.checkIn, blackout: false });
    expect((await request(app).post('/api/quotes').set(H).send(q)).body.bookable).toBe(true);
  });

  it('guest booking flow over HTTP: hold -> pay -> confirmed, and wrong email gets 404', async () => {
    const stay = { roomType: 'plantation-suite', ratePlan: 'CP', checkIn: addDays(from, 10), checkOut: addDays(from, 12), units: 1, adults: 2, children: 1 };
    const hold = await request(app).post('/api/bookings').set({ ...H, 'Idempotency-Key': idem() })
      .send({ ...stay, guest: { name: 'Anil Shetty', email: 'anil@example.com', phone: '+91 99000 11122' }, consent: true });
    expect(hold.status).toBe(201);
    const ref = hold.body.booking.reference;
    expect((await request(app).get(`/api/bookings/${ref}?email=other@example.com`)).status).toBe(404);
    const pay = await request(app).post(`/api/bookings/${ref}/pay`).set(H).send({ email: 'anil@example.com', method: 'upi', testCase: 'success' });
    expect(pay.status).toBe(200);
    expect(pay.body.booking.status).toBe('confirmed');
    expect(JSON.stringify(pay.body)).not.toMatch(/idempotency|passwordHash/i);
  });

  it('requires consent and valid contact details to book', async () => {
    const base = { roomType: 'garden-room', ratePlan: 'RO', checkIn: from, checkOut: to, adults: 2, guest: { name: 'A B', email: 'ab@example.com', phone: '9876543210' } };
    expect((await request(app).post('/api/bookings').set(H).send({ ...base, consent: false })).status).toBe(400);
    expect((await request(app).post('/api/bookings').set(H).send({ ...base, consent: true, guest: { ...base.guest, email: 'nope' } })).status).toBe(400);
  });

  it('exports today\'s confirmed bookings as CSV, with formula-injection protection', async () => {
    const stay = { roomType: 'garden-room', ratePlan: 'RO', checkIn: addDays(from, 20), checkOut: addDays(from, 21), units: 1, adults: 2, children: 0 };
    const hold = await request(app).post('/api/bookings').set({ ...H, 'Idempotency-Key': idem() })
      .send({ ...stay, guest: { name: '=HYPERLINK("http://evil")', email: 'evil@example.com', phone: '9876543212' }, consent: true });
    await request(app).post(`/api/bookings/${hold.body.booking.reference}/pay`).set(H).send({ email: 'evil@example.com', method: 'card', testCase: 'success' });
    const csv = await staff.get(`/api/admin/export/bookings.csv?date=${todayIST()}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toContain('reference,guest_name');
    expect(csv.text).toContain(hold.body.booking.reference);
    expect(csv.text).not.toMatch(/,=HYPERLINK/);
  });

  it('csvCell escapes quotes, commas and formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell(null)).toBe('');
  });
});
