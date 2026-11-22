import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Provider from '../models/Provider.js';
import ProviderAccount from '../models/ProviderAccount.js';
import ProviderService from '../models/ProviderService.js';
import Blog from '../models/Blog.js';
import MediaCleanupTask from '../models/MediaCleanupTask.js';
import storageService, { classifyManagedAsset } from './storageService.js';
import { runInTransaction } from '../utils/dbTransaction.js';
import logger from '../utils/logger.js';

function createHttpError(message, statusCode = 400, details = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details) err.details = details;
  return err;
}

export function assertValidObjectId(id, label = 'record') {
  const cleanId = String(id || '').trim();
  if (!cleanId || !/^[a-fA-F0-9]{24}$/.test(cleanId) || !mongoose.Types.ObjectId.isValid(cleanId)) {
    throw createHttpError(`Invalid ${label} identifier format.`, 400);
  }
  return cleanId;
}

/**
 * Extracts unique managed media assets from a record (Provider, Lead, or Blog).
 */
export function collectRecordMediaAssets(record, kind) {
  if (!record) return [];
  const candidates = [];

  if (kind === 'PROVIDER') {
    if (record.shopImage && (record.shopImage.url || record.shopImage.publicId)) {
      candidates.push(record.shopImage);
    }
    if (record.logo) candidates.push({ url: record.logo });
    if (record.coverImage) candidates.push({ url: record.coverImage });
    if (Array.isArray(record.gallery)) {
      for (const item of record.gallery) {
        if (item) candidates.push(typeof item === 'string' ? { url: item } : item);
      }
    }
  } else if (kind === 'LEAD') {
    if (record.shopImage && (record.shopImage.url || record.shopImage.publicId)) {
      candidates.push(record.shopImage);
    }
  } else if (kind === 'BLOG') {
    if (record.coverImage) {
      candidates.push({ url: record.coverImage });
    }
  }

  const seen = new Set();
  const managed = [];
  for (const cand of candidates) {
    const classified = classifyManagedAsset(cand);
    if (!classified) continue;
    const key = `${classified.provider}:${classified.publicId}`;
    if (!seen.has(key)) {
      seen.add(key);
      managed.push(classified);
    }
  }
  return managed;
}

/**
 * Checks whether an uploaded asset (publicId or url) is still referenced by any remaining record.
 * Prevents deleting shared assets (e.g., shopImage shared between a Partner Application Lead and a Provider).
 */
export async function isAssetReferencedElsewhere(
  asset,
  { excludeProviderId = null, excludeLeadId = null, excludeBlogId = null } = {}
) {
  const orMatchers = [];
  if (asset.publicId) {
    orMatchers.push({ 'shopImage.publicId': asset.publicId });
  }
  if (asset.url) {
    orMatchers.push({ 'shopImage.url': asset.url });
  }

  if (orMatchers.length === 0) return false;

  const providerQuery = { $or: [...orMatchers] };
  if (asset.url) {
    providerQuery.$or.push({ logo: asset.url }, { coverImage: asset.url }, { gallery: asset.url });
  }
  if (excludeProviderId) {
    providerQuery._id = { $ne: excludeProviderId };
  }

  const leadQuery = { $or: [...orMatchers] };
  if (excludeLeadId) {
    leadQuery._id = { $ne: excludeLeadId };
  }

  const blogMatchers = [];
  if (asset.url) blogMatchers.push({ coverImage: asset.url });
  if (asset.publicId) blogMatchers.push({ coverImage: asset.publicId });
  const blogQuery = blogMatchers.length > 0 ? { $or: blogMatchers } : null;
  if (blogQuery && excludeBlogId) {
    blogQuery._id = { $ne: excludeBlogId };
  }

  const [provMatch, leadMatch, blogMatch] = await Promise.all([
    Provider.exists ? Provider.exists(providerQuery) : Provider.findOne(providerQuery).lean(),
    Lead.exists ? Lead.exists(leadQuery) : Lead.findOne(leadQuery).lean(),
    blogQuery
      ? Blog.exists
        ? Blog.exists(blogQuery)
        : Blog.findOne(blogQuery).lean()
      : null,
  ]);

  return Boolean(provMatch || leadMatch || blogMatch);
}

/**
 * Safely deletes confirmed record-owned media assets after database deletion.
 * Records retryable MediaCleanupTask entries if Cloudinary/local deletion fails so
 * partial failures are never silently reported as complete.
 */
