import rateLimit from 'express-rate-limit';
import { AppError } from './errors.js';
import { env } from '../config/env.js';

export const limiter = (limit, windowMs, message = 'Too many requests. Please slow down and try again shortly.') =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
