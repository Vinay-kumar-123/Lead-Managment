import Provider from '../models/Provider.js';
import { escapeRegex } from '../services/categoryService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const providerController = {
  /**
   * GET /api/v1/providers
   * Public list of strictly VERIFIED and PUBLISHED providers
   */
  async getPublicProviders(req, res, next) {
    try {
      const { category, subcategory, location, search } = req.query;

      // Strict public visibility gate
      const query = {
        verificationStatus: 'VERIFIED',
        publicationStatus: 'PUBLISHED',
      };

      if (category && typeof category === 'string' && category.trim()) {
        query.categorySlug = category.toLowerCase().trim();
      }

      const andConditions = [];

      if (subcategory && typeof subcategory === 'string' && subcategory.trim()) {
        const cleanSub = escapeRegex(subcategory.trim().slice(0, 100));
        andConditions.push({
          $or: [
            { services: { $regex: cleanSub, $options: 'i' } },
            { description: { $regex: cleanSub, $options: 'i' } },
          ],
        });
      }

      if (location && typeof location === 'string' && location.trim()) {
        const cleanLoc = escapeRegex(location.trim().slice(0, 100));
        andConditions.push({
          $or: [
            { city: { $regex: cleanLoc, $options: 'i' } },
            { state: { $regex: cleanLoc, $options: 'i' } },
            { serviceAreas: { $regex: cleanLoc, $options: 'i' } },
          ],
        });
      }

      if (search && typeof search === 'string' && search.trim()) {
        const cleanSearch = escapeRegex(search.trim().slice(0, 100));
        andConditions.push({
          $or: [
            { businessName: { $regex: cleanSearch, $options: 'i' } },
            { description: { $regex: cleanSearch, $options: 'i' } },
            { services: { $regex: cleanSearch, $options: 'i' } },
            { category: { $regex: cleanSearch, $options: 'i' } },
          ],
        });
      }

      if (andConditions.length === 1) {
        query.$or = andConditions[0].$or;
      } else if (andConditions.length > 1) {
        query.$and = andConditions;
      }

      const providers = await Provider.find(query).sort({ publishedAt: -1 }).lean();

      // Mask/omit phone number if consentToDisplayPhone is explicitly false
      const sanitized = providers.map((p) => {
        if (!p.consentToDisplayPhone) {
          return { ...p, contactNumber: null };
        }
        return p;
      });

      return successResponse(res, {
        providers: sanitized,
        total: sanitized.length,
      });
    } catch (err) {
      logger.error('Public provider fetch error', { error: err.message });
      next(err);
    }
  },

  /**
   * GET /api/v1/providers/:slug
   * Public single provider profile
   */
  async getPublicProviderBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const cleanSlug = String(slug || '').toLowerCase().trim();

      const provider = await Provider.findOne({
        slug: cleanSlug,
        verificationStatus: 'VERIFIED',
        publicationStatus: 'PUBLISHED',
      }).lean();

      if (!provider) {
        return errorResponse(res, `Provider profile with slug "${cleanSlug}" was not found or is unpublished.`, 404);
      }

      if (!provider.consentToDisplayPhone) {
        provider.contactNumber = null;
      }

      return successResponse(res, provider);
    } catch (err) {
      next(err);
    }
  },
};

export default providerController;
