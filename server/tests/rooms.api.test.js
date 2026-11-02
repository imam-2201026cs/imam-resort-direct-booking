import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, setupDb, teardownDb } from './helpers/db.js';
import { Inventory, RoomType } from '../src/models/index.js';
import { addDays, todayIST } from '../src/lib/dates.js';

const H = { 'X-Requested-With': 'resort-web' };
const d = hasDb ? describe : describe.skip;

d('public room APIs (DB)', () => {
  let app;
  const today = todayIST();
  const checkIn = addDays(today, 10);
  const checkOut = addDays(today, 12);

  beforeAll(async () => {
    await setupDb();
    const { createApp } = await import('../src/app.js');
    app = createApp();
  });
  afterAll(teardownDb);

  it('lists all five room types with from-prices', async () => {
    const res = await request(app).get('/api/room-types');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.items[0].fromPrice).toBeGreaterThan(0);
  });

  it('reports availability and flags rooms that cannot fit the party', async () => {
    const res = await request(app).get(`/api/room-types?checkIn=${checkIn}&checkOut=${checkOut}&adults=4`);
    const garden = res.body.items.find((i) => i.slug === 'garden-room');
    const villa = res.body.items.find((i) => i.slug === 'coffee-villa');
    expect(garden.fitsParty).toBe(false);
    expect(villa.fitsParty).toBe(true);
    expect(garden.available).toBeGreaterThan(0);
  });

  it('quotes a stay with GST per night from the rate table', async () => {
    const res = await request(app).post('/api/quotes').set(H)
      .send({ roomType: 'valley-deluxe', ratePlan: 'RO', checkIn, checkOut, adults: 2 });
    expect(res.status).toBe(200);
    expect(res.body.nights).toHaveLength(2);
    expect(res.body.total).toBe(res.body.subtotal + res.body.gstTotal);
    expect(res.body.bookable).toBe(true);
  });

  it('shows availability as the minimum across nights', async () => {
    const rt = await RoomType.findOne({ slug: 'pool-villa' });
    await Inventory.updateOne({ roomTypeId: rt._id, date: addDays(today, 11) }, { reserved: 2 }); // allotment is 2
    const res = await request(app).post('/api/quotes').set(H)
      .send({ roomType: 'pool-villa', ratePlan: 'RO', checkIn, checkOut, adults: 2 });
    expect(res.body.available).toBe(0);
    expect(res.body.bookable).toBe(false);
    await Inventory.updateOne({ roomTypeId: rt._id, date: addDays(today, 11) }, { reserved: 0 });
  });

  it('treats blackout dates as unavailable', async () => {
    const rt = await RoomType.findOne({ slug: 'coffee-villa' });
    await Inventory.updateOne({ roomTypeId: rt._id, date: checkIn }, { blackout: true });
    const cal = await request(app).get(`/api/room-types/coffee-villa/calendar?from=${checkIn}&to=${checkOut}`);
    expect(cal.body.days[0]).toMatchObject({ date: checkIn, available: 0, blackout: true });
    await Inventory.updateOne({ roomTypeId: rt._id, date: checkIn }, { blackout: false });
  });

  it('rejects occupancy beyond the room type', async () => {
    const res = await request(app).post('/api/quotes').set(H)
      .send({ roomType: 'garden-room', ratePlan: 'RO', checkIn, checkOut, adults: 3 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OCCUPANCY');
  });

  it('validates dates and unknown rooms', async () => {
    const bad = await request(app).post('/api/quotes').set(H)
      .send({ roomType: 'garden-room', ratePlan: 'RO', checkIn: '2020-01-01', checkOut: '2020-01-02', adults: 2 });
    expect(bad.status).toBe(400);
    const none = await request(app).post('/api/quotes').set(H)
      .send({ roomType: 'castle', ratePlan: 'RO', checkIn, checkOut, adults: 2 });
    expect(none.status).toBe(404);
  });
});
