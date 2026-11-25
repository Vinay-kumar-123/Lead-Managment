import api from './api.js';

export const blogService = {
  async getBlogs({ page = 1, limit = 9, category = '', search = '', signal } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (category) params.append('category', category);
    if (search) params.append('search', search);
    return api.get(`/blogs?${params.toString()}`, { retry: true, signal });
  },

  async getBlogBySlug(slug, { signal } = {}) {
    const cleanSlug = String(slug || '').trim();
    return api.get(`/blogs/${encodeURIComponent(cleanSlug)}`, { retry: true, signal });
  },

  async getBlogCategories({ signal } = {}) {
    return api.get('/blogs/categories', { retry: true, signal });
  },
};

export default blogService;