export async function cleanupRecordAssets(
  assets = [],
  { ownerType, ownerId, adminEmail = '', excludeProviderId = null, excludeLeadId = null, excludeBlogId = null } = {}
) {
  const summary = {
    status: 'NONE',
    attempted: 0,
    deletedAssets: [],
    skippedSharedAssets: [],
    failedAssets: [],
    queuedTaskIds: [],
  };

  if (!Array.isArray(assets) || assets.length === 0) {
    return summary;
  }

  for (const asset of assets) {
    const shared = await isAssetReferencedElsewhere(asset, {
      excludeProviderId,
      excludeLeadId,
      excludeBlogId,
    });

    if (shared) {
      summary.skippedSharedAssets.push({
        publicId: asset.publicId,
        provider: asset.provider,
        reason: 'Referenced by another active record',
      });
      continue;
    }

    summary.attempted += 1;
    const res = await storageService.deleteAsset(asset, { retries: 2 });
    if (res.success) {
      if (!res.skipped) {
        summary.deletedAssets.push({
          publicId: res.publicId,
          provider: res.provider,
        });
      }
    } else {
      let taskId = null;
      try {
        const task = await MediaCleanupTask.create({
          publicId: asset.publicId,
          url: asset.url || '',
          provider: asset.provider,
          ownerType: ownerType || 'UNKNOWN',
          ownerId: String(ownerId || ''),
          status: 'PENDING',
          attempts: res.attempts || 1,
          lastError: res.error || 'Asset cleanup failed',
          createdBy: String(adminEmail || '').toLowerCase(),
        });
        taskId = String(task._id);
        summary.queuedTaskIds.push(taskId);
      } catch (queueErr) {
        logger.error('Failed to enqueue MediaCleanupTask after storage cleanup failure', {
          publicId: asset.publicId,
          error: queueErr.message,
        });
      }

      summary.failedAssets.push({
        publicId: asset.publicId,
        provider: asset.provider,
        error: res.error || 'External storage deletion failed',
        cleanupTaskId: taskId,
      });
    }
  }

  if (summary.failedAssets.length > 0) {
    summary.status = 'PARTIAL_FAILURE';
  } else if (summary.deletedAssets.length > 0) {
    summary.status = 'COMPLETE';
  } else if (summary.skippedSharedAssets.length > 0) {
    summary.status = 'SKIPPED_SHARED';
  }

  return summary;
}

