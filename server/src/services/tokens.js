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

export const cookieOptions = (req) => {
  const origin = req?.headers?.origin;
  const isCrossSite = Boolean(origin && !origin.includes('localhost') && !origin.includes('127.0.0.1'));
  const sameSite = isCrossSite || env.COOKIE_SAMESITE === 'none' ? 'none' : env.COOKIE_SAMESITE;
  return {
    httpOnly: true,
    secure: isProd || sameSite === 'none',
    sameSite,
    maxAge: TTL_SECONDS * 1000,
    path: '/',
  };
};
