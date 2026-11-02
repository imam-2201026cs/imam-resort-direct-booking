import { z } from 'zod';
import { stayFields } from './stay.js';
import { validateStayDates } from '../lib/dates.js';

const guest = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  phone: z.string().trim().regex(/^[+0-9 ()-]{8,18}$/, 'Enter a valid phone number'),
});

export const bookingSchema = z
  .object({
    ...stayFields,
    guest,
    specialRequests: z.string().trim().max(500).optional(),
    // DPDP Act 2023: processing needs the guest's explicit, informed consent.
    consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to the privacy notice to continue' }) }),
  })
  .superRefine((v, ctx) => {
    const msg = validateStayDates(v.checkIn, v.checkOut);
    if (msg) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: msg });
  });

const email = z.string().trim().toLowerCase().email().max(120);
export const paySchema = z.object({
  email,
  method: z.enum(['upi', 'card']),
  testCase: z.enum(['success', 'decline']).default('success'),
});
export const lookupSchema = z.object({ email });
