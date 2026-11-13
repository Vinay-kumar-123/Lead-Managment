import Provider from '../models/Provider.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const providerController = {
  /**
   * GET /api/v1/providers
   * Public list of strictly VERIFIED and PUBLISHED providers
   */
  async getPublicProviders(req, res, next) {
    try {
      const { category, location, search } = req.query;

      // Strict public visibility gate
      const query = {
        verificationStatus: 'VERIFIED',
        publicationStatus: 'PUBLISHED',
      };

      if (category) {
        query.categorySlug = category.toLowerCase().trim();
      }

      if (location) {
        const cleanLoc = location.trim();
        query.$or = [
          { city: { $regex: cleanLoc, $options: 'i' } },
          { state: { $regex: cleanLoc, $options: 'i' } },
          { serviceAreas: { $regex: cleanLoc, $options: 'i' } },
        ];
      }

      if (search) {
        const cleanSearch = search.trim();
        query.$or = [
          { businessName: { $regex: cleanSearch, $options: 'i' } },
          { description: { $regex: cleanSearch, $options: 'i' } },
          { services: { $regex: cleanSearch, $options: 'i' } },
        ];
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
