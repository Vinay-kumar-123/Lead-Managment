import categoryService from '../services/categoryService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { logAdminActivity } from '../services/activityLogger.js';
import logger from '../utils/logger.js';

function handleControllerError(err, res, next) {
  if (err && err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.errors || null);
  }
  if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
    return errorResponse(res, 'A subcategory with this name or slug already exists.', 409);
  }
  if (err && err.name === 'CastError') {
    return errorResponse(res, 'Invalid category identifier format.', 400);
  }
  if (err && err.name === 'ValidationError') {
    return errorResponse(res, 'Category validation failed. Please check your input fields.', 400);
  }
  logger.error('Admin category operation error', { error: err?.message });
  return next(err);
}

export const adminCategoryController = {
  /**
   * GET /api/v1/admin/categories
   * Lists the 5 main categories (with subcategory counts) and all/filtered subcategories.
   */
  async getCategories(req, res, next) {
    try {
      const { parentCategory, parentSlug, status = 'all', search = '' } = req.query;
      const result = await categoryService.getAdminCategories({
        parentCategory: parentCategory || parentSlug || '',
        status,
        search,
      });
      return successResponse(res, result);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * GET /api/v1/admin/categories/:id
   * Retrieves a single main category or subcategory by ID or slug.
   */
  async getCategoryById(req, res, next) {
    try {
      const category = await categoryService.getAdminCategoryById(req.params.id);
      return successResponse(res, category);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * POST /api/v1/admin/categories
   * Creates a new subcategory under one of the 5 established main categories.
   */
  async createSubcategory(req, res, next) {
    try {
      const created = await categoryService.createSubcategory(req.body);

      await logAdminActivity({
        adminEmail: req.admin?.email || 'admin',
        action: 'CATEGORY_CREATED',
        targetType: 'CATEGORY',
        targetId: String(created._id),
        details: {
          name: created.name,
          slug: created.slug,
          parentSlug: created.parentSlug,
          parentName: created.parentName,
          isActive: created.isActive,
        },
        req,
      });

      return successResponse(res, created, 'Subcategory created successfully', 201);
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/admin/categories/:id
   * Updates an existing subcategory.
   */
  async updateSubcategory(req, res, next) {
    try {
      const updated = await categoryService.updateSubcategory(req.params.id, req.body);

      await logAdminActivity({
        adminEmail: req.admin?.email || 'admin',
        action: 'CATEGORY_UPDATED',
        targetType: 'CATEGORY',
        targetId: String(updated._id),
        details: {
          name: updated.name,
          slug: updated.slug,
          parentSlug: updated.parentSlug,
          parentName: updated.parentName,
          isActive: updated.isActive,
        },
        req,
      });

      return successResponse(res, updated, 'Subcategory updated successfully');
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },

  /**
   * PATCH /api/v1/admin/categories/:id/status
   * Activates or deactivates a subcategory.
   */
  async updateSubcategoryStatus(req, res, next) {
    try {
      const { isActive } = req.body || {};
      const updated = await categoryService.updateSubcategoryStatus(req.params.id, isActive);

      await logAdminActivity({
        adminEmail: req.admin?.email || 'admin',
        action: updated.isActive ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED',
        targetType: 'CATEGORY',
        targetId: String(updated._id),
        details: {
          name: updated.name,
          slug: updated.slug,
          parentSlug: updated.parentSlug,
          isActive: updated.isActive,
        },
        req,
      });

      return successResponse(
        res,
        updated,
        `Subcategory ${updated.isActive ? 'activated' : 'deactivated'} successfully`
      );
    } catch (err) {
      return handleControllerError(err, res, next);
    }
  },
};

export default adminCategoryController;
