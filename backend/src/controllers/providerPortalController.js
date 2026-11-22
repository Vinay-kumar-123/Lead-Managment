import providerPortalService from '../services/providerPortalService.js';
import { getExpectedGoogleAudiences, signNonProdGoogleIdToken } from '../services/googleTokenVerifier.js';
import storageService from '../services/storageService.js';
import env from '../config/env.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

function handlePortalError(err, res, next) {
  if (err && err.statusCode) {
    return errorResponse(res, err.message, err.statusCode, err.errors || null);
  }
  if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
    return errorResponse(res, 'A duplicate record with these details already exists.', 409);
  }
  if (err && err.name === 'CastError') {
    return errorResponse(res, 'Invalid resource identifier format.', 400);
  }
  if (err && err.name === 'ValidationError') {
    return errorResponse(res, 'Validation failed. Please check the submitted fields.', 400);
  }
  logger.error('Provider portal operation error', { error: err?.message });
  return next(err);
}

export const providerPortalController = {
  /**
   * GET /api/v1/provider/auth/config
   * Returns public Google Client ID configuration for Google Identity Services initialization.
   */
  getGoogleAuthConfig(req, res) {
    const audiences = getExpectedGoogleAudiences();
    return successResponse(res, {
      googleClientId: env.google?.clientId || audiences[0] || '',
      isConfigured: Boolean(env.google?.clientId),
      allowDevSandbox: !env.isProduction,
    });
  },

  /**
   * POST /api/v1/provider/auth/dev-token
   * Strictly non-production helper to mint a real RS256 signed test Google ID token
   * when testing locally without an external Google Cloud OAuth popup.
   * Disabled completely in production.
   */
  createDevGoogleIdToken(req, res) {
    if (env.isProduction) {
      return errorResponse(res, 'Route not available in production.', 404);
    }

    const { email, name, sub } = req.body || {};
    const cleanEmail =
      typeof email === 'string' && email.trim()
        ? email.trim().toLowerCase()
        : 'partner@dealsathi.in';
    const cleanName =
      typeof name === 'string' && name.trim()
        ? name.trim().slice(0, 100)
        : 'Dealsathi Verified Partner';
    const cleanSub =
      typeof sub === 'string' && sub.trim()
        ? sub.trim()
        : `google-sub-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`;

    const credential = signNonProdGoogleIdToken({
      sub: cleanSub,
      email: cleanEmail,
      email_verified: true,
      name: cleanName,
    });

    return successResponse(res, { credential }, 'Signed non-production RS256 Google ID token generated');
  },

  /**
   * POST /api/v1/provider/auth/google
   * Verifies Google ID token, resolves New vs Returning Provider, sets HttpOnly session cookie,
   * and returns onboarding/dashboard state.
   */
  async authenticateWithGoogle(req, res, next) {
    try {
      const { credential, idToken } = req.body || {};
      const tokenToVerify = credential || idToken;

      const result = await providerPortalService.authenticateWithGoogle(tokenToVerify);

      const isProd = env.isProduction;
      res.cookie('dealsathi_provider_session', result.token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: result.durationHours * 60 * 60 * 1000,
        path: '/',
      });

      logger.info('Provider Google authentication succeeded', {
        accountId: result.account?._id,
        isNewProvider: result.isNewProvider,
        onboardingCompleted: result.onboardingCompleted,
      });

      return successResponse(
        res,
        result,
        result.onboardingCompleted
          ? 'Welcome back! Redirecting to your Provider Dashboard.'
          : 'Google account verified. Please complete your business profile.'
      );
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * GET /api/v1/provider/auth/me
   * Returns current authenticated provider account and linked business profile.
   */
  async getMe(req, res, next) {
    try {
      const overview = await providerPortalService.getDashboardOverview(
        req.providerAccount,
        req.providerProfile
      );
      return successResponse(res, {
        account: overview.account,
        provider: overview.provider,
        onboardingCompleted: overview.onboardingCompleted,
        redirectTo: overview.onboardingCompleted
          ? '/provider/dashboard'
          : '/become-a-partner?step=business-profile',
      });
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * POST /api/v1/provider/auth/logout
   * Invalidates provider session token and clears HttpOnly cookie.
   */
  async logout(req, res, next) {
    try {
      await providerPortalService.logoutSession(req.providerAccount);
      res.clearCookie('dealsathi_provider_session', { path: '/' });
      return successResponse(res, null, 'Provider logged out successfully.');
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/provider/onboarding/draft
   * Saves incomplete onboarding progress for the authenticated provider.
   */
  async saveOnboardingDraft(req, res, next) {
    try {
      const draft = await providerPortalService.saveOnboardingDraft(
        req.providerAccount,
        req.body
      );
      return successResponse(res, { onboardingDraft: draft }, 'Onboarding progress saved.');
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * POST /api/v1/provider/onboarding
   * Creates the Business Profile for a newly authenticated Google provider.
   */
  async completeOnboarding(req, res, next) {
    try {
      let uploadedImageMeta = null;
      if (req.file) {
        try {
          uploadedImageMeta = await storageService.uploadImage(req.file);
        } catch (uploadErr) {
          return errorResponse(
            res,
            uploadErr.message || 'Failed to upload business image.',
            uploadErr.statusCode || 400
          );
        }
      }

      const result = await providerPortalService.createOnboardingBusinessProfile(
        req.providerAccount,
        req.body,
        uploadedImageMeta
      );

      return successResponse(
        res,
        {
          ...result,
          onboardingCompleted: true,
          redirectTo: '/provider/dashboard',
        },
        'Your business profile has been created! Welcome to your Dealsathi Provider Dashboard.',
        201
      );
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * GET /api/v1/provider/dashboard
   * Returns real database-backed dashboard overview, statistics, recent services, and enquiries.
   */
  async getDashboard(req, res, next) {
    try {
      const overview = await providerPortalService.getDashboardOverview(
        req.providerAccount,
        req.providerProfile
      );
      return successResponse(res, overview);
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/provider/profile
   * Updates the authenticated provider's business profile.
   */
  async updateProfile(req, res, next) {
    try {
      let uploadedImageMeta = null;
      if (req.file) {
        try {
          uploadedImageMeta = await storageService.uploadImage(req.file);
        } catch (uploadErr) {
          return errorResponse(
            res,
            uploadErr.message || 'Failed to upload business image.',
            uploadErr.statusCode || 400
          );
        }
      }

      const updated = await providerPortalService.updateBusinessProfile(
        req.providerAccount,
        req.providerProfile,
        req.body,
        uploadedImageMeta
      );

      return successResponse(res, updated, 'Business profile updated successfully.');
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * GET /api/v1/provider/services
   * Lists all services/packages belonging to the authenticated provider.
   */
  async getServices(req, res, next) {
    try {
      const { status = 'all', search = '' } = req.query;
      const services = await providerPortalService.getProviderServices(
        req.providerAccount,
        req.providerProfile,
        { status, search }
      );
      return successResponse(res, {
        services,
        total: services.length,
      });
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * POST /api/v1/provider/services
   * Creates a new service/package for the authenticated provider.
   */
  async createService(req, res, next) {
    try {
      const created = await providerPortalService.createProviderService(
        req.providerAccount,
        req.providerProfile,
        req.body
      );
      return successResponse(
        res,
        created,
        'Service created and queued for marketplace review.',
        201
      );
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * PUT /api/v1/provider/services/:id
   * Updates an existing service/package owned by the authenticated provider.
   */
  async updateService(req, res, next) {
    try {
      const updated = await providerPortalService.updateProviderService(
        req.providerAccount,
        req.providerProfile,
        req.params.id,
        req.body
      );
      return successResponse(res, updated, 'Service updated successfully.');
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * DELETE /api/v1/provider/services/:id
   * Deletes a service/package owned by the authenticated provider.
   */
  async deleteService(req, res, next) {
    try {
      const result = await providerPortalService.deleteProviderService(
        req.providerAccount,
        req.providerProfile,
        req.params.id
      );
      return successResponse(res, result, 'Service removed successfully.');
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },

  /**
   * GET /api/v1/provider/enquiries
   * Lists customer enquiries strictly assigned to the authenticated provider.
   */
  async getEnquiries(req, res, next) {
    try {
      const enquiries = await providerPortalService.getProviderEnquiries(
        req.providerAccount,
        req.providerProfile
      );
      return successResponse(res, {
        enquiries,
        total: enquiries.length,
      });
    } catch (err) {
      return handlePortalError(err, res, next);
    }
  },
};

export default providerPortalController;
