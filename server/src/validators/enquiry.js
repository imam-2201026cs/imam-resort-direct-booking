import { z } from 'zod';
import { dateSchema } from '../lib/dates.js';
import { CATEGORIES, LANES } from '../models/index.js';

const phone = z.string().trim().regex(/^[+0-9 ()-]{8,18}$/, 'Enter a valid phone number');

export const publicEnquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your name').max(80),
    email: z.string().trim().toLowerCase().email('Enter a valid email').max(120).optional().or(z.literal('').transform(() => undefined)),
    phone: phone.optional().or(z.literal('').transform(() => undefined)),
    message: z.string().trim().max(2000).default(''),
    form: z
      .object({
        eventType: z.enum(['wedding', 'corporate_offsite', 'other']),
        eventDate: dateSchema.optional().or(z.literal('').transform(() => undefined)),
        guests: z.coerce.number().int().min(1).max(2000).optional(),
        nights: z.coerce.number().int().min(1).max(14).optional(),
        budgetInr: z.coerce.number().int().min(0).max(1e9).optional(),
      })
      .optional(),
    consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to the privacy notice to continue' }) }),
    website: z.string().max(200).optional(), // honeypot: real users never fill this
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Give us an email or a phone number so we can reply' });
    if (!v.form && v.message.length < 10) ctx.addIssue({ code: 'custom', path: ['message'], message: 'Please tell us a little more (at least 10 characters)' });
  });

export const listQuery = z.object({
  lane: z.enum(LANES).optional(),
  status: z.enum(['new', 'in_progress', 'replied', 'closed', 'open']).optional(),
});
export const routeBody = z.object({ lane: z.enum(LANES), category: z.enum(CATEGORIES).optional() });
export const draftBody = z.object({ draftReply: z.string().trim().min(1).max(4000) });
export const sendBody = z.object({ body: z.string().trim().min(1, 'Reply cannot be empty').max(4000) });
export const statusBody = z.object({ status: z.enum(['new', 'in_progress', 'closed']) });
export const simulateBody = z.object({
  source: z.enum(['email', 'whatsapp']),
  fromName: z.string().trim().min(2).max(80),
  fromContact: z.string().trim().min(5).max(120),
  message: z.string().trim().min(5).max(2000),
});