export const deletionService = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. PROVIDERS (+ ProviderAccount + ProviderService + Lead + Media)
  // ───────────────────────────────────────────────────────────────────────────
  async getProviderDeletionImpact(providerId) {
    const cleanId = assertValidObjectId(providerId, 'provider');
    const provider = await Provider.findById(cleanId).lean();
    if (!provider) {
      throw createHttpError('Provider not found', 404);
    }

    const accountMatchers = [{ providerProfileId: provider._id }];
    if (provider.accountId) accountMatchers.push({ _id: provider.accountId });
    if (provider.googleSub) accountMatchers.push({ googleSub: provider.googleSub });

    const [servicesCount, assignedEnquiriesCount, linkedAccountsCount] = await Promise.all([
      ProviderService.countDocuments({ providerId: provider._id }),
      Lead.countDocuments({ type: { $in: ['enquiry', 'contact'] }, assignedProviderId: provider._id }),
      ProviderAccount.countDocuments({ $or: accountMatchers }),
    ]);

    const candidateAssets = collectRecordMediaAssets(provider, 'PROVIDER');
    const ownedMediaAssets = [];
    const sharedMediaAssets = [];

    for (const asset of candidateAssets) {
      const shared = await isAssetReferencedElsewhere(asset, { excludeProviderId: provider._id });
      if (shared) {
        sharedMediaAssets.push({ publicId: asset.publicId, provider: asset.provider, url: asset.url });
      } else {
        ownedMediaAssets.push({ publicId: asset.publicId, provider: asset.provider, url: asset.url });
      }
    }

    return {
      provider: {
        _id: String(provider._id),
        businessName: provider.businessName,
        slug: provider.slug,
        city: provider.city,
        category: provider.category,
        verificationStatus: provider.verificationStatus,
        publicationStatus: provider.publicationStatus,
        isDeleted: Boolean(provider.isDeleted),
      },
      impact: {
        servicesCount,
        assignedEnquiriesCount,
        hasLinkedAccount: linkedAccountsCount > 0,
        hasSourceApplication: Boolean(provider.sourceApplicationId),
        ownedMediaAssets,
        sharedMediaAssets,
      },
    };
  },

  async softDeleteProvider(providerId, adminEmail = '', reason = '') {
    const cleanId = assertValidObjectId(providerId, 'provider');
    const provider = await Provider.findById(cleanId);
    if (!provider) {
      throw createHttpError('Provider not found', 404);
    }

    if (provider.isDeleted) {
      throw createHttpError('Provider is already in trash.', 409);
    }

    const now = new Date();
    const cleanReason = String(reason || '').trim().slice(0, 300);
    let affectedServices = 0;
    let affectedAccounts = 0;

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {};

      provider.isDeleted = true;
      provider.deletedAt = now;
      provider.deletedBy = String(adminEmail || '').toLowerCase();
      provider.deleteReason = cleanReason;
      provider.publicationStatus = 'ARCHIVED';
      provider.verificationStatus = 'REVOKED';
      await provider.save(opts);

      const svcRes = await ProviderService.updateMany(
        { providerId: provider._id, isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: String(adminEmail || '').toLowerCase(),
            deleteReason: cleanReason || 'Parent provider soft-deleted',
            isActive: false,
            publicationStatus: 'ARCHIVED',
          },
        },
        opts
      );
      affectedServices = svcRes.modifiedCount || 0;

      const accountMatchers = [{ providerProfileId: provider._id }];
      if (provider.accountId) accountMatchers.push({ _id: provider.accountId });
      if (provider.googleSub) accountMatchers.push({ googleSub: provider.googleSub });

      const accRes = await ProviderAccount.updateMany(
        { $or: accountMatchers },
        {
          $set: {
            isActive: false,
            isDeleted: true,
            deletedAt: now,
            deletedBy: String(adminEmail || '').toLowerCase(),
            sessionToken: null,
            sessionExpiresAt: null,
          },
        },
        opts
      );
      affectedAccounts = accRes.modifiedCount || 0;
    });

    return {
      provider: provider.toObject ? provider.toObject() : provider,
      affectedServices,
      affectedAccounts,
    };
  },

  async restoreProvider(providerId) {
    const cleanId = assertValidObjectId(providerId, 'provider');
    const provider = await Provider.findById(cleanId);
    if (!provider) {
      throw createHttpError('Provider not found', 404);
    }
    if (!provider.isDeleted) {
      throw createHttpError('Provider is not deleted.', 400);
    }

    let restoredServices = 0;
    let restoredAccounts = 0;

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {};

      provider.isDeleted = false;
      provider.deletedAt = null;
      provider.deletedBy = '';
      provider.deleteReason = '';
      provider.verificationStatus = 'VERIFIED';
      provider.publicationStatus = 'DRAFT';
      await provider.save(opts);

      const svcRes = await ProviderService.updateMany(
        { providerId: provider._id, isDeleted: true },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            deletedBy: '',
            deleteReason: '',
            isActive: true,
            publicationStatus: 'DRAFT',
          },
        },
        opts
      );
      restoredServices = svcRes.modifiedCount || 0;

      const accountMatchers = [{ providerProfileId: provider._id }];
      if (provider.accountId) accountMatchers.push({ _id: provider.accountId });
      if (provider.googleSub) accountMatchers.push({ googleSub: provider.googleSub });

      const accRes = await ProviderAccount.updateMany(
        { $or: accountMatchers, isDeleted: true },
        {
          $set: {
            isActive: true,
            isDeleted: false,
            deletedAt: null,
            deletedBy: '',
          },
        },
        opts
      );
      restoredAccounts = accRes.modifiedCount || 0;
    });

    return {
      provider: provider.toObject ? provider.toObject() : provider,
      restoredServices,
      restoredAccounts,
    };
  },

  async permanentDeleteProvider(providerId, { adminEmail = '', confirmBusinessName = '' } = {}) {
    const cleanId = assertValidObjectId(providerId, 'provider');
    const provider = await Provider.findById(cleanId).lean();
    if (!provider) {
      throw createHttpError('Provider not found', 404);
    }

    if (
      confirmBusinessName &&
      String(confirmBusinessName).trim().toLowerCase() !==
        String(provider.businessName || '').trim().toLowerCase()
    ) {
      throw createHttpError(
        'Confirmation business name does not match the provider profile.',
        400
      );
    }

    const candidateAssets = collectRecordMediaAssets(provider, 'PROVIDER');
    let deletedServicesCount = 0;
    let unlinkedEnquiriesCount = 0;
    let deletedAccountsCount = 0;

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {};

      const svcRes = await ProviderService.deleteMany({ providerId: provider._id }, opts);
      deletedServicesCount = svcRes.deletedCount || 0;

      // Preserve customer enquiry history safely by unlinking assignedProviderId
      const enqRes = await Lead.updateMany(
        { assignedProviderId: provider._id },
        { $set: { assignedProviderId: null } },
        opts
      );
      unlinkedEnquiriesCount = enqRes.modifiedCount || 0;

      // Delete linked ProviderAccount auth records & sessions
      const accountMatchers = [{ providerProfileId: provider._id }];
      if (provider.accountId) accountMatchers.push({ _id: provider.accountId });
      if (provider.googleSub) accountMatchers.push({ googleSub: provider.googleSub });
      const accRes = await ProviderAccount.deleteMany({ $or: accountMatchers }, opts);
      deletedAccountsCount = accRes.deletedCount || 0;

      await Provider.deleteOne({ _id: provider._id }, opts);
    });

    const mediaCleanup = await cleanupRecordAssets(candidateAssets, {
      ownerType: 'PROVIDER',
      ownerId: String(provider._id),
      adminEmail,
      excludeProviderId: provider._id,
    });

    return {
      deletedId: String(provider._id),
      businessName: provider.businessName,
      slug: provider.slug,
      deletedServicesCount,
      unlinkedEnquiriesCount,
      deletedAccountsCount,
      mediaCleanup,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CUSTOMER ENQUIRIES & CONTACT LEADS
  // ───────────────────────────────────────────────────────────────────────────
  async softDeleteEnquiry(enquiryId, adminEmail = '', reason = '') {
    const cleanId = assertValidObjectId(enquiryId, 'enquiry');
    const enquiry = await Lead.findById(cleanId);
    if (!enquiry || !['enquiry', 'contact'].includes(enquiry.type)) {
      throw createHttpError('Enquiry not found', 404);
    }
    if (enquiry.isDeleted) {
      throw createHttpError('Enquiry is already in trash.', 409);
    }

    enquiry.isDeleted = true;
    enquiry.deletedAt = new Date();
    enquiry.deletedBy = String(adminEmail || '').toLowerCase();
    enquiry.deleteReason = String(reason || '').trim().slice(0, 300);
    await enquiry.save();

    return enquiry.toObject ? enquiry.toObject() : enquiry;
  },

  async restoreEnquiry(enquiryId) {
    const cleanId = assertValidObjectId(enquiryId, 'enquiry');
    const enquiry = await Lead.findById(cleanId);
    if (!enquiry || !['enquiry', 'contact'].includes(enquiry.type)) {
      throw createHttpError('Enquiry not found', 404);
    }
    if (!enquiry.isDeleted) {
      throw createHttpError('Enquiry is not deleted.', 400);
    }

    enquiry.isDeleted = false;
    enquiry.deletedAt = null;
    enquiry.deletedBy = '';
    enquiry.deleteReason = '';
    await enquiry.save();

    return enquiry.toObject ? enquiry.toObject() : enquiry;
  },

  async anonymizeEnquiryCustomerData(enquiryId, adminEmail = '') {
    const cleanId = assertValidObjectId(enquiryId, 'enquiry');
    const enquiry = await Lead.findById(cleanId);
    if (!enquiry || !['enquiry', 'contact'].includes(enquiry.type)) {
      throw createHttpError('Enquiry not found', 404);
    }
    if (enquiry.isAnonymized) {
      throw createHttpError('Customer PII on this enquiry has already been anonymized.', 409);
    }

    enquiry.name = 'Anonymized Customer';
    enquiry.phone = '0000000000';
    enquiry.email = '';
    enquiry.address = '';
    enquiry.location = '';
    enquiry.pinCode = '';
    enquiry.isAnonymized = true;
    enquiry.anonymizedAt = new Date();
    enquiry.anonymizedBy = String(adminEmail || '').toLowerCase();
    await enquiry.save();

    return enquiry.toObject ? enquiry.toObject() : enquiry;
  },

  async permanentDeleteEnquiry(enquiryId, { adminEmail = '' } = {}) {
    const cleanId = assertValidObjectId(enquiryId, 'enquiry');
    const enquiry = await Lead.findById(cleanId).lean();
    if (!enquiry || !['enquiry', 'contact'].includes(enquiry.type)) {
      throw createHttpError('Enquiry not found', 404);
    }

    const candidateAssets = collectRecordMediaAssets(enquiry, 'LEAD');
    await Lead.deleteOne({ _id: enquiry._id });

    const mediaCleanup = await cleanupRecordAssets(candidateAssets, {
      ownerType: 'LEAD',
      ownerId: String(enquiry._id),
      adminEmail,
      excludeLeadId: enquiry._id,
    });

    return {
      deletedId: String(enquiry._id),
      referenceId: enquiry.referenceId,
      type: enquiry.type,
      mediaCleanup,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PARTNER APPLICATIONS
  // ───────────────────────────────────────────────────────────────────────────
  async softDeleteApplication(appId, adminEmail = '', reason = '') {
    const cleanId = assertValidObjectId(appId, 'application');
    const application = await Lead.findById(cleanId);
    if (!application || application.type !== 'partner') {
      throw createHttpError('Partner application not found', 404);
    }
    if (application.isDeleted) {
      throw createHttpError('Partner application is already in trash.', 409);
    }

    application.isDeleted = true;
    application.deletedAt = new Date();
    application.deletedBy = String(adminEmail || '').toLowerCase();
    application.deleteReason = String(reason || '').trim().slice(0, 300);
    await application.save();

    return application.toObject ? application.toObject() : application;
  },

  async restoreApplication(appId) {
    const cleanId = assertValidObjectId(appId, 'application');
    const application = await Lead.findById(cleanId);
    if (!application || application.type !== 'partner') {
      throw createHttpError('Partner application not found', 404);
    }
    if (!application.isDeleted) {
      throw createHttpError('Partner application is not deleted.', 400);
    }

    application.isDeleted = false;
    application.deletedAt = null;
    application.deletedBy = '';
    application.deleteReason = '';
    await application.save();

    return application.toObject ? application.toObject() : application;
  },

  async permanentDeleteApplication(appId, { adminEmail = '' } = {}) {
    const cleanId = assertValidObjectId(appId, 'application');
    const application = await Lead.findById(cleanId).lean();
    if (!application || application.type !== 'partner') {
      throw createHttpError('Partner application not found', 404);
    }

    const candidateAssets = collectRecordMediaAssets(application, 'LEAD');
    let unlinkedProviders = 0;

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      // Preserve any linked Provider profile; only unlink sourceApplicationId
      const provRes = await Provider.updateMany(
        { sourceApplicationId: application._id },
        { $set: { sourceApplicationId: null } },
        opts
      );
      unlinkedProviders = provRes.modifiedCount || 0;
      await Lead.deleteOne({ _id: application._id }, opts);
    });

    const mediaCleanup = await cleanupRecordAssets(candidateAssets, {
      ownerType: 'LEAD',
      ownerId: String(application._id),
      adminEmail,
      excludeLeadId: application._id,
    });

    return {
      deletedId: String(application._id),
      referenceId: application.referenceId,
      businessName: application.businessName,
      unlinkedProviders,
      mediaCleanup,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BLOG POSTS / ARTICLES
  // ───────────────────────────────────────────────────────────────────────────
  async softDeleteBlog(blogId, adminEmail = '', reason = '') {
    const cleanId = assertValidObjectId(blogId, 'blog');
    const blog = await Blog.findById(cleanId);
    if (!blog) {
      throw createHttpError('Blog article not found', 404);
    }
    if (blog.isDeleted) {
      throw createHttpError('Blog article is already in trash.', 409);
    }

    blog.isDeleted = true;
    blog.deletedAt = new Date();
    blog.deletedBy = String(adminEmail || '').toLowerCase();
    blog.deleteReason = String(reason || '').trim().slice(0, 300);
    blog.status = 'archived';
    await blog.save();

    return blog.toObject ? blog.toObject() : blog;
  },

  async restoreBlog(blogId) {
    const cleanId = assertValidObjectId(blogId, 'blog');
    const blog = await Blog.findById(cleanId);
    if (!blog) {
      throw createHttpError('Blog article not found', 404);
    }
    if (!blog.isDeleted && blog.status !== 'archived') {
      throw createHttpError('Blog article is not archived or deleted.', 400);
    }

    blog.isDeleted = false;
    blog.deletedAt = null;
    blog.deletedBy = '';
    blog.deleteReason = '';
    blog.status = 'draft';
    await blog.save();

    return blog.toObject ? blog.toObject() : blog;
  },

  async permanentDeleteBlog(blogId, { adminEmail = '' } = {}) {
    const cleanId = assertValidObjectId(blogId, 'blog');
    const blog = await Blog.findById(cleanId).lean();
    if (!blog) {
      throw createHttpError('Blog article not found', 404);
    }

    const candidateAssets = collectRecordMediaAssets(blog, 'BLOG');
    await Blog.deleteOne({ _id: blog._id });

    const mediaCleanup = await cleanupRecordAssets(candidateAssets, {
      ownerType: 'BLOG',
      ownerId: String(blog._id),
      adminEmail,
      excludeBlogId: blog._id,
    });

    return {
      deletedId: String(blog._id),
      title: blog.title,
      slug: blog.slug,
      mediaCleanup,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SERVICES & PACKAGES (ProviderService)
  // ───────────────────────────────────────────────────────────────────────────
  async softDeleteService(serviceId, adminEmail = '', reason = '') {
    const cleanId = assertValidObjectId(serviceId, 'service');
    const service = await ProviderService.findById(cleanId);
    if (!service) {
      throw createHttpError('Service or package not found', 404);
    }
    if (service.isDeleted) {
      throw createHttpError('Service is already in trash.', 409);
    }

    service.isDeleted = true;
    service.deletedAt = new Date();
    service.deletedBy = String(adminEmail || '').toLowerCase();
    service.deleteReason = String(reason || '').trim().slice(0, 300);
    service.isActive = false;
    service.publicationStatus = 'ARCHIVED';
    await service.save();

    return service.toObject ? service.toObject() : service;
  },

  async restoreService(serviceId) {
    const cleanId = assertValidObjectId(serviceId, 'service');
    const service = await ProviderService.findById(cleanId);
    if (!service) {
      throw createHttpError('Service or package not found', 404);
    }
    if (!service.isDeleted) {
      throw createHttpError('Service is not deleted.', 400);
    }

    const parentProvider = await Provider.findById(service.providerId).lean();
    if (!parentProvider || parentProvider.isDeleted) {
      throw createHttpError(
        'Cannot restore this service because its parent provider profile is deleted or missing. Restore the provider first.',
        409
      );
    }

    service.isDeleted = false;
    service.deletedAt = null;
    service.deletedBy = '';
    service.deleteReason = '';
    service.isActive = true;
    service.publicationStatus = 'DRAFT';
    await service.save();

    return service.toObject ? service.toObject() : service;
  },

  async permanentDeleteService(serviceId) {
    const cleanId = assertValidObjectId(serviceId, 'service');
    const service = await ProviderService.findById(cleanId).lean();
    if (!service) {
      throw createHttpError('Service or package not found', 404);
    }

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      await ProviderService.deleteOne({ _id: service._id }, opts);

      // Keep Provider profile intact; only remove matching title from services summary array
      if (service.providerId && service.title) {
        await Provider.updateOne(
          { _id: service.providerId },
          { $pull: { services: service.title } },
          opts
        );
      }
    });

    return {
      deletedId: String(service._id),
      title: service.title,
      providerId: String(service.providerId),
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MEDIA CLEANUP RECOVERY QUEUE
  // ───────────────────────────────────────────────────────────────────────────
  async listMediaCleanupTasks(status = 'PENDING') {
    const query = status && status !== 'all' ? { status } : {};
    return MediaCleanupTask.find(query).sort({ createdAt: -1 }).limit(100).lean();
  },

  async retryMediaCleanupTask(taskId) {
    const cleanId = assertValidObjectId(taskId, 'media cleanup task');
    const task = await MediaCleanupTask.findById(cleanId);
    if (!task) {
      throw createHttpError('Media cleanup task not found', 404);
    }
    if (task.status === 'COMPLETED') {
      return task.toObject ? task.toObject() : task;
    }

    const res = await storageService.deleteAsset(
      { publicId: task.publicId, url: task.url },
      { retries: 1 }
    );

    task.attempts = (task.attempts || 0) + (res.attempts || 1);
    if (res.success) {
      task.status = 'COMPLETED';
      task.lastError = '';
      task.resolvedAt = new Date();
    } else {
      task.status = 'FAILED';
      task.lastError = res.error || 'Retry failed';
    }
    await task.save();

    return task.toObject ? task.toObject() : task;
  },
};

export default deletionService;
