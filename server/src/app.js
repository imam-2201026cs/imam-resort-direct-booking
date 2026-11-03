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
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
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
