import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';
import leadController from '../controllers/leadController.js';
import { validateEnquiry, validatePartner, validateContact } from '../middleware/validate.js';
import { handleShopImageUpload } from '../middleware/upload.js';

const router = express.Router();

function requestRateLimitKey(req) {
  const suite = env.isTest ? req.get('x-konnevia-test-suite') : null;
  if (suite && /^[a-z0-9-]{1,64}$/i.test(suite)) return `test:${suite}`;
  return ipKeyGenerator(req.ip);
}

// Rate limiting: 10 submissions per 15 minutes per IP
const leadSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: requestRateLimitKey,
  message: {
    success: false,
    message: 'Too many submissions from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/enquiry', leadSubmissionLimiter, validateEnquiry, leadController.submitEnquiry);
router.post(
  '/partner',
  leadSubmissionLimiter,
  handleShopImageUpload,
  validatePartner,
  leadController.submitPartnerEnquiry
);
router.post('/contact', leadSubmissionLimiter, validateContact, leadController.submitContactMessage);

export default router;
