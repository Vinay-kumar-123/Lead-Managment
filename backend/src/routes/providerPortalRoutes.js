import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';
import { requireProvider } from '../middleware/providerAuth.js';
import { handleShopImageUpload } from '../middleware/upload.js';
import providerPortalController from '../controllers/providerPortalController.js';

const router = express.Router();

function requestRateLimitKey(req) {
  const suite = env.isTest ? req.get('x-konnevia-test-suite') : null;
  if (suite && /^[a-z0-9-]{1,64}$/i.test(suite)) return `test:${suite}`;
  return ipKeyGenerator(req.ip);
}

const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: requestRateLimitKey,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public Google authentication & configuration endpoints
router.get('/auth/config', providerPortalController.getGoogleAuthConfig);
router.post('/auth/google', googleAuthLimiter, providerPortalController.authenticateWithGoogle);
router.post('/auth/dev-token', googleAuthLimiter, providerPortalController.createDevGoogleIdToken);

// Authenticated Provider session endpoints
router.get('/auth/me', requireProvider, providerPortalController.getMe);
router.post('/auth/logout', requireProvider, providerPortalController.logout);

// Provider Onboarding & Business Profile endpoints
router.put('/onboarding/draft', requireProvider, providerPortalController.saveOnboardingDraft);
router.post(
  '/onboarding',
  requireProvider,
  handleShopImageUpload,
  providerPortalController.completeOnboarding
);
router.get('/dashboard', requireProvider, providerPortalController.getDashboard);
router.put(
  '/profile',
  requireProvider,
  handleShopImageUpload,
  providerPortalController.updateProfile
);

// Provider Services & Packages CRUD endpoints
router.get('/services', requireProvider, providerPortalController.getServices);
router.post('/services', requireProvider, providerPortalController.createService);
router.put('/services/:id', requireProvider, providerPortalController.updateService);
router.patch('/services/:id', requireProvider, providerPortalController.updateService);
router.delete('/services/:id', requireProvider, providerPortalController.deleteService);

// Provider Enquiries endpoint (strictly scoped to assigned provider)
router.get('/enquiries', requireProvider, providerPortalController.getEnquiries);

export default router;
