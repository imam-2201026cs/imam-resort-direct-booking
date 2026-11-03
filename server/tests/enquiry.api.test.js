import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, setupDb, teardownDb } from './helpers/db.js';
import { DEMO_PASSWORD } from '../src/seed/data.js';
import { Enquiry, DailyRate, RoomType } from '../src/models/index.js';
import { addDays, todayIST } from '../src/lib/dates.js';

const d = hasDb ? describe : describe.skip;
const H = { 'X-Requested-With': 'resort-web' };
const today = todayIST();

d('enquiry inbox (DB)', () => {
  let app, reservations, gm, sales;
  const login = async (email) => {
    const a = request.agent(app);
    const r = await a.post('/api/auth/login').set(H).send({ email, password: DEMO_PASSWORD });
    expect(r.status).toBe(200);
    return a;
  };
  const submit = (over = {}) =>
    request(app).post('/api/enquiries').set(H).send({ name: 'Priya Menon', email: 'priya@example.com', consent: true, message: 'Is a villa free next weekend?', ...over });

  beforeAll(async () => {
    await setupDb({ horizon: 90 });
    const { createApp } = await import('../src/app.js');
    app = createApp();
    [reservations, gm, sales] = await Promise.all([login('reservations@resort.example'), login('gm@resort.example'), login('sales@resort.example')]);
  });
  afterAll(teardownDb);

  it('creates, classifies and routes a web-form enquiry; the guest only sees a reference', async () => {
    const in3 = addDays(today, 20);
    const res = await submit({ message: `Is a villa free ${new Date(in3).getUTCDate()}-${new Date(addDays(in3, 2)).getUTCDate()} ${new Date(in3).toLocaleString('en', { month: 'short', timeZone: 'UTC' })} for 2 adults?` });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['reference']);
    const list = await reservations.get('/api/admin/enquiries');
    const item = list.body.items.find((i) => i.reference === res.body.reference);
    expect(item).toMatchObject({ category: 'room_booking', lane: 'reservations', status: 'new' });
    expect(item.owner).toBe('Asha Rao');
  });

  it('drafts take prices from the rate table, never from the guest message, and are never auto-sent', async () => {
    const checkIn = addDays(today, 25);
    const rt = await RoomType.findOne({ slug: 'valley-deluxe' });
    await DailyRate.updateMany({ roomTypeId: rt._id, date: { $in: [checkIn, addDays(checkIn, 1)] } }, { price: 987600 }); // ₹9,876 marker
    const dd = (s) => new Date(s).getUTCDate();
    const mon = new Date(checkIn).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
    const res = await submit({ message: `Your website said a villa costs Rs 4000 a night. Is a room free ${dd(checkIn)}-${dd(addDays(checkIn, 2))} ${mon} for 2 adults?` });
    const e = await Enquiry.findOne({ reference: res.body.reference }).lean();
    expect(e.draftReply).toContain('₹9,876'); // from the rate table
    expect(e.draftReply).not.toContain('4,000');
    expect(e.draftReply).not.toContain('4000');
    expect(e.sentReply).toBeUndefined();
    expect(e.status).toBe('new');
    expect(e.firstResponseAt).toBeUndefined();
  });

  it('sends vague enquiries to Unsorted, visible only to the GM', async () => {
    const res = await submit({ message: 'Hello, I would like some information please' });
    const gmList = await gm.get('/api/admin/enquiries?lane=unsorted');
    expect(gmList.body.items.map((i) => i.reference)).toContain(res.body.reference);
    const staffList = await reservations.get('/api/admin/enquiries');
    expect(staffList.body.items.map((i) => i.reference)).not.toContain(res.body.reference);
    expect((await reservations.get('/api/admin/enquiries?lane=unsorted')).status).toBe(403);
    expect((await reservations.get(`/api/admin/enquiries/${res.body.reference}`)).status).toBe(404);
  });

  it('complaints go to the GM lane with an alert, drafted with an apology and no prices', async () => {
    const res = await submit({ message: 'The room was dirty and the staff were rude. I want a refund.' });
    const list = await gm.get('/api/admin/enquiries?lane=gm');
    const item = list.body.items.find((i) => i.reference === res.body.reference);
    expect(item).toMatchObject({ category: 'complaint', gmAlert: true });
    expect(list.body.gmAlerts).toBeGreaterThan(0);
    const detail = await gm.get(`/api/admin/enquiries/${res.body.reference}`);
    expect(detail.body.enquiry.draftReply).toMatch(/sorry/i);
    expect(detail.body.enquiry.draftReply).not.toMatch(/₹/);
  });

  it('the GM triages Unsorted with one click: re-route, audit trail, fresh draft', async () => {
    const res = await submit({ message: 'We are planning a wedding and need rooms for the guests' }); // mixed intent
    const ref = res.body.reference;
    expect((await Enquiry.findOne({ reference: ref }).lean()).lane).toBe('unsorted');
    const out = await gm.patch(`/api/admin/enquiries/${ref}/route`).set(H).send({ lane: 'sales', category: 'wedding' });
    expect(out.status).toBe(200);
    expect(out.body.enquiry).toMatchObject({ lane: 'sales', category: 'wedding', owner: 'Rohan Gowda' });
    expect(out.body.enquiry.events.at(-1).type).toBe('rerouted');
    expect(out.body.enquiry.draftReply).toMatch(/wedding/i);
  });

  it('staff re-route a misfiled enquiry out of their lane in one click', async () => {
    const res = await submit({ message: 'Is a villa free next weekend for 2 adults?' });
    const ref = res.body.reference;
    const out = await reservations.patch(`/api/admin/enquiries/${ref}/route`).set(H).send({ lane: 'sales', category: 'corporate_offsite' });
    expect(out.status).toBe(200);
    expect(out.body.enquiry.lane).toBe('sales');
    expect(out.body.enquiry.events.map((e) => e.type)).toEqual(['received', 'ai_classified', 'routed', 'rerouted']);
  });

  it('staff cannot move an enquiry into Unsorted; the GM can', async () => {
    const res = await submit({ message: 'Is a villa free next weekend for 2 adults and a child?' });
    const staff = await reservations.patch(`/api/admin/enquiries/${res.body.reference}/route`).set(H).send({ lane: 'unsorted' });
    expect(staff.status).toBe(403);
  });

  it('sending a reply is an explicit staff action and records first-response time', async () => {
    const res = await submit({ message: 'Is a villa free next weekend for 2 adults and a child?' });
    const ref = res.body.reference;
    const detail = await reservations.get(`/api/admin/enquiries/${ref}`);
    const sent = await reservations.post(`/api/admin/enquiries/${ref}/send`).set(H).send({ body: detail.body.enquiry.draftReply });
    expect(sent.body.enquiry.status).toBe('replied');
    expect(sent.body.enquiry.firstResponseAt).toBeTruthy();
    const metrics = await reservations.get('/api/admin/metrics');
    expect(metrics.body.medianFirstReplyMinutes).toBeGreaterThanOrEqual(0);
    expect((await reservations.post(`/api/admin/enquiries/${ref}/send`).set(H).send({ body: '   ' })).status).toBe(400);
  });

  it('structured wedding form is routed to sales with the form details', async () => {
    const res = await submit({ message: '', form: { eventType: 'wedding', eventDate: addDays(today, 120), guests: 250, nights: 2, budgetInr: 1500000 } });
    expect(res.status).toBe(201);
    const e = await Enquiry.findOne({ reference: res.body.reference }).lean();
    expect(e).toMatchObject({ lane: 'sales', category: 'wedding' });
    expect(e.ai.extracted.guests).toBe(250);
    expect(e.draftReply).toContain('250');
  });

  it('validates the public form: consent, contact, message length, honeypot', async () => {
    expect((await submit({ consent: false })).status).toBe(400);
    expect((await submit({ email: undefined })).status).toBe(400); // no way to reply
    expect((await submit({ message: 'hi' })).status).toBe(400);
    const before = await Enquiry.countDocuments();
    const bot = await submit({ website: 'http://spam.example' });
    expect(bot.status).toBe(201);
    expect(await Enquiry.countDocuments()).toBe(before); // nothing stored
  });

  it('simulated email/WhatsApp go through the same pipeline; endpoint needs staff login', async () => {
    const anon = await request(app).post('/api/admin/simulate-inbound').set(H).send({});
    expect(anon.status).toBe(401);
    const res = await sales.post('/api/admin/simulate-inbound').set(H).send({ source: 'whatsapp', fromName: 'Karthik', fromContact: '+91 90000 11111', message: 'Hi, team of 30 looking for an offsite in January, conference hall needed' });
    expect(res.status).toBe(201);
    expect(res.body.lane).toBe('sales');
    const e = await Enquiry.findOne({ reference: res.body.reference }).lean();
    expect(e.source).toBe('whatsapp');
  });
});
