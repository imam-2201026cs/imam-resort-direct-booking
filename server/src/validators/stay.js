import { z } from 'zod';
import { dateSchema, validateStayDates } from '../lib/dates.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/);

export const stayFields = {
  roomType: slug,
  ratePlan: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/),
  checkIn: dateSchema,
  checkOut: dateSchema,
  units: z.coerce.number().int().min(1).max(3).default(1),
  adults: z.coerce.number().int().min(1).max(12),
  children: z.coerce.number().int().min(0).max(8).default(0),
};

const datesOk = (v, ctx) => {
  const msg = validateStayDates(v.checkIn, v.checkOut);
  if (msg) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: msg });
};

export const quoteSchema = z.object(stayFields).superRefine(datesOk);

export const searchSchema = z
  .object({
    checkIn: dateSchema.optional(),
    checkOut: dateSchema.optional(),
    adults: z.coerce.number().int().min(1).max(12).default(2),
    children: z.coerce.number().int().min(0).max(8).default(0),
  })
  .superRefine((v, ctx) => {
    if (!!v.checkIn !== !!v.checkOut) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Provide both check-in and check-out' });
    else if (v.checkIn) datesOk(v, ctx);
  });

export const calendarSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((v) => v.to >= v.from, { message: 'to must not be before from', path: ['to'] })
  .refine((v) => (new Date(v.to) - new Date(v.from)) / 86400000 <= 62, { message: 'Range limited to 62 days', path: ['to'] });
