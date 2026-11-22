import api from './api.js';
import {
  providers as seedProviders,
  getProviderBySlug as getSeedProviderBySlug,
} from '../data/providers.js';

export function isDevSeedFallbackEnabled(envOverride = null) {
  const env = envOverride || (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return Boolean(env.DEV && String(env.VITE_ENABLE_DEV_SEED_FALLBACK).toLowerCase() === 'true');
}

function querySeedProviders({ categorySlug = '', subcategory = '', location = '', search = '' } = {}) {
  let list = [...seedProviders];

  if (categorySlug) {
    list = list.filter((p) => p.categorySlug === categorySlug);
  }
  if (subcategory) {
    const subLower = subcategory.toLowerCase();
    list = list.filter(
      (p) =>
        (p.mainService && p.mainService.toLowerCase().includes(subLower)) ||
        (Array.isArray(p.servicesOffered) &&
          p.servicesOffered.some((s) => s.toLowerCase().includes(subLower)))
    );
  }
  if (location) {
    const locLower = location.toLowerCase();
    list = list.filter(
      (p) =>
        (p.location && p.location.toLowerCase().includes(locLower)) ||
        (Array.isArray(p.serviceAreas) &&
          p.serviceAreas.some((area) => area.toLowerCase().includes(locLower)))
    );
  }
  if (search) {
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const haystack = [
        p.businessName,
        p.mainService,
        p.categoryName,
        p.description,
        ...(Array.isArray(p.servicesOffered) ? p.servicesOffered : []),
        ...(Array.isArray(p.services) ? p.services : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  return {
    data: list,
    total: list.length,
    page: 1,
    limit: list.length || 12,
    totalPages: 1,
    sort: 'relevance',
    meta: null,
    isFallback: true,
  };
}

/**
 * Provider Service Layer
 * Queries backend REST endpoints (/api/v1/providers) for live verified & published providers.
 * - A successful backend response with 0 results ALWAYS returns an empty list (never substitutes seed data).
 * - Static seed fallback only activates in explicitly configured dev mode when the API is unreachable.
 */
export const providerService = {
  async getProviders({
    categorySlug = '',
    subcategory = '',
    location = '',
    search = '',
    page = 1,
    limit = 12,
    sort = '',
    strictLocation = false,
  } = {}) {
    try {
      const params = new URLSearchParams();
      if (categorySlug) params.set('category', categorySlug);
      if (subcategory) params.set('subcategory', subcategory);
      if (location) params.set('location', location);
      if (search) params.set('search', search);
      if (page && page > 1) params.set('page', String(page));
      if (limit && limit !== 12) params.set('limit', String(limit));
      if (sort) params.set('sort', sort);
      if (strictLocation) params.set('strictLocation', 'true');

      const res = await api.get(`/providers?${params.toString()}`);
      if (res && res.success && res.data && Array.isArray(res.data.providers)) {
        return {
          data: res.data.providers,
          total: typeof res.data.total === 'number' ? res.data.total : res.data.providers.length,
          page: res.data.page || 1,
          limit: res.data.limit || limit,
          totalPages: res.data.totalPages || 1,
          sort: res.data.sort || sort || 'relevance',
          meta: res.data.meta || null,
          isFallback: false,
        };
      }
      throw new Error('Unexpected response format from providers endpoint.');
    } catch (err) {
      const isNetworkUnavailable = !err?.status || err.status === 0 || err.status >= 500;
      if (isNetworkUnavailable && isDevSeedFallbackEnabled()) {
        return querySeedProviders({ categorySlug, subcategory, location, search });
      }
      throw err;
    }
  },

  async getSuggestions(q, type = 'all') {
    const clean = String(q || '').trim();
    if (clean.length < 2) {
      return { services: [], cities: [], providers: [] };
    }
    try {
      const params = new URLSearchParams({ q: clean, type });
      const res = await api.get(`/providers/suggestions?${params.toString()}`);
      if (res && res.success && res.data) {
        return res.data;
      }
    } catch {
      // Suggestions are progressive enhancement; degrade quietly
    }
    return { services: [], cities: [], providers: [] };
  },

  async getProviderBySlug(slug) {
    const cleanSlug = String(slug || '').toLowerCase().trim();

    try {
      const res = await api.get(`/providers/${cleanSlug}`);
      if (res && res.success && res.data) {
        return res.data;
      }
    } catch (err) {
      const isNetworkUnavailable = !err?.status || err.status === 0 || err.status >= 500;
      if (isNetworkUnavailable && isDevSeedFallbackEnabled()) {
        const seed = getSeedProviderBySlug(cleanSlug);
        if (seed) return seed;
      }
      throw err;
    }

    throw new Error(`Provider profile for slug "${cleanSlug}" not found.`);
  },

  async getProvidersByCategory(categorySlug) {
    try {
      const res = await this.getProviders({ categorySlug });
      return res.data || [];
    } catch {
      return [];
    }
  },
};

export default providerService;
