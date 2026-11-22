import Lead from '../models/Lead.js';
import Provider from '../models/Provider.js';
import ProviderService from '../models/ProviderService.js';
import Blog from '../models/Blog.js';
import ActivityLog from '../models/ActivityLog.js';
import deletionService, { assertValidObjectId } from '../services/deletionService.js';
import { escapeRegex, createSlug as createCategorySlug } from '../services/categoryService.js';
import { normalizeKeywords } from '../config/searchDictionary.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { logAdminActivity } from '../services/activityLogger.js';
import logger from '../utils/logger.js';

function createSlug(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function handleControllerError(err, res, next) {
  if (err && err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.details || null);
  }
  if (err && err.name === 'CastError') {
    return errorResponse(res, 'Invalid record identifier format.', 400);
  }
  return next(err);
}

function isPermanentDeleteConfirmed(req) {
  return req.body?.confirmPermanent === true || req.query?.confirm === 'true';
}

export const adminProviderController = {
  /**
   * GET /api/v1/admin/dashboard
   * Consolidated counts and stats from real MongoDB queries
   */
  async getDashboardStats(req, res, next) {
    try {
      const activeFilter = { isDeleted: { $ne: true } };
      const [
        totalApplications,
        pendingApplications,
        approvedApplications,
        rejectedApplications,
        totalEnquiries,
        newEnquiries,
        totalProviders,
        publishedProviders,
        totalBlogs,
        publishedBlogs,
        draftBlogs,
        totalServices,
        pendingServices,
        recentApplications,
        recentEnquiries,
        recentBlogs,
        recentActivityLogs,
      ] = await Promise.all([
        Lead.countDocuments({ ...activeFilter, type: 'partner' }),
        Lead.countDocuments({ ...activeFilter, type: 'partner', status: 'new' }),
        Lead.countDocuments({ ...activeFilter, type: 'partner', status: { $in: ['qualified', 'converted'] } }),
        Lead.countDocuments({ ...activeFilter, type: 'partner', status: 'rejected' }),
        Lead.countDocuments({ ...activeFilter, type: { $in: ['enquiry', 'contact'] } }),
        Lead.countDocuments({ ...activeFilter, type: { $in: ['enquiry', 'contact'] }, status: 'new' }),
        Provider.countDocuments(activeFilter),
        Provider.countDocuments({ ...activeFilter, publicationStatus: 'PUBLISHED', verificationStatus: 'VERIFIED' }),
        Blog.countDocuments(activeFilter),
        Blog.countDocuments({ ...activeFilter, status: 'published' }),
        Blog.countDocuments({ ...activeFilter, status: 'draft' }),
        ProviderService.countDocuments(activeFilter),
        ProviderService.countDocuments({ ...activeFilter, approvalStatus: 'PENDING' }),
        Lead.find({ ...activeFilter, type: 'partner' }).sort({ createdAt: -1 }).limit(5).lean(),
        Lead.find({ ...activeFilter, type: 'enquiry' }).sort({ createdAt: -1 }).limit(5).lean(),
        Blog.find(activeFilter).sort({ createdAt: -1 }).limit(5).select('title slug status category publishedAt').lean(),
        ActivityLog.find().sort({ createdAt: -1 }).limit(8).lean(),
      ]);

      return successResponse(res, {
        stats: {
          applications: {
            total: totalApplications,
            pending: pendingApplications,
            approved: approvedApplications,
            rejected: rejectedApplications,
          },
          enquiries: {
            total: totalEnquiries,
            new: newEnquiries,
          },
          providers: {
            total: totalProviders,
            published: publishedProviders,
            draft: totalProviders - publishedProviders,
          },
          services: {
            total: totalServices,
            pending: pendingServices,
          },
          blogs: {
            total: totalBlogs,
            published: publishedBlogs,
            draft: draftBlogs,
          },
        },
        recentApplications,
        recentEnquiries,
        recentBlogs,
        recentActivityLogs,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/applications
   */
  async getApplications(req, res, next) {
    try {
      const { status, search, deleted } = req.query;
      const query = { type: 'partner' };

      if (status === 'deleted' || deleted === 'only') {
        query.isDeleted = true;
      } else {
        query.isDeleted = { $ne: true };
        if (status && status !== 'all') {
          if (status === 'pending') query.status = 'new';
          else if (status === 'approved') query.status = { $in: ['qualified', 'converted'] };
          else if (status === 'rejected') query.status = 'rejected';
          else query.status = status;
        }
      }

      if (search && typeof search === 'string' && search.trim()) {
        const clean = escapeRegex(search.trim().slice(0, 100));
        query.$or = [
          { businessName: { $regex: clean, $options: 'i' } },
          { contactPerson: { $regex: clean, $options: 'i' } },
          { phone: { $regex: clean, $options: 'i' } },
          { email: { $regex: clean, $options: 'i' } },
          { referenceId: { $regex: clean, $options: 'i' } },
        ];
      }

      const applications = await Lead.find(query).sort({ createdAt: -1 }).lean();
      return successResponse(res, applications);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * GET /api/v1/admin/applications/:id
   */
  async getApplicationById(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'application');
      const application = await Lead.findById(cleanId).lean();
      if (!application || application.type !== 'partner') {
        return errorResponse(res, 'Partner application not found', 404);
      }

      const existingProvider = await Provider.findOne({ sourceApplicationId: application._id }).lean();

      return successResponse(res, {
        application,
        linkedProvider: existingProvider,
      });
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * POST /api/v1/admin/applications/:id/approve
   * Approves application and creates/updates a VERIFIED + DRAFT Provider record.
   */
  async approveApplication(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'application');
      const application = await Lead.findById(cleanId);
      if (!application || application.type !== 'partner') {
        return errorResponse(res, 'Partner application not found', 404);
      }
      if (application.isDeleted) {
        return errorResponse(res, 'Cannot approve a deleted partner application. Restore it first.', 409);
      }

      application.status = 'qualified';
      await application.save();

      let provider = await Provider.findOne({ sourceApplicationId: application._id });

      if (!provider) {
        let baseSlug = createSlug(application.businessName);
        let slug = baseSlug;
        let counter = 1;
        while (await Provider.findOne({ slug })) {
          slug = `${baseSlug}-${counter++}`;
        }

        const catSlug = createSlug(application.category);

        provider = new Provider({
          businessName: application.businessName,
          providerName: application.contactPerson,
          slug,
          description:
            application.businessDescription ||
            `${application.businessName} provides verified services across ${application.city}.`,
          category: application.category,
          categorySlug: catSlug || 'services',
          services: Array.isArray(application.servicesOffered) ? application.servicesOffered : [],
          contactNumber: application.phone,
          email: application.email,
          city: application.city,
          state: application.state || '',
          address: application.address || '',
          pinCode: application.pinCode || '',
          serviceAreas: Array.isArray(application.serviceAreas)
            ? application.serviceAreas
            : [application.city],
          website: application.website || '',
          shopImage: application.shopImage || {},
          sourceApplicationId: application._id,
          sourceReferenceId: application.referenceId,
          verificationStatus: 'VERIFIED',
          publicationStatus: 'DRAFT',
          publicationConsent: application.consentToContact || true,
          consentToDisplayPhone: application.consentToDisplayPhone !== false,
          verifiedAt: new Date(),
        });

        await provider.save();

      if (provider.verificationStatus === 'VERIFIED') {
        const svcUpdate = { approvalStatus: 'APPROVED', rejectionReason: '' };
        if (provider.publicationStatus === 'PUBLISHED') {
          svcUpdate.publicationStatus = 'PUBLISHED';
        }
        await ProviderService.updateMany(
          { providerId: provider._id, approvalStatus: 'PENDING' },
          { $set: svcUpdate }
        );
      }
      } else {
        provider.verificationStatus = 'VERIFIED';
        provider.rejectionReason = '';
        provider.verifiedAt = new Date();
        if (application.shopImage?.url && !provider.shopImage?.url) {
          provider.shopImage = application.shopImage;
        }
        await provider.save();

      if (provider.verificationStatus === 'VERIFIED') {
        const svcUpdate = { approvalStatus: 'APPROVED', rejectionReason: '' };
        if (provider.publicationStatus === 'PUBLISHED') {
          svcUpdate.publicationStatus = 'PUBLISHED';
        }
        await ProviderService.updateMany(
          { providerId: provider._id, approvalStatus: 'PENDING' },
          { $set: svcUpdate }
        );
      }
      }

      // Approve any pending services belonging to this provider
      await ProviderService.updateMany(
        { providerId: provider._id, approvalStatus: 'PENDING' },
        { $set: { approvalStatus: 'APPROVED', rejectionReason: '' } }
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'APPLICATION_APPROVED',
        targetType: 'LEAD',
        targetId: String(application._id),
        details: {
          businessName: application.businessName,
          providerId: String(provider._id),
          slug: provider.slug,
        },
        req,
      });

      return successResponse(
        res,
        { application, provider },
        'Application approved successfully. Provider profile created as DRAFT.'
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/admin/applications/:id/reject
   */
  async rejectApplication(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'application');
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return errorResponse(res, 'A rejection reason is mandatory', 400);
      }

      const application = await Lead.findById(cleanId);
      if (!application || application.type !== 'partner') {
        return errorResponse(res, 'Partner application not found', 404);
      }
      if (application.isDeleted) {
        return errorResponse(res, 'Cannot reject a deleted partner application. Restore it first.', 409);
      }

      application.status = 'rejected';
      if (!application.metadata) application.metadata = new Map();
      application.metadata.set('rejectionReason', reason.trim());
      application.metadata.set('rejectedAt', new Date().toISOString());
      await application.save();

      // Revoke any existing provider record and record rejection reason
      const linkedProv = await Provider.findOne({ sourceApplicationId: application._id });
      if (linkedProv) {
        linkedProv.verificationStatus = 'REVOKED';
        linkedProv.publicationStatus = 'ARCHIVED';
        linkedProv.rejectionReason = reason.trim();
        await linkedProv.save();

        await ProviderService.updateMany(
          { providerId: linkedProv._id },
          {
            $set: {
              approvalStatus: 'REJECTED',
              publicationStatus: 'ARCHIVED',
              rejectionReason: reason.trim(),
            },
          }
        );
      }

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'APPLICATION_REJECTED',
        targetType: 'LEAD',
        targetId: String(application._id),
        details: { businessName: application.businessName, reason: reason.trim() },
        req,
      });

      return successResponse(res, application, 'Application rejected successfully');
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/providers
   */
  async getProviders(req, res, next) {
    try {
      const { verificationStatus, publicationStatus, search, deleted } = req.query;
      const query = {};

      if (publicationStatus === 'DELETED' || deleted === 'only') {
        query.isDeleted = true;
      } else {
        query.isDeleted = { $ne: true };
        if (verificationStatus && verificationStatus !== 'all') {
          query.verificationStatus = verificationStatus;
        }
        if (publicationStatus && publicationStatus !== 'all') {
          query.publicationStatus = publicationStatus;
        }
      }

      if (search && typeof search === 'string' && search.trim()) {
        const clean = escapeRegex(search.trim().slice(0, 100));
        query.$or = [
          { businessName: { $regex: clean, $options: 'i' } },
          { providerName: { $regex: clean, $options: 'i' } },
          { city: { $regex: clean, $options: 'i' } },
          { contactNumber: { $regex: clean, $options: 'i' } },
        ];
      }

      const providers = await Provider.find(query).sort({ createdAt: -1 }).lean();
      return successResponse(res, providers);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * GET /api/v1/admin/providers/:id
   */
  async getProviderById(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'provider');
      const provider = await Provider.findById(cleanId).lean();
      if (!provider) {
        return errorResponse(res, 'Provider not found', 404);
      }
      return successResponse(res, provider);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/admin/providers/:id
   */
  async updateProvider(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'provider');
      const provider = await Provider.findById(cleanId);
      if (!provider) {
        return errorResponse(res, 'Provider not found', 404);
      }
      if (provider.isDeleted) {
        return errorResponse(res, 'Cannot update a deleted provider. Restore it first.', 409);
      }

      const allowedUpdates = [
        'businessName',
        'providerName',
        'description',
        'category',
        'categorySlug',
        'subcategory',
        'subcategorySlug',
        'services',
        'keywords',
        'contactNumber',
        'email',
        'address',
        'city',
        'state',
        'pinCode',
        'serviceAreas',
        'website',
        'shopImage',
        'verificationStatus',
        'publicationStatus',
        'publicationConsent',
        'consentToDisplayPhone',
        'metaTitle',
        'metaDescription',
      ];

      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          if (key === 'keywords') {
            provider.keywords = normalizeKeywords(req.body.keywords);
          } else {
            provider[key] = req.body[key];
          }
        }
      }

      if (req.body.subcategory !== undefined && req.body.subcategorySlug === undefined) {
        provider.subcategorySlug = req.body.subcategory
          ? createCategorySlug(req.body.subcategory)
          : '';
      }

      if (req.body.publicationStatus === 'PUBLISHED') {
        if (provider.verificationStatus !== 'VERIFIED') {
          return errorResponse(res, 'Provider must be VERIFIED before publishing', 400);
        }
        if (!provider.publishedAt) {
          provider.publishedAt = new Date();
        }
      }

      await provider.save();

      if (provider.verificationStatus === 'VERIFIED') {
        const svcUpdate = { approvalStatus: 'APPROVED', rejectionReason: '' };
        if (provider.publicationStatus === 'PUBLISHED') {
          svcUpdate.publicationStatus = 'PUBLISHED';
        }
        await ProviderService.updateMany(
          { providerId: provider._id, approvalStatus: 'PENDING' },
          { $set: svcUpdate }
        );
      }

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'PROVIDER_UPDATED',
        targetType: 'PROVIDER',
        targetId: String(provider._id),
        details: {
          slug: provider.slug,
          verificationStatus: provider.verificationStatus,
          publicationStatus: provider.publicationStatus,
        },
        req,
      });

      return successResponse(res, provider, 'Provider profile updated successfully');
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/enquiries
   * List customer quote & contact enquiries
   */
  async getEnquiries(req, res, next) {
    try {
      const { status, type = 'all', search, deleted } = req.query;
      const query = {};

      if (type !== 'all') {
        query.type = type;
      } else {
        query.type = { $in: ['enquiry', 'contact'] };
      }

      if (status === 'deleted' || deleted === 'only') {
        query.isDeleted = true;
      } else {
        query.isDeleted = { $ne: true };
        if (status && status !== 'all') {
          query.status = status;
        }
      }

      if (search && typeof search === 'string' && search.trim()) {
        const clean = escapeRegex(search.trim().slice(0, 100));
        query.$or = [
          { name: { $regex: clean, $options: 'i' } },
          { phone: { $regex: clean, $options: 'i' } },
          { email: { $regex: clean, $options: 'i' } },
          { referenceId: { $regex: clean, $options: 'i' } },
          { category: { $regex: clean, $options: 'i' } },
          { service: { $regex: clean, $options: 'i' } },
        ];
      }

      const enquiries = await Lead.find(query).sort({ createdAt: -1 }).lean();
      return successResponse(res, enquiries);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/admin/enquiries/:id/status
   */
  async updateEnquiryStatus(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'enquiry');
      const { status, assignedProviderId } = req.body;
      const validStatuses = ['new', 'contacted', 'qualified', 'assigned', 'converted', 'closed', 'rejected'];

      if (!status || !validStatuses.includes(status)) {
        return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

      const enquiry = await Lead.findById(cleanId);
      if (!enquiry) {
        return errorResponse(res, 'Enquiry not found', 404);
      }
      if (enquiry.isDeleted) {
        return errorResponse(res, 'Cannot update status of a deleted enquiry. Restore it first.', 409);
      }

      enquiry.status = status;
      if (assignedProviderId !== undefined) {
        enquiry.assignedProviderId = assignedProviderId || null;
      }
      await enquiry.save();

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'ENQUIRY_STATUS_UPDATED',
        targetType: 'LEAD',
        targetId: String(enquiry._id),
        details: { referenceId: enquiry.referenceId, status },
        req,
      });

      return successResponse(res, enquiry, 'Enquiry status updated successfully');
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  // ── DELETION, RESTORATION, ANONYMIZATION & CLEANUP ENDPOINTS ────────────────

  async getProviderDeletionImpact(req, res, next) {
    try {
      const report = await deletionService.getProviderDeletionImpact(req.params.id);
      return successResponse(res, report);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async softDeleteProvider(req, res, next) {
    try {
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      const result = await deletionService.softDeleteProvider(
        req.params.id,
        req.admin?.email || 'admin',
        reason
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'PROVIDER_SOFT_DELETED',
        targetType: 'PROVIDER',
        targetId: String(result.provider._id),
        details: {
          businessName: result.provider.businessName,
          slug: result.provider.slug,
          deletionMode: 'SOFT_DELETE',
          affectedServices: result.affectedServices,
          affectedAccounts: result.affectedAccounts,
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(
        res,
        result,
        `Provider "${result.provider.businessName}" moved to trash and authentication suspended.`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async restoreProvider(req, res, next) {
    try {
      const result = await deletionService.restoreProvider(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'PROVIDER_RESTORED',
        targetType: 'PROVIDER',
        targetId: String(result.provider._id),
        details: {
          businessName: result.provider.businessName,
          slug: result.provider.slug,
          restoredServices: result.restoredServices,
          restoredAccounts: result.restoredAccounts,
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(
        res,
        result,
        `Provider "${result.provider.businessName}" restored as DRAFT.`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async permanentDeleteProvider(req, res, next) {
    try {
      if (!isPermanentDeleteConfirmed(req)) {
        return errorResponse(
          res,
          'Explicit confirmation (confirmPermanent: true) is required for permanent provider deletion.',
          400
        );
      }

      const result = await deletionService.permanentDeleteProvider(req.params.id, {
        adminEmail: req.admin?.email || 'admin',
        confirmBusinessName: req.body?.confirmBusinessName || '',
      });

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'PROVIDER_PERMANENTLY_DELETED',
        targetType: 'PROVIDER',
        targetId: result.deletedId,
        details: {
          businessName: result.businessName,
          slug: result.slug,
          deletionMode: 'PERMANENT_DELETE',
          deletedServicesCount: result.deletedServicesCount,
          unlinkedEnquiriesCount: result.unlinkedEnquiriesCount,
          deletedAccountsCount: result.deletedAccountsCount,
          mediaCleanupStatus: result.mediaCleanup?.status,
          result: result.mediaCleanup?.status === 'PARTIAL_FAILURE' ? 'PARTIAL_FAILURE' : 'SUCCESS',
        },
        req,
      });

      const msg =
        result.mediaCleanup?.status === 'PARTIAL_FAILURE'
          ? `Provider "${result.businessName}" deleted from database, but ${result.mediaCleanup.failedAssets.length} media file(s) failed cleanup and were queued for retry.`
          : `Provider "${result.businessName}" and owned data permanently deleted.`;

      return successResponse(res, result, msg);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async softDeleteEnquiry(req, res, next) {
    try {
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      const enquiry = await deletionService.softDeleteEnquiry(
        req.params.id,
        req.admin?.email || 'admin',
        reason
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'ENQUIRY_SOFT_DELETED',
        targetType: 'LEAD',
        targetId: String(enquiry._id),
        details: {
          referenceId: enquiry.referenceId,
          type: enquiry.type,
          deletionMode: 'SOFT_DELETE',
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(res, enquiry, `Enquiry ${enquiry.referenceId} moved to trash.`);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async restoreEnquiry(req, res, next) {
    try {
      const enquiry = await deletionService.restoreEnquiry(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'ENQUIRY_RESTORED',
        targetType: 'LEAD',
        targetId: String(enquiry._id),
        details: {
          referenceId: enquiry.referenceId,
          type: enquiry.type,
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(res, enquiry, `Enquiry ${enquiry.referenceId} restored.`);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async anonymizeEnquiry(req, res, next) {
    try {
      const enquiry = await deletionService.anonymizeEnquiryCustomerData(
        req.params.id,
        req.admin?.email || 'admin'
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'ENQUIRY_CUSTOMER_ANONYMIZED',
        targetType: 'LEAD',
        targetId: String(enquiry._id),
        details: {
          referenceId: enquiry.referenceId,
          type: enquiry.type,
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(
        res,
        enquiry,
        `Customer personal information anonymized on ${enquiry.referenceId}.`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async permanentDeleteEnquiry(req, res, next) {
    try {
      if (!isPermanentDeleteConfirmed(req)) {
        return errorResponse(
          res,
          'Explicit confirmation (confirmPermanent: true) is required for permanent enquiry deletion.',
          400
        );
      }

      const result = await deletionService.permanentDeleteEnquiry(req.params.id, {
        adminEmail: req.admin?.email || 'admin',
      });

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'ENQUIRY_PERMANENTLY_DELETED',
        targetType: 'LEAD',
        targetId: result.deletedId,
        details: {
          referenceId: result.referenceId,
          type: result.type,
          deletionMode: 'PERMANENT_DELETE',
          mediaCleanupStatus: result.mediaCleanup?.status,
          result: result.mediaCleanup?.status === 'PARTIAL_FAILURE' ? 'PARTIAL_FAILURE' : 'SUCCESS',
        },
        req,
      });

      return successResponse(res, result, `Enquiry ${result.referenceId} permanently deleted.`);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async softDeleteApplication(req, res, next) {
    try {
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      const application = await deletionService.softDeleteApplication(
        req.params.id,
        req.admin?.email || 'admin',
        reason
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'APPLICATION_SOFT_DELETED',
        targetType: 'LEAD',
        targetId: String(application._id),
        details: {
          referenceId: application.referenceId,
          businessName: application.businessName,
          deletionMode: 'SOFT_DELETE',
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(
        res,
        application,
        `Partner application ${application.referenceId} moved to trash.`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async restoreApplication(req, res, next) {
    try {
      const application = await deletionService.restoreApplication(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'APPLICATION_RESTORED',
        targetType: 'LEAD',
        targetId: String(application._id),
        details: {
          referenceId: application.referenceId,
          businessName: application.businessName,
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(
        res,
        application,
        `Partner application ${application.referenceId} restored.`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async permanentDeleteApplication(req, res, next) {
    try {
      if (!isPermanentDeleteConfirmed(req)) {
        return errorResponse(
          res,
          'Explicit confirmation (confirmPermanent: true) is required for permanent application deletion.',
          400
        );
      }

      const result = await deletionService.permanentDeleteApplication(req.params.id, {
        adminEmail: req.admin?.email || 'admin',
      });

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'APPLICATION_PERMANENTLY_DELETED',
        targetType: 'LEAD',
        targetId: result.deletedId,
        details: {
          referenceId: result.referenceId,
          businessName: result.businessName,
          unlinkedProviders: result.unlinkedProviders,
          deletionMode: 'PERMANENT_DELETE',
          mediaCleanupStatus: result.mediaCleanup?.status,
          result: result.mediaCleanup?.status === 'PARTIAL_FAILURE' ? 'PARTIAL_FAILURE' : 'SUCCESS',
        },
        req,
      });

      const msg =
        result.mediaCleanup?.status === 'PARTIAL_FAILURE'
          ? `Application ${result.referenceId} deleted, but media cleanup encountered a partial failure and was queued for retry.`
          : `Partner application ${result.referenceId} permanently deleted.`;

      return successResponse(res, result, msg);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async listMediaCleanupTasks(req, res, next) {
    try {
      const { status = 'PENDING' } = req.query;
      const tasks = await deletionService.listMediaCleanupTasks(status);
      return successResponse(res, tasks);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  async retryMediaCleanupTask(req, res, next) {
    try {
      const task = await deletionService.retryMediaCleanupTask(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'MEDIA_CLEANUP_RETRIED',
        targetType: 'MEDIA_CLEANUP',
        targetId: String(task._id),
        details: {
          publicId: task.publicId,
          provider: task.provider,
          status: task.status,
        },
        req,
      });

      return successResponse(
        res,
        task,
        task.status === 'COMPLETED'
          ? 'Media asset cleaned up successfully.'
          : `Media cleanup retry failed: ${task.lastError}`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * GET /api/v1/admin/activity-logs
   */
  async getActivityLogs(req, res, next) {
    try {
      const { limit = 50 } = req.query;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

      const logs = await ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .lean();

      return successResponse(res, logs);
    } catch (err) {
      next(err);
    }
  },
};

export default adminProviderController;
