import api from './api.js';

export const adminDeletionService = {
  // Enquiries & Customer Leads
  softDeleteEnquiry: (id, reason = '') =>
    api.delete(`/admin/enquiries/${encodeURIComponent(id)}`, { data: { reason } }),
  restoreEnquiry: (id) =>
    api.post(`/admin/enquiries/${encodeURIComponent(id)}/restore`, {}),
  anonymizeEnquiry: (id) =>
    api.post(`/admin/enquiries/${encodeURIComponent(id)}/anonymize`, {}),
  permanentDeleteEnquiry: (id) =>
    api.delete(`/admin/enquiries/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true },
    }),

  // Partner Applications
  softDeleteApplication: (id, reason = '') =>
    api.delete(`/admin/applications/${encodeURIComponent(id)}`, { data: { reason } }),
  restoreApplication: (id) =>
    api.post(`/admin/applications/${encodeURIComponent(id)}/restore`, {}),
  permanentDeleteApplication: (id) =>
    api.delete(`/admin/applications/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true },
    }),

  // Providers
  getProviderDeletionImpact: (id) =>
    api.get(`/admin/providers/${encodeURIComponent(id)}/deletion-impact`),
  softDeleteProvider: (id, reason = '') =>
    api.delete(`/admin/providers/${encodeURIComponent(id)}`, { data: { reason } }),
  restoreProvider: (id) =>
    api.post(`/admin/providers/${encodeURIComponent(id)}/restore`, {}),
  permanentDeleteProvider: (id, confirmBusinessName = '') =>
    api.delete(`/admin/providers/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true, confirmBusinessName },
    }),

  // Provider Services & Packages
  getServices: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') qs.set(k, String(v));
    });
    const str = qs.toString();
    return api.get(`/admin/services${str ? `?${str}` : ''}`);
  },
  updateServiceApproval: (id, payload) =>
    api.patch(`/admin/services/${encodeURIComponent(id)}/approval`, payload),
  updateServiceStatus: (id, payload) =>
    api.patch(`/admin/services/${encodeURIComponent(id)}/status`, payload),
  softDeleteService: (id, reason = '') =>
    api.delete(`/admin/services/${encodeURIComponent(id)}`, { data: { reason } }),
  restoreService: (id) =>
    api.post(`/admin/services/${encodeURIComponent(id)}/restore`, {}),
  permanentDeleteService: (id) =>
    api.delete(`/admin/services/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true },
    }),

  // Blogs
  softDeleteBlog: (id, reason = '') =>
    api.delete(`/admin/blogs/${encodeURIComponent(id)}`, { data: { reason } }),
  restoreBlog: (id) =>
    api.post(`/admin/blogs/${encodeURIComponent(id)}/restore`, {}),
  permanentDeleteBlog: (id) =>
    api.delete(`/admin/blogs/${encodeURIComponent(id)}/permanent`, {
      data: { confirmPermanent: true },
    }),

  // Media Cleanup Queue
  getMediaCleanupTasks: (status = 'PENDING') =>
    api.get(`/admin/media-cleanup?status=${encodeURIComponent(status)}`),
  retryMediaCleanupTask: (id) =>
    api.post(`/admin/media-cleanup/${encodeURIComponent(id)}/retry`, {}),
};

export default adminDeletionService;
