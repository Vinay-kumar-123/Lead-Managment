import api from './api.js';
import { categories as seedCategories } from '../data/categories.js';

let cachedPublicCategories = null;
let inflightPublicRequest = null;
const listeners = new Set();

function notifyListeners(categories) {
  for (const listener of listeners) {
    try {
      listener(categories);
    } catch {
      // Ignore individual subscriber errors
    }
  }
}

function normalizeMainCategories(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return seedCategories;
  }

  return rawList.map((cat) => {
    const seedMatch = seedCategories.find((s) => s.slug === cat.slug) || {};
    const rawSubs = Array.isArray(cat.subcategories)
      ? cat.subcategories
      : Array.isArray(seedMatch.subcategories)
      ? seedMatch.subcategories
      : [];

    const activeSubs = rawSubs
      .filter((sub) => sub && sub.isActive !== false)
      .map((sub) => ({
        ...sub,
        id: sub.id || sub.slug || sub._id,
        slug: sub.slug || sub.id,
        name: sub.name,
        description: sub.description || '',
        parentSlug: sub.parentSlug || cat.slug,
        parentName: sub.parentName || cat.name,
        isActive: sub.isActive !== false,
      }));

    return {
      ...seedMatch,
      ...cat,
      id: cat.id || cat.slug,
      slug: cat.slug || cat.id,
      subcategories: activeSubs,
      subcategoryCount:
        typeof cat.subcategoryCount === 'number' ? cat.subcategoryCount : activeSubs.length,
    };
  });
}

export const categoryService = {
  /**
   * Returns immediate synchronous categories (cached or seed)
   */
  getCachedCategories() {
    return cachedPublicCategories || seedCategories;
  },

  /**
   * Subscribes a component to live category updates
   */
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Invalidates cache and triggers a fresh fetch
   */
  invalidateCache() {
    cachedPublicCategories = null;
    inflightPublicRequest = null;
  },

  /**
   * Public: Fetch the 5 canonical main categories with their active subcategories
   */
  async getPublicCategories({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedPublicCategories) {
      return cachedPublicCategories;
    }

    if (!forceRefresh && inflightPublicRequest) {
      return inflightPublicRequest;
    }

    inflightPublicRequest = api
      .get('/categories')
      .then((res) => {
        const list = res?.data?.categories || res?.data;
        if (res?.success && Array.isArray(list) && list.length > 0) {
          const normalized = normalizeMainCategories(list);
          cachedPublicCategories = normalized;
          notifyListeners(normalized);
          return normalized;
        }
        return cachedPublicCategories || seedCategories;
      })
      .catch(() => {
        return cachedPublicCategories || seedCategories;
      })
      .finally(() => {
        inflightPublicRequest = null;
      });

    return inflightPublicRequest;
  },

  /**
   * Public: Fetch a single category by slug
   */
  async getPublicCategoryBySlug(slug) {
    const cleanSlug = String(slug || '').toLowerCase().trim();
    const list = await this.getPublicCategories();
    const matched = list.find((c) => c.slug === cleanSlug);
    if (matched) return matched;

    try {
      const res = await api.get(`/categories/${encodeURIComponent(cleanSlug)}`);
      if (res?.success && res?.data) {
        return res.data;
      }
    } catch {
      // Fallback to seed lookup
    }

    return seedCategories.find((c) => c.slug === cleanSlug) || null;
  },

  /**
   * Admin: Fetch all 5 main categories, filtered subcategories, and summary counts
   */
  async getAdminCategories({ parentCategory = '', status = 'all', search = '' } = {}) {
    const params = new URLSearchParams();
    if (parentCategory && parentCategory !== 'all') params.set('parentCategory', parentCategory);
    if (status && status !== 'all') params.set('status', status);
    if (search && search.trim()) params.set('search', search.trim());

    const qs = params.toString();
    return api.get(`/admin/categories${qs ? `?${qs}` : ''}`);
  },

  /**
   * Admin: Create a new subcategory under one of the 5 established main categories
   */
  async createSubcategory(payload) {
    const res = await api.post('/admin/categories', payload);
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },

  /**
   * Admin: Update an existing subcategory
   */
  async updateSubcategory(id, payload) {
    const res = await api.put(`/admin/categories/${encodeURIComponent(id)}`, payload);
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },

  /**
   * Admin: Activate or deactivate a subcategory
   */
  async updateSubcategoryStatus(id, isActive) {
    const res = await api.patch(`/admin/categories/${encodeURIComponent(id)}/status`, {
      isActive: Boolean(isActive),
    });
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },

  /**
   * Admin: Inspect subcategory dependencies before deletion
   */
  async getSubcategoryDependencies(id) {
    return api.get(`/admin/categories/${encodeURIComponent(id)}/dependencies`);
  },

  /**
   * Admin: Soft-delete (move to trash) a subcategory
   */
  async softDeleteSubcategory(id, reason = '') {
    const res = await api.delete(`/admin/categories/${encodeURIComponent(id)}`, {
      data: { reason },
    });
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },

  /**
   * Admin: Restore a soft-deleted subcategory (restored as inactive)
   */
  async restoreSubcategory(id) {
    const res = await api.post(`/admin/categories/${encodeURIComponent(id)}/restore`, {});
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },

  /**
   * Admin: Reassign dependent providers, services, and blogs to another active subcategory
   */
  async reassignSubcategoryDependencies(id, targetSubcategoryId) {
    return api.post(`/admin/categories/${encodeURIComponent(id)}/reassign`, {
      targetSubcategoryId,
    });
  },

  /**
   * Super Admin: Permanently delete an unused subcategory
   */
  async permanentDeleteSubcategory(id) {
    const res = await api.delete(`/admin/categories/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true },
    });
    if (res?.success) {
      this.invalidateCache();
      this.getPublicCategories({ forceRefresh: true }).catch(() => {});
    }
    return res;
  },
};

export default categoryService;
