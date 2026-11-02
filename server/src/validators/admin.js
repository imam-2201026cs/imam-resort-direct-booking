import { z } from 'zod';
import { dateSchema, todayIST } from '../lib/dates.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/);
const range = (v, ctx) => {
  if (v.to < v.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date is before start date' });
  if (v.from < todayIST()) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Past dates cannot be changed' });
  if ((new Date(v.to) - new Date(v.from)) / 86400000 > 365) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Range limited to one year' });
};

export const ratesQuery = z
  .object({ roomType: slug, from: dateSchema, to: dateSchema })
  .refine((v) => v.to >= v.from && (new Date(v.to) - new Date(v.from)) / 86400000 <= 62, { message: 'Choose a range of up to 62 days', path: ['to'] });

export const rateUpdate = z
  .object({
    roomType: slug,
    ratePlan: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/),
    from: dateSchema,
    to: dateSchema,
    priceRupees: z.coerce.number().int().min(500, 'Minimum ₹500').max(500000),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(), // 0 = Sunday
  })
  .superRefine(range);

export const allotmentUpdate = z
  .object({ roomType: slug, from: dateSchema, to: dateSchema, allotment: z.coerce.number().int().min(0).max(200) })
  .superRefine(range);

export const blackoutUpdate = z
  .object({ roomType: z.union([slug, z.literal('all')]), from: dateSchema, to: dateSchema, blackout: z.boolean() })
  .superRefine(range);

export const bookingsQuery = z.object({
  status: z.enum(['held', 'confirmed', 'expired', 'cancelled']).optional(),
  q: z.string().trim().max(60).optional(),
});
export const exportQuery = z.object({ date: dateSchema });
