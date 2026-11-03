import { Router } from 'express';
import { createEnquiry } from '../services/enquiry.js';
import { validate } from '../middleware/validate.js';
import { limiter } from '../middleware/rateLimit.js';
import { publicEnquirySchema } from '../validators/enquiry.js';

const router = Router();

// Public web form. The guest only gets a reference: classification and routing stay internal.
router.post('/enquiries', limiter(10, 60 * 60 * 1000, 'Too many enquiries from this connection. Please call us instead.'), validate(publicEnquirySchema), async (req, res, next) => {
  try {
    const { name, email, phone, message, form, website } = req.body;
    if (website) return res.status(201).json({ reference: 'ENQ-0000' }); // honeypot: pretend success, store nothing
    const e = await createEnquiry({
      source: 'web_form',
      sender: { name, email, phone },
      message,
      form: form && { ...form, budgetPaise: form.budgetInr ? form.budgetInr * 100 : undefined },
    });
    res.status(201).json({ reference: e.reference });
  } catch (err) {
    next(err);
  }
});

export default router;
