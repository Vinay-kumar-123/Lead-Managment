import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let customCloudinaryClient = null;

function isCloudinaryUrl(url = '') {
  return /^https?:\/\/res\.cloudinary\.com\//i.test(String(url || '').trim());
}

function isLocalUploadUrl(url = '') {
  return /^\/uploads\/[^/]+$/i.test(String(url || '').trim());
}

/**
 * Extracts a Cloudinary public_id from a standard res.cloudinary.com image URL.
 */
export function extractCloudinaryPublicId(url = '') {
  const cleanUrl = String(url || '').trim();
  if (!isCloudinaryUrl(cleanUrl)) return '';
  try {
    const parsed = new URL(cleanUrl);
    // Pattern: /<cloud_name>/image/upload/(v123456/)?<public_id>.<ext>
    const match = parsed.pathname.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

/**
 * Determines whether a media reference is a managed upload (vs static/shared/external URL).
 */
export function classifyManagedAsset(asset) {
  if (!asset) return null;

  const rawUrl = typeof asset === 'string' ? asset.trim() : String(asset.url || '').trim();
  const rawPublicId = typeof asset === 'string' ? '' : String(asset.publicId || '').trim();

  // Never treat built-in static site assets or third-party external URLs (Unsplash, Google avatars) as managed uploads
  if (
    rawUrl.startsWith('/assets/') ||
    rawUrl === '/dealsathi-logo.png' ||
    rawUrl === '/logo.svg' ||
    (rawUrl.startsWith('http') && !isCloudinaryUrl(rawUrl))
  ) {
    return null;
  }

  // Cloudinary asset detection (strictly separated from local filesystem logic)
  if (isCloudinaryUrl(rawUrl)) {
    const publicId = rawPublicId || extractCloudinaryPublicId(rawUrl);
    if (!publicId) return null;
    return {
      provider: 'cloudinary',
      publicId,
      url: rawUrl,
    };
  }

  // Local upload URL (/uploads/<filename>)
  if (isLocalUploadUrl(rawUrl)) {
    const fileKey = path.basename(rawUrl);
    if (!fileKey || fileKey === '.' || fileKey === '..') return null;
    return {
      provider: 'local',
      publicId: rawPublicId || fileKey,
      url: rawUrl,
    };
  }

  // Bare publicId without URL (only when explicitly stored by our uploader)
  if (rawPublicId) {
    if (
      env.storage.provider === 'cloudinary' &&
      env.storage.cloudinary.cloudName &&
      !rawPublicId.startsWith('shop-')
    ) {
      return {
        provider: 'cloudinary',
        publicId: rawPublicId,
        url: rawUrl,
      };
    }
    if (
      rawPublicId.includes('/') &&
      env.storage.cloudinary.folder &&
      rawPublicId.startsWith(env.storage.cloudinary.folder)
    ) {
      return {
        provider: 'cloudinary',
        publicId: rawPublicId,
        url: rawUrl,
      };
    }
    // Safe local filename check (no directory traversal)
    if (path.basename(rawPublicId) === rawPublicId && !rawPublicId.includes('..')) {
      return {
        provider: 'local',
        publicId: rawPublicId,
        url: rawUrl || `/uploads/${rawPublicId}`,
      };
    }
  }

  return null;
}

async function getConfiguredCloudinary() {
  if (customCloudinaryClient) return customCloudinaryClient;
  const cloudinaryModule = await import('cloudinary');
  const cloudinary = cloudinaryModule.v2 || cloudinaryModule.default;
  cloudinary.config({
    cloud_name: env.storage.cloudinary.cloudName,
    api_key: env.storage.cloudinary.apiKey,
    api_secret: env.storage.cloudinary.apiSecret,
  });
  return cloudinary;
}

/**
 * Storage Service Abstraction
 * Manages file uploads and safe cleanup for Cloudinary or local filesystem storage.
 */
export const storageService = {
  /**
   * Test hook for injecting a mocked Cloudinary client during isolated unit tests.
   */
  _setCloudinaryClient(client) {
    customCloudinaryClient = client;
  },

  /**
   * Upload an image buffer or file object
   * @param {Object} file - Multer file object ({ buffer, originalname, mimetype, size })
   * @returns {Promise<Object>} Image metadata object
   */
  async uploadImage(file) {
    if (!file) {
      throw new Error('No file provided for upload');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const error = new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted.');
      error.statusCode = 400;
      throw error;
    }

    const maxSizeBytes = env.storage.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      const error = new Error(`File size exceeds maximum limit of ${env.storage.maxFileSizeMb}MB.`);
      error.statusCode = 400;
      throw error;
    }

    // Cloudinary Storage Provider
    if (
      env.storage.provider === 'cloudinary' &&
      env.storage.cloudinary.cloudName &&
      env.storage.cloudinary.apiKey &&
      env.storage.cloudinary.apiSecret
    ) {
      return await this._uploadToCloudinary(file);
    }

    // Default: Local Storage Provider
    return await this._uploadToLocalStorage(file);
  },

  async _uploadToLocalStorage(file) {
    const uploadDir = env.storage.uploadDir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const extMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const ext = extMap[file.mimetype] || '.jpg';
    const uniqueKey = `shop-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const targetPath = path.join(uploadDir, uniqueKey);

    await fs.promises.writeFile(targetPath, file.buffer);
    logger.info('Shop image saved to local storage', { key: uniqueKey, size: file.size });

    return {
      url: `/uploads/${uniqueKey}`,
      publicId: uniqueKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
  },

  async _uploadToCloudinary(file) {
    const cloudinary = await getConfiguredCloudinary();

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: env.storage.cloudinary.folder,
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload failure', { error: error.message });
            return reject(new Error('Cloud image storage upload failed: ' + error.message));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date(),
          });
        }
      );
      uploadStream.end(file.buffer);
    });
  },

  /**
   * Deletes a confirmed managed asset (Cloudinary or local upload) with bounded retries.
   * Never uses local filesystem deletion logic for Cloudinary assets.
   */
  async deleteAsset(asset, { retries = 2 } = {}) {
    const classified = classifyManagedAsset(asset);
    if (!classified) {
      return {
        success: true,
        skipped: true,
        reason: 'Not a managed uploaded asset',
      };
    }

    if (classified.provider === 'cloudinary') {
      if (
        !customCloudinaryClient &&
        (!env.storage.cloudinary.cloudName ||
          !env.storage.cloudinary.apiKey ||
          !env.storage.cloudinary.apiSecret)
      ) {
        return {
          success: false,
          provider: 'cloudinary',
          publicId: classified.publicId,
          url: classified.url,
          attempts: 0,
          error: 'Cloudinary credentials are not configured for asset deletion.',
        };
      }

      let lastErr = null;
      const maxAttempts = Math.max(1, retries + 1);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const cloudinary = await getConfiguredCloudinary();
          const res = await cloudinary.uploader.destroy(classified.publicId, {
            resource_type: 'image',
            invalidate: true,
          });
          if (res && (res.result === 'ok' || res.result === 'not found')) {
            return {
              success: true,
              provider: 'cloudinary',
              publicId: classified.publicId,
              url: classified.url,
              result: res.result,
              attempts: attempt,
            };
          }
          lastErr = new Error(`Unexpected Cloudinary destroy result: ${res?.result || 'unknown'}`);
        } catch (err) {
          lastErr = err;
          logger.warn('Cloudinary asset deletion attempt failed', {
            publicId: classified.publicId,
            attempt,
            error: err.message,
          });
        }
      }

      return {
        success: false,
        provider: 'cloudinary',
        publicId: classified.publicId,
        url: classified.url,
        attempts: maxAttempts,
        error: lastErr?.message || 'Cloudinary asset deletion failed',
      };
    }

    // Local filesystem deletion (strictly confined inside uploadDir)
    const uploadDir = path.resolve(env.storage.uploadDir);
    const safeName = path.basename(classified.publicId);
    const localFile = path.resolve(uploadDir, safeName);
    if (!localFile.startsWith(uploadDir + path.sep) && localFile !== uploadDir) {
      return {
        success: false,
        provider: 'local',
        publicId: classified.publicId,
        url: classified.url,
        attempts: 1,
        error: 'Blocked unsafe local file deletion path.',
      };
    }

    try {
      if (fs.existsSync(localFile)) {
        await fs.promises.unlink(localFile);
      }
      return {
        success: true,
        provider: 'local',
        publicId: safeName,
        url: classified.url,
        attempts: 1,
      };
    } catch (err) {
      logger.warn('Failed to delete local file', { path: localFile, error: err.message });
      return {
        success: false,
        provider: 'local',
        publicId: safeName,
        url: classified.url,
        attempts: 1,
        error: err.message,
      };
    }
  },

  /**
   * Backward-compatible wrapper around deleteAsset
   */
  async deleteImage(publicId) {
    if (!publicId) return { success: true, skipped: true };
    return this.deleteAsset({ publicId });
  },
};

export default storageService;
