import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requireCustomHeader } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/errors.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import roomsRouter from './routes/rooms.js';
import bookingsRouter from './routes/bookings.js';
import adminRouter from './routes/admin.js';
import enquiriesRouter from './routes/enquiries.js';
import adminEnquiriesRouter from './routes/adminEnquiries.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render's proxy
  app.disable('x-powered-by');

  app.use(helmet());

  const explicitOrigins = (env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'https://client-psi-ashy.vercel.app',
    ...explicitOrigins,
  ]);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.has(origin) ||
          origin.endsWith('.vercel.app') ||
          explicitOrigins.some(
            (allowed) => allowed === origin || (allowed.startsWith('*.') && origin.endsWith(allowed.slice(1))),
          )
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
      exposedHeaders: ['set-cookie'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', requireCustomHeader);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', roomsRouter);
  app.use('/api', bookingsRouter);
  app.use('/api', enquiriesRouter);
  app.use('/api/admin', adminEnquiriesRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
