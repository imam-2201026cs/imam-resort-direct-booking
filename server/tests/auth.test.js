import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import express from 'express';
import cookieParser from 'cookie-parser';

// Unit-level: the User model is mocked. DB-backed integration tests arrive with the booking engine.
vi.mock('../src/models/User.js', () => ({
  User: { findOne: vi.fn(), findById: vi.fn() },
}));

const { User } = await import('../src/models/User.js');
const { createApp } = await import('../src/app.js');
const { requireAuth, requireRole } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/errors.js');

const H = { 'X-Requested-With': 'resort-web' };
const staffDoc = {
  _id: '65f000000000000000000001',
  name: 'Asha Rao',
  email: 'asha@example.com',
  role: 'staff',
  passwordHash: bcrypt.hashSync('Correct-Horse-1', 4),
};

const mockFindOne = (doc) =>
  User.findOne.mockReturnValue({ select: () => ({ lean: async () => doc }) });
const mockFindById = (doc) => User.findById.mockReturnValue({ lean: async () => doc });

async function login(app) {
  mockFindOne(staffDoc);
  const res = await request(app)
    .post('/api/auth/login')
    .set(H)
    .send({ email: 'asha@example.com', password: 'Correct-Horse-1' });
  return res;
}

describe('auth routes', () => {
  const app = createApp();
  beforeEach(() => vi.clearAllMocks());

  it('logs in with valid credentials and sets an httpOnly cookie, never exposing the hash', async () => {
    const res = await login(app);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: staffDoc._id,
      name: 'Asha Rao',
      email: 'asha@example.com',
      role: 'staff',
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/resort_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects a wrong password and an unknown email with the same generic message', async () => {
    mockFindOne(staffDoc);
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .set(H)
      .send({ email: 'asha@example.com', password: 'nope' });
    mockFindOne(null);
    const unknown = await request(app)
      .post('/api/auth/login')
      .set(H)
      .send({ email: 'ghost@example.com', password: 'nope' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/auth/login').set(H).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('blocks state-changing requests without the custom header', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'asha@example.com', password: 'Correct-Horse-1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('/me requires a session and returns the user with one', async () => {
    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);

    const loginRes = await login(app);
    mockFindById(staffDoc);
    const me = await request(app).get('/api/auth/me').set('Cookie', loginRes.headers['set-cookie']);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@example.com');
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', ['resort_token=abc.def.ghi']);
    expect(res.status).toBe(401);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});

describe('role guard', () => {
  const guarded = express();
  guarded.use(cookieParser());
  guarded.get('/gm-only', requireAuth, requireRole('gm'), (_req, res) => res.json({ ok: true }));
  guarded.use(errorHandler);

  const cookieFor = async (role) => {
    const app = createApp();
    mockFindOne({ ...staffDoc, role });
    const res = await request(app)
      .post('/api/auth/login')
      .set(H)
      .send({ email: 'asha@example.com', password: 'Correct-Horse-1' });
    return res.headers['set-cookie'];
  };

  it('allows gm and forbids staff on a gm-only route', async () => {
    const gm = await request(guarded).get('/gm-only').set('Cookie', await cookieFor('gm'));
    const staff = await request(guarded).get('/gm-only').set('Cookie', await cookieFor('staff'));
    const anon = await request(guarded).get('/gm-only');
    expect(gm.status).toBe(200);
    expect(staff.status).toBe(403);
    expect(anon.status).toBe(401);
  });
});
