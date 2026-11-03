import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';

export const COOKIE_NAME = 'resort_token';
const TTL_SECONDS = 8 * 60 * 60; // one working shift

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TTL_SECONDS,
  });

export const verifyToken = (token) =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

export const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === 'none',
  // 'lax' when the client proxies /api (same site). 'none' needs Secure and is blocked by some browsers' third-party cookie rules.
  sameSite: env.COOKIE_SAMESITE,
  maxAge: TTL_SECONDS * 1000,
  path: '/',
});
