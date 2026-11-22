import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import adminAuthController from '../controllers/adminAuthController.js';
import adminProviderController from '../controllers/adminProviderController.js';
import adminBlogController from '../controllers/adminBlogController.js';
import adminCategoryController from '../controllers/adminCategoryController.js';
import adminServiceController from '../controllers/adminServiceController.js';

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
router.delete(
  '/enquiries/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminProviderController.softDeleteEnquiry
);
router.post(
  '/enquiries/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminProviderController.restoreEnquiry
);
router.post(
  '/enquiries/:id/anonymize',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.anonymizeEnquiry
);
router.delete(
  '/enquiries/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminProviderController.permanentDeleteEnquiry
);

// Partner applications management
router.get('/applications', requireAdmin, adminProviderController.getApplications);
router.get('/applications/:id', requireAdmin, adminProviderController.getApplicationById);
router.post('/applications/:id/approve', requireAdmin, adminProviderController.approveApplication);
router.post('/applications/:id/reject', requireAdmin, adminProviderController.rejectApplication);
router.delete(
  '/applications/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminProviderController.softDeleteApplication
);
router.post(
  '/applications/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminProviderController.restoreApplication
);
router.delete(
  '/applications/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminProviderController.permanentDeleteApplication
);

// Provider profiles management & publishing
router.get('/providers', requireAdmin, adminProviderController.getProviders);
router.get('/providers/:id', requireAdmin, adminProviderController.getProviderById);
router.put('/providers/:id', requireAdmin, adminProviderController.updateProvider);
router.get(
  '/providers/:id/deletion-impact',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.getProviderDeletionImpact
);
router.delete(
  '/providers/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.softDeleteProvider
);
router.post(
  '/providers/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.restoreProvider
);
router.delete(
  '/providers/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminProviderController.permanentDeleteProvider
);

// Provider Services & Packages management
router.get(
  '/services',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.getServices
);
router.get(
  '/services/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.getServiceById
);
router.patch(
  '/services/:id/approval',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.updateServiceApproval
);
router.patch(
  '/services/:id/status',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.updateServiceStatus
);
router.delete(
  '/services/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.softDeleteService
);
router.post(
  '/services/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'),
  adminServiceController.restoreService
);
router.delete(
  '/services/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminServiceController.permanentDeleteService
);

// Blog CMS management
router.get('/blogs', requireAdmin, adminBlogController.getBlogs);
router.get('/blogs/:id', requireAdmin, adminBlogController.getBlogById);
router.post('/blogs', requireAdmin, adminBlogController.createBlog);
router.put('/blogs/:id', requireAdmin, adminBlogController.updateBlog);
router.delete(
  '/blogs/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'),
  adminBlogController.archiveBlog
);
router.post(
  '/blogs/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'),
  adminBlogController.restoreBlog
);
router.delete(
  '/blogs/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminBlogController.permanentDeleteBlog
);

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
router.get(
  '/categories/:id/dependencies',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.getSubcategoryDependencies
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
router.delete(
  '/categories/:id',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.softDeleteSubcategory
);
router.post(
  '/categories/:id/restore',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.restoreSubcategory
);
router.post(
  '/categories/:id/reassign',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminCategoryController.reassignSubcategoryDependencies
);
router.delete(
  '/categories/:id/permanent',
  requireAdmin,
  requireRole('SUPER_ADMIN'),
  adminCategoryController.permanentDeleteSubcategory
);

// Media Cleanup Recovery Queue
router.get(
  '/media-cleanup',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.listMediaCleanupTasks
);
router.post(
  '/media-cleanup/:id/retry',
  requireAdmin,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  adminProviderController.retryMediaCleanupTask
);

// Activity Logs (Immutable Audit Trail — Deletion Intentionally Restricted)
router.get('/activity-logs', requireAdmin, adminProviderController.getActivityLogs);

export default router;
