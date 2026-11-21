import categoryService from '../services/categoryService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const categoryController = {
  /**
   * GET /api/v1/categories
   * Returns all 5 active main marketplace categories with their active subcategories.
   */
  async getPublicCategories(req, res, next) {
    try {
      const categories = await categoryService.getPublicCategories();
      return successResponse(res, {
        categories,
        total: categories.length,
      });
    } catch (err) {
      if (err.statusCode) {
        return errorResponse(res, err.message, err.statusCode, err.errors);
      }
      logger.error('Failed to fetch public categories', { error: err.message });
      next(err);
    }
  },

  /**
   * GET /api/v1/categories/:slug
   * Returns a single main category (with its active subcategories) or an active subcategory by slug.
   */
  async getPublicCategoryBySlug(req, res, next) {
    try {
      const category = await categoryService.getPublicCategoryBySlug(req.params.slug);
      return successResponse(res, category);
    } catch (err) {
      if (err.statusCode) {
        return errorResponse(res, err.message, err.statusCode, err.errors);
      }
      logger.error('Failed to fetch public category by slug', { error: err.message });
      next(err);
    }
  },

  /**
   * GET /api/v1/categories/:slug/subcategories
   * Returns active subcategories belonging to a specific main category slug.
   */
  async getPublicSubcategoriesByMainSlug(req, res, next) {
    try {
      const category = await categoryService.getPublicCategoryBySlug(req.params.slug);
      if (!category.isMain) {
        return errorResponse(res, `Main category "${req.params.slug}" was not found.`, 404);
      }
      return successResponse(res, {
        parentCategory: {
          _id: category._id,
          id: category.id,
          slug: category.slug,
          name: category.name,
        },
        subcategories: category.subcategories || [],
        total: (category.subcategories || []).length,
      });
    } catch (err) {
      if (err.statusCode) {
        return errorResponse(res, err.message, err.statusCode, err.errors);
      }
      next(err);
    }
  },
};

export default categoryController;
