import api from './api.js';

export const providerPortalService = {
  async getGoogleAuthConfig() {
    return api.get('/provider/auth/config');
  },

  async authenticateWithGoogle(credential) {
    return api.post('/provider/auth/google', { credential });
  },

  async createDevGoogleToken({ email, name, sub } = {}) {
    return api.post('/provider/auth/dev-token', { email, name, sub });
  },

  async getMe() {
    return api.get('/provider/auth/me');
  },

  async logout() {
    return api.post('/provider/auth/logout', {});
  },

  async saveOnboardingDraft(draft) {
    return api.put('/provider/onboarding/draft', draft);
  },

  async completeOnboarding(payload) {
    return api.post('/provider/onboarding', payload);
  },

  async getDashboard() {
    return api.get('/provider/dashboard');
  },

  async updateProfile(payload) {
    return api.put('/provider/profile', payload);
  },

  async getServices({ status = 'all', search = '' } = {}) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search && search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    return api.get(`/provider/services${qs ? `?${qs}` : ''}`);
  },

  async createService(payload) {
    return api.post('/provider/services', payload);
  },

  async updateService(id, payload) {
    return api.put(`/provider/services/${encodeURIComponent(id)}`, payload);
  },

  async deleteService(id) {
    return api.delete(`/provider/services/${encodeURIComponent(id)}`);
  },

  async getEnquiries() {
    return api.get('/provider/enquiries');
  },
};

export default providerPortalService;
