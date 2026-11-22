import crypto from 'crypto';
import https from 'https';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const DEFAULT_DEV_AUDIENCE = 'dealsathi-local-google-client.apps.googleusercontent.com';

// Cached Google JWKS keys ({ keys: [...], expiresAt: number })
let jwksCache = {
  keys: [],
  expiresAt: 0,
};

// Ephemeral RSA-2048 keypair strictly for non-production local/CI verification
let nonProdKeyPair = null;
const NON_PROD_KID = 'dealsathi-nonprod-rs256-key-1';

function getNonProdKeyPair() {
  if (env.isProduction) return null;
  if (!nonProdKeyPair) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicJwk = publicKey.export({ format: 'jwk' });
    nonProdKeyPair = {
      publicKey,
      privateKey,
      jwk: {
        ...publicJwk,
        kid: NON_PROD_KID,
        alg: 'RS256',
        use: 'sig',
      },
    };
  }
  return nonProdKeyPair;
}

function base64UrlToBuffer(str) {
  const padded = String(str || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function bufferToBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createAuthError(message, statusCode = 401, code = 'INVALID_GOOGLE_TOKEN') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function fetchGoogleJwks() {
  return new Promise((resolve, reject) => {
    const req = https.get(GOOGLE_JWKS_URL, { timeout: 6000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Google JWKS endpoint returned HTTP ${res.statusCode}`));
        }
        try {
          const parsed = JSON.parse(body);
          if (!Array.isArray(parsed?.keys)) {
            return reject(new Error('Invalid Google JWKS payload'));
          }
          resolve(parsed.keys);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Google JWKS request timed out'));
    });
  });
}

async function resolveSigningJwk(kid) {
  // Check non-production test/dev key first when not in production
  if (!env.isProduction && kid === NON_PROD_KID) {
    const pair = getNonProdKeyPair();
    if (pair) return pair.jwk;
  }

  const now = Date.now();
  if (jwksCache.keys.length > 0 && jwksCache.expiresAt > now) {
    const cached = jwksCache.keys.find((k) => k.kid === kid);
    if (cached) return cached;
  }

  const freshKeys = await fetchGoogleJwks();
  jwksCache = {
    keys: freshKeys,
    expiresAt: now + 60 * 60 * 1000, // Cache for 1 hour
  };

  return freshKeys.find((k) => k.kid === kid) || null;
}

/**
 * Returns the configured expected Google OAuth Client ID(s)
 */
export function getExpectedGoogleAudiences() {
  const configured = (process.env.GOOGLE_CLIENT_ID || env.google?.clientId || '').trim();
  if (configured) {
    return configured
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  if (!env.isProduction) {
    return [DEFAULT_DEV_AUDIENCE];
  }
  return [];
}

/**
 * Verifies a Google Identity Services (GIS) ID Token on the backend.
 * Strictly validates:
 * 1. JWT 3-part format
 * 2. Algorithm (RS256 only; rejects 'none' or symmetric algorithms)
 * 3. Cryptographic RSA-SHA256 signature against Google's JWK public key
 * 4. Issuer (accounts.google.com or https://accounts.google.com)
 * 5. Audience (matches configured GOOGLE_CLIENT_ID)
 * 6. Expiration (exp > current timestamp)
 * 7. Verified email (email_verified === true)
 * 8. Immutable Google subject identifier (sub)
 */
export async function verifyGoogleIdToken(idToken, { expectedAudiences = null } = {}) {
  if (!idToken || typeof idToken !== 'string') {
    throw createAuthError('Google ID token is required.', 400, 'MISSING_TOKEN');
  }

  const trimmed = idToken.trim();
  const segments = trimmed.split('.');
  if (segments.length !== 3) {
    throw createAuthError('Malformed Google ID token.', 401, 'MALFORMED_TOKEN');
  }

  const [headerB64, payloadB64, signatureB64] = segments;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw createAuthError('Malformed Google ID token segments.', 401, 'MALFORMED_TOKEN');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    throw createAuthError('Invalid Google ID token encoding.', 401, 'INVALID_ENCODING');
  }

  // 1. Validate Algorithm (strictly RS256)
  if (!header || header.alg !== 'RS256' || !header.kid) {
    throw createAuthError(
      'Unsupported or missing Google token signature algorithm.',
      401,
      'INVALID_ALGORITHM'
    );
  }

  // 2. Validate Issuer
  if (!payload || !VALID_ISSUERS.has(payload.iss)) {
    throw createAuthError('Invalid Google token issuer.', 401, 'INVALID_ISSUER');
  }

  // 3. Validate Audience
  const allowedAudiences = Array.isArray(expectedAudiences)
    ? expectedAudiences
    : getExpectedGoogleAudiences();

  if (allowedAudiences.length === 0) {
    logger.error('GOOGLE_CLIENT_ID is not configured on the backend in production.');
    throw createAuthError(
      'Google authentication is not configured on the server.',
      503,
      'GOOGLE_AUTH_UNCONFIGURED'
    );
  }

  if (!payload.aud || !allowedAudiences.includes(String(payload.aud))) {
    throw createAuthError(
      'Google token audience does not match configured Client ID.',
      401,
      'INVALID_AUDIENCE'
    );
  }

  // 4. Validate Expiration & Not-Before
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw createAuthError('Google ID token has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
  }

  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 60) {
    throw createAuthError('Google ID token is not yet valid.', 401, 'TOKEN_NOT_YET_VALID');
  }

  // 5. Validate Immutable Subject (sub)
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub || sub.length < 3 || sub.length > 255) {
    throw createAuthError('Google token is missing valid subject identifier (sub).', 401, 'INVALID_SUB');
  }

  // 6. Validate Verified Email
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw createAuthError('Google token does not contain a valid email address.', 401, 'INVALID_EMAIL');
  }

  const isEmailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!isEmailVerified) {
    throw createAuthError(
      'Your Google account email is not verified. Please use a verified Google account.',
      403,
      'UNVERIFIED_EMAIL'
    );
  }

  // 7. Verify Cryptographic RSA-SHA256 Signature
  let jwk;
  try {
    jwk = await resolveSigningJwk(header.kid);
  } catch (jwksErr) {
    logger.error('Failed to retrieve Google JWKS public keys', { error: jwksErr.message });
    throw createAuthError('Unable to verify Google token signature at this time.', 503, 'JWKS_UNAVAILABLE');
  }

  if (!jwk) {
    throw createAuthError('Unrecognized Google signing key identifier (kid).', 401, 'UNKNOWN_KID');
  }

  let isSignatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
    const signatureBuf = base64UrlToBuffer(signatureB64);
    isSignatureValid = crypto.verify('RSA-SHA256', signingInput, publicKey, signatureBuf);
  } catch {
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    throw createAuthError('Invalid Google ID token cryptographic signature.', 401, 'INVALID_SIGNATURE');
  }

  return {
    sub,
    email,
    emailVerified: true,
    name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : '',
    picture: typeof payload.picture === 'string' ? payload.picture.trim().slice(0, 500) : '',
    iss: payload.iss,
    aud: payload.aud,
    exp: payload.exp,
  };
}

/**
 * Helper strictly for non-production automated tests & local dev sandbox
 * Signs a real RS256 JWT token using the in-process non-production RSA-2048 private key.
 */
export function signNonProdGoogleIdToken(claims = {}, options = {}) {
  if (env.isProduction) {
    throw new Error('signNonProdGoogleIdToken is strictly prohibited in production');
  }

  const pair = getNonProdKeyPair();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const defaultAud = getExpectedGoogleAudiences()[0] || DEFAULT_DEV_AUDIENCE;

  const header = {
    alg: options.alg || 'RS256',
    typ: 'JWT',
    kid: options.kid !== undefined ? options.kid : NON_PROD_KID,
  };

  const payload = {
    iss: claims.iss !== undefined ? claims.iss : 'https://accounts.google.com',
    aud: claims.aud !== undefined ? claims.aud : defaultAud,
    sub: claims.sub !== undefined ? claims.sub : 'google-sub-100001',
    email: claims.email !== undefined ? claims.email : 'partner@dealsathi.in',
    email_verified: claims.email_verified !== undefined ? claims.email_verified : true,
    name: claims.name !== undefined ? claims.name : 'Verified Dealsathi Partner',
    picture: claims.picture !== undefined ? claims.picture : '',
    iat: claims.iat !== undefined ? claims.iat : nowSeconds - 10,
    exp: claims.exp !== undefined ? claims.exp : nowSeconds + 3600,
  };

  const headerB64 = bufferToBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadB64 = bufferToBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');

  let signatureB64;
  if (options.tamperSignature) {
    signatureB64 = bufferToBase64Url(crypto.randomBytes(256));
  } else {
    const sig = crypto.sign('RSA-SHA256', signingInput, pair.privateKey);
    signatureB64 = bufferToBase64Url(sig);
  }

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

export default {
  verifyGoogleIdToken,
  getExpectedGoogleAudiences,
  signNonProdGoogleIdToken,
};
