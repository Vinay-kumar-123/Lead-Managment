import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import adminAuthController from '../controllers/adminAuthController.js';
import adminProviderController from '../controllers/adminProviderController.js';
import adminBlogController from '../controllers/adminBlogController.js';
import adminCategoryController from '../controllers/adminCategoryController.js';

const router = express.Router();

function requestRateLimitKey(req) {
  const suite = env.isTest ? req.get('x-konnevia-test-suite') : null;
  if (suite && /^[a-z0-9-]{1,64}$/i.test(suite)) return `test:${suite}`;
  return ipKeyGenerator(req.ip);
}

// Strict rate limiter for owner login (10 attempts per 15 mins)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: requestRateLimitKey,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication routes
router.post('/auth/login', loginLimiter, adminAuthController.login);
router.post('/auth/logout', requireAdmin, adminAuthController.logout);
router.get('/auth/me', requireAdmin, adminAuthController.getMe);

// Dashboard stats
router.get('/dashboard', requireAdmin, adminProviderController.getDashboardStats);

// Customer Enquiries management
router.get('/enquiries', requireAdmin, adminProviderController.getEnquiries);
router.put('/enquiries/:id/status', requireAdmin, adminProviderController.updateEnquiryStatus);

// Partner applications management
router.get('/applications', requireAdmin, adminProviderController.getApplications);
router.get('/applications/:id', requireAdmin, adminProviderController.getApplicationById);
router.post('/applications/:id/approve', requireAdmin, adminProviderController.approveApplication);
router.post('/applications/:id/reject', requireAdmin, adminProviderController.rejectApplication);

// Provider profiles management & publishing
router.get('/providers', requireAdmin, adminProviderController.getProviders);
router.get('/providers/:id', requireAdmin, adminProviderController.getProviderById);
router.put('/providers/:id', requireAdmin, adminProviderController.updateProvider);

// Blog CMS management
router.get('/blogs', requireAdmin, adminBlogController.getBlogs);
router.get('/blogs/:id', requireAdmin, adminBlogController.getBlogById);
router.post('/blogs', requireAdmin, adminBlogController.createBlog);
router.put('/blogs/:id', requireAdmin, adminBlogController.updateBlog);
router.delete('/blogs/:id', requireAdmin, adminBlogController.archiveBlog);

// Category & Subcategory Taxonomy Management (Strictly Admin-only)
router.get(
  '/categories',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.getCategories
);
router.post(
  '/categories',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.createSubcategory
);
router.post(
  '/categories/subcategories',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.createSubcategory
);
router.get(
  '/categories/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.getCategoryById
);
router.put(
  '/categories/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.updateSubcategory
);
router.patch(
  '/categories/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.updateSubcategory
);
router.patch(
  '/categories/:id/status',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.updateSubcategoryStatus
);
router.put(
  '/categories/:id/status',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.updateSubcategoryStatus
);

// Activity Logs
router.get('/activity-logs', requireAdmin, adminProviderController.getActivityLogs);

export default router;
