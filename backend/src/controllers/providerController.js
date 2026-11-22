import Provider from '../models/Provider.js';
import {
  searchPublicProviders,
  getSearchSuggestions,
} from '../services/providerSearchService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const providerController = {
  /**
   * GET /api/v1/providers
   * Public relevance-ranked search across strictly VERIFIED and PUBLISHED providers
   * and their APPROVED and PUBLISHED services.
   */
  async getPublicProviders(req, res, next) {
    try {
      const {
        category,
        subcategory,
        location,
        city,
        search,
        service,
        q,
        page,
        limit,
        sort,
        strictLocation,
      } = req.query;

      const result = await searchPublicProviders({
        category,
        subcategory,
        location,
        city,
        search,
        service,
        q,
        page,
        limit,
        sort,
        strictLocation,
      });

      return successResponse(res, result);
    } catch (err) {
      logger.error('Public provider fetch error', { error: err.message });
      next(err);
    }
  },

  /**
   * GET /api/v1/providers/suggestions
   * Public autocomplete suggestions for services, subcategories, cities, and verified providers.
   */
  async getPublicSuggestions(req, res, next) {
    try {
      const { q = '', type = 'all' } = req.query;
      const suggestions = await getSearchSuggestions(q, { type });
      return successResponse(res, suggestions);
    } catch (err) {
      logger.error('Public search suggestions error', { error: err.message });
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
        isDeleted: { $ne: true },
        verificationStatus: 'VERIFIED',
        publicationStatus: 'PUBLISHED',
      }).lean();

      if (!provider) {
        return errorResponse(res, `Provider profile with slug "${cleanSlug}" was not found or is unpublished.`, 404);
      }

      delete provider.searchTokens;
      delete provider.locationTokens;

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
