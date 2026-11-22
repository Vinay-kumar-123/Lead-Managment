import ProviderService from '../models/ProviderService.js';
import Provider from '../models/Provider.js';
import deletionService, { assertValidObjectId } from '../services/deletionService.js';
import { escapeRegex } from '../services/categoryService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { logAdminActivity } from '../services/activityLogger.js';

function handleServiceControllerError(err, res, next) {
  if (err && err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.details || null);
  }
  if (err && err.name === 'CastError') {
    return errorResponse(res, 'Invalid service identifier format.', 400);
  }
  return next(err);
}

export const adminServiceController = {
  /**
   * GET /api/v1/admin/services
   */
  async getServices(req, res, next) {
    try {
      const {
        status = 'all',
        approvalStatus,
        publicationStatus,
        providerId,
        categorySlug,
        search,
        deleted,
      } = req.query;

      const query = {};
      if (status === 'deleted' || deleted === 'only') {
        query.isDeleted = true;
      } else {
        query.isDeleted = { $ne: true };
        if (approvalStatus && approvalStatus !== 'all') {
          query.approvalStatus = approvalStatus;
        }
        if (publicationStatus && publicationStatus !== 'all') {
          query.publicationStatus = publicationStatus;
        }
        if (status && status !== 'all') {
          const upper = String(status).toUpperCase();
          if (['PENDING', 'APPROVED', 'REJECTED'].includes(upper)) {
            query.approvalStatus = upper;
          } else if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(upper)) {
            query.publicationStatus = upper;
          } else if (status === 'inactive') {
            query.isActive = false;
          }
        }
      }

      if (providerId) {
        query.providerId = assertValidObjectId(providerId, 'provider');
      }
      if (categorySlug && categorySlug !== 'all') {
        query.categorySlug = String(categorySlug).toLowerCase().trim();
      }
      if (search && typeof search === 'string' && search.trim()) {
        const clean = escapeRegex(search.trim().slice(0, 100));
        query.$or = [
          { title: { $regex: clean, $options: 'i' } },
          { category: { $regex: clean, $options: 'i' } },
          { subcategory: { $regex: clean, $options: 'i' } },
          { description: { $regex: clean, $options: 'i' } },
        ];
      }

      const services = await ProviderService.find(query)
        .populate('providerId', 'businessName slug city verificationStatus publicationStatus isDeleted')
        .sort({ createdAt: -1 })
        .lean();

      const formatted = services.map((s) => ({
        ...s,
        provider: s.providerId && typeof s.providerId === 'object' ? s.providerId : null,
        providerId:
          s.providerId && typeof s.providerId === 'object'
            ? String(s.providerId._id)
            : String(s.providerId || ''),
      }));

      return successResponse(res, formatted);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * GET /api/v1/admin/services/:id
   */
  async getServiceById(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'service');
      const svc = await ProviderService.findById(cleanId)
        .populate('providerId', 'businessName slug city verificationStatus publicationStatus')
        .lean();
      if (!svc) {
        return errorResponse(res, 'Service or package not found', 404);
      }
      return successResponse(res, svc);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * PATCH /api/v1/admin/services/:id/approval
   */
  async updateServiceApproval(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'service');
      const { approvalStatus, rejectionReason = '', publishIfVerified = false } = req.body || {};

      if (!['APPROVED', 'REJECTED', 'PENDING'].includes(approvalStatus)) {
        return errorResponse(res, 'approvalStatus must be APPROVED, REJECTED, or PENDING.', 400);
      }

      const svc = await ProviderService.findById(cleanId);
      if (!svc) {
        return errorResponse(res, 'Service or package not found', 404);
      }
      if (svc.isDeleted) {
        return errorResponse(res, 'Cannot update a deleted service. Restore it first.', 409);
      }

      svc.approvalStatus = approvalStatus;
      if (approvalStatus === 'REJECTED') {
        svc.rejectionReason = String(rejectionReason || '').trim() || 'Rejected by Dealsathi operations';
        svc.publicationStatus = 'DRAFT';
      } else if (approvalStatus === 'APPROVED') {
        svc.rejectionReason = '';
        if (publishIfVerified) {
          const parentProvider = await Provider.findById(svc.providerId).lean();
          if (parentProvider && parentProvider.verificationStatus === 'VERIFIED' && !parentProvider.isDeleted) {
            svc.publicationStatus = 'PUBLISHED';
          }
        }
      }

      await svc.save();

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: `SERVICE_${approvalStatus}`,
        targetType: 'PROVIDER_SERVICE',
        targetId: String(svc._id),
        details: { title: svc.title, approvalStatus: svc.approvalStatus },
        req,
      });

      return successResponse(res, svc, `Service marked as ${approvalStatus}.`);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * PATCH /api/v1/admin/services/:id/status
   */
  async updateServiceStatus(req, res, next) {
    try {
      const cleanId = assertValidObjectId(req.params.id, 'service');
      const { isActive, publicationStatus } = req.body || {};

      const svc = await ProviderService.findById(cleanId);
      if (!svc) {
        return errorResponse(res, 'Service or package not found', 404);
      }
      if (svc.isDeleted) {
        return errorResponse(res, 'Cannot modify a deleted service. Restore it first.', 409);
      }

      if (isActive !== undefined) {
        svc.isActive = Boolean(isActive);
      }
      if (publicationStatus !== undefined) {
        if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(publicationStatus)) {
          return errorResponse(res, 'Invalid publicationStatus.', 400);
        }
        if (publicationStatus === 'PUBLISHED' && svc.approvalStatus !== 'APPROVED') {
          return errorResponse(res, 'Service must be APPROVED before publishing.', 400);
        }
        svc.publicationStatus = publicationStatus;
      }

      await svc.save();

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'SERVICE_STATUS_UPDATED',
        targetType: 'PROVIDER_SERVICE',
        targetId: String(svc._id),
        details: {
          title: svc.title,
          isActive: svc.isActive,
          publicationStatus: svc.publicationStatus,
        },
        req,
      });

      return successResponse(res, svc, 'Service status updated successfully.');
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * DELETE /api/v1/admin/services/:id
   * Soft-deletes a service/package without harming its parent Provider profile.
   */
  async softDeleteService(req, res, next) {
    try {
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      const svc = await deletionService.softDeleteService(
        req.params.id,
        req.admin?.email || 'admin',
        reason
      );

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'SERVICE_SOFT_DELETED',
        targetType: 'PROVIDER_SERVICE',
        targetId: String(svc._id),
        details: {
          title: svc.title,
          providerId: String(svc.providerId),
          deletionMode: 'SOFT_DELETE',
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(res, svc, `Service "${svc.title}" moved to trash.`);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * POST /api/v1/admin/services/:id/restore
   */
  async restoreService(req, res, next) {
    try {
      const svc = await deletionService.restoreService(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'SERVICE_RESTORED',
        targetType: 'PROVIDER_SERVICE',
        targetId: String(svc._id),
        details: { title: svc.title, result: 'SUCCESS' },
        req,
      });

      return successResponse(res, svc, `Service "${svc.title}" restored as DRAFT.`);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },

  /**
   * DELETE /api/v1/admin/services/:id/permanent
   */
  async permanentDeleteService(req, res, next) {
    try {
      const confirmed =
        req.body?.confirmPermanent === true || req.query?.confirm === 'true';
      if (!confirmed) {
        return errorResponse(
          res,
          'Explicit confirmation (confirmPermanent: true) is required for permanent service deletion.',
          400
        );
      }

      const result = await deletionService.permanentDeleteService(req.params.id);

      await logAdminActivity({
        adminEmail: req.admin?.email,
        action: 'SERVICE_PERMANENTLY_DELETED',
        targetType: 'PROVIDER_SERVICE',
        targetId: result.deletedId,
        details: {
          title: result.title,
          providerId: result.providerId,
          deletionMode: 'PERMANENT_DELETE',
          result: 'SUCCESS',
        },
        req,
      });

      return successResponse(res, result, `Service "${result.title}" permanently deleted.`);
    } catch (err) {
      return handleServiceControllerError(err, res, next);
    }
  },
};

export default adminServiceController;
