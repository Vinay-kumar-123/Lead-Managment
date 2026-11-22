import env from '../config/env.js';
import providerPortalService from '../services/providerPortalService.js';
import { errorResponse } from '../utils/apiResponse.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (env.corsOrigin === '*') return true;
  const allowedList = env.corsOrigin
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const cleanOrigin = String(origin).trim().replace(/\/$/, '');
  return allowedList.includes('*') || allowedList.includes(cleanOrigin);
}

/**
 * Middleware validating an authenticated Provider session.
 * Enforces:
 * - Valid non-expired session token from Header or HttpOnly Cookie
 * - Origin validation on cookie-authenticated state-changing requests (CSRF protection)
 * - Role check (strictly PROVIDER)
 */
export async function requireProvider(req, res, next) {
  try {
    let token = null;
    let usedCookieAuth = false;

    if (req.headers['x-provider-token']) {
      token = String(req.headers['x-provider-token']).trim();
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1]?.trim();
    } else if (req.cookies && req.cookies.dealsathi_provider_session) {
      token = req.cookies.dealsathi_provider_session;
      usedCookieAuth = true;
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/dealsathi_provider_session=([^;]+)/);
      if (match) {
        token = match[1];
        usedCookieAuth = true;
      }
    }

    if (!token) {
      return errorResponse(
        res,
        'Provider authentication required. Please sign in with Google.',
        401
      );
    }

    // Validate Origin for cookie-authenticated state-changing operations
    if (usedCookieAuth && STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
      const origin = req.headers.origin;
      if (origin && !isOriginAllowed(origin)) {
        return errorResponse(res, 'Forbidden: Untrusted origin for cookie-authenticated request.', 403);
      }
    }

    const session = await providerPortalService.verifySessionToken(token);
    if (!session || !session.account) {
      return errorResponse(
        res,
        'Provider session is invalid or has expired. Please sign in with Google again.',
        401
      );
    }

    if (session.account.role !== 'PROVIDER') {
      return errorResponse(res, 'Forbidden: Provider account privileges required.', 403);
    }

    req.providerAccount = session.account;
    req.providerProfile = session.provider || null;
    return next();
  } catch (err) {
    return errorResponse(res, 'Provider authentication failure.', 401);
  }
}

export default { requireProvider };
