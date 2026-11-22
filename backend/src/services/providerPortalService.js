import crypto from 'crypto';
import mongoose from 'mongoose';
import ProviderAccount from '../models/ProviderAccount.js';
import Provider from '../models/Provider.js';
import ProviderService from '../models/ProviderService.js';
import Lead from '../models/Lead.js';
import categoryService, { createSlug, CANONICAL_MAIN_SLUGS } from './categoryService.js';
import { verifyGoogleIdToken } from './googleTokenVerifier.js';
import { generateReferenceId, sanitizeString } from '../utils/referenceId.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const SESSION_DURATION_HOURS = 12;
const phoneRegex = /^[6-9]\d{9}$/;

function createHttpError(message, statusCode = 400, errors = null, code = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  if (code) err.code = code;
  return err;
}

function isDbActive() {
  return (
    mongoose.connection.readyState === 1 ||
    ProviderAccount._isMocked === true ||
    Provider._isMocked === true
  );
}

// In-memory store strictly for non-production development/test mode when MongoDB is disconnected
function createInitialInMemoryPortalStore() {
  return {
    accounts: [],
    providers: [],
    services: [],
    enquiries: [],
    idCounter: 1000,
  };
}

let inMemoryPortal = createInitialInMemoryPortalStore();

function nextInMemObjectId() {
  inMemoryPortal.idCounter += 1;
  return `65f10000000000000000${String(inMemoryPortal.idCounter).padStart(4, '0')}`;
}

function sanitizeAccountForClient(account) {
  if (!account) return null;
  return {
    _id: String(account._id),
    email: account.email,
    emailVerified: Boolean(account.emailVerified),
    name: account.name || '',
    picture: account.picture || '',
    role: 'PROVIDER',
    providerProfileId: account.providerProfileId ? String(account.providerProfileId) : null,
    onboardingCompleted: Boolean(account.onboardingCompleted),
    onboardingDraft: account.onboardingDraft || {},
    lastLoginAt: account.lastLoginAt || null,
    createdAt: account.createdAt || null,
  };
}

function computeProfileCompletion(provider) {
  if (!provider) return { percentage: 0, missingFields: ['Complete Business Profile'] };
  const checks = [
    { key: 'businessName', label: 'Business Name', valid: Boolean(provider.businessName) },
    { key: 'providerName', label: 'Contact Person', valid: Boolean(provider.providerName) },
    { key: 'description', label: 'Business Description', valid: Boolean(provider.description && provider.description.length >= 15) },
    { key: 'categorySlug', label: 'Main Category', valid: Boolean(provider.categorySlug) },
    { key: 'subcategory', label: 'Subcategory', valid: Boolean(provider.subcategory) },
    { key: 'contactNumber', label: 'Mobile Number', valid: Boolean(provider.contactNumber) },
    { key: 'city', label: 'Operating City', valid: Boolean(provider.city) },
    { key: 'address', label: 'Business Address', valid: Boolean(provider.address) },
    { key: 'serviceAreas', label: 'Service Areas', valid: Array.isArray(provider.serviceAreas) && provider.serviceAreas.length > 0 },
    { key: 'shopImage', label: 'Business / Shop Image', valid: Boolean(provider.shopImage?.url) },
  ];

  const completedCount = checks.filter((c) => c.valid).length;
  const percentage = Math.round((completedCount / checks.length) * 100);
  const missingFields = checks.filter((c) => !c.valid).map((c) => c.label);

  return { percentage, missingFields };
}

function sanitizeProviderForClient(provider) {
  if (!provider) return null;
  const raw = provider.toObject ? provider.toObject() : provider;
  const completion = computeProfileCompletion(raw);
  return {
    _id: String(raw._id),
    businessName: raw.businessName || '',
    providerName: raw.providerName || '',
    slug: raw.slug || '',
    description: raw.description || '',
    category: raw.category || '',
    categorySlug: raw.categorySlug || '',
    subcategory: raw.subcategory || '',
    subcategorySlug: raw.subcategorySlug || '',
    services: Array.isArray(raw.services) ? raw.services : [],
    contactNumber: raw.contactNumber || '',
    email: raw.email || '',
    address: raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    pinCode: raw.pinCode || '',
    serviceAreas: Array.isArray(raw.serviceAreas) ? raw.serviceAreas : [],
    website: raw.website || '',
    shopImage: raw.shopImage || { url: '' },
    experienceYears: typeof raw.experienceYears === 'number' ? raw.experienceYears : 0,
    verificationStatus: raw.verificationStatus || 'UNVERIFIED',
    publicationStatus: raw.publicationStatus || 'DRAFT',
    consentToDisplayPhone: raw.consentToDisplayPhone !== false,
    rejectionReason: raw.rejectionReason || '',
    sourceReferenceId: raw.sourceReferenceId || '',
    verifiedAt: raw.verifiedAt || null,
    publishedAt: raw.publishedAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    profileCompletion: completion,
  };
}

function sanitizeServiceForClient(svc) {
  if (!svc) return null;
  const raw = svc.toObject ? svc.toObject() : svc;
  return {
    _id: String(raw._id),
    providerId: String(raw.providerId),
    title: raw.title,
    slug: raw.slug,
    category: raw.category,
    categorySlug: raw.categorySlug,
    subcategory: raw.subcategory || '',
    subcategorySlug: raw.subcategorySlug || '',
    description: raw.description || '',
    shortDescription: raw.shortDescription || '',
    priceLabel: raw.priceLabel || 'Custom Quote',
    priceAmount: raw.priceAmount ?? null,
    pricingModel: raw.pricingModel || 'custom_quote',
    deliverables: Array.isArray(raw.deliverables) ? raw.deliverables : [],
    serviceAreas: Array.isArray(raw.serviceAreas) ? raw.serviceAreas : [],
    estimatedDuration: raw.estimatedDuration || '',
    approvalStatus: raw.approvalStatus || 'PENDING',
    publicationStatus: raw.publicationStatus || 'DRAFT',
    rejectionReason: raw.rejectionReason || '',
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * Validates and extracts strictly allowlisted business profile fields.
 * Prevents mass assignment of ownership, role, verification, or approval status fields.
 */
async function validateAndExtractProfilePayload(rawBody, { isUpdate = false } = {}) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createHttpError('Request body must be a valid JSON object.', 400);
  }

  // Explicitly block attempts to escalate privileges or self-approve via mass assignment
  const forbiddenAttempts = ['role', 'isAdmin', 'verificationStatus', 'verifiedAt', 'googleSub', 'accountId'];
  for (const key of forbiddenAttempts) {
    if (rawBody[key] !== undefined) {
      if (key === 'role' && String(rawBody.role).toUpperCase().includes('ADMIN')) {
        throw createHttpError('Forbidden: Cannot assign administrative role to a provider account.', 403);
      }
      if (key === 'verificationStatus' && rawBody.verificationStatus === 'VERIFIED') {
        throw createHttpError('Forbidden: Providers cannot self-verify their own business profiles.', 403);
      }
    }
  }

  const errors = [];
  const extracted = {};

  // 1. Business Name
  if (!isUpdate || rawBody.businessName !== undefined) {
    const cleanName = sanitizeString(rawBody.businessName);
    if (!cleanName || cleanName.length < 2) {
      errors.push({ field: 'businessName', message: 'Business or enterprise name is required (min 2 characters)' });
    } else if (cleanName.length > 120) {
      errors.push({ field: 'businessName', message: 'Business name cannot exceed 120 characters' });
    } else if (/[<>]/.test(String(rawBody.businessName || ''))) {
      errors.push({ field: 'businessName', message: 'Business name contains invalid characters' });
    } else {
      extracted.businessName = cleanName;
    }
  }

  // 2. Contact Person (accepts contactPerson or providerName)
  const rawContact =
    rawBody.contactPerson !== undefined ? rawBody.contactPerson : rawBody.providerName;
  if (!isUpdate || rawContact !== undefined) {
    const cleanPerson = sanitizeString(rawContact);
    if (!cleanPerson || cleanPerson.length < 2) {
      errors.push({ field: 'contactPerson', message: 'Authorized contact person name is required' });
    } else if (cleanPerson.length > 100) {
      errors.push({ field: 'contactPerson', message: 'Contact person name cannot exceed 100 characters' });
    } else {
      extracted.providerName = cleanPerson;
    }
  }

  // 3. Phone / Contact Number
  const rawPhone =
    rawBody.phone !== undefined ? rawBody.phone : rawBody.contactNumber;
  if (!isUpdate || rawPhone !== undefined) {
    const phoneDigits = String(rawPhone || '').replace(/\D/g, '');
    if (!phoneRegex.test(phoneDigits)) {
      errors.push({ field: 'phone', message: 'A valid 10-digit Indian mobile number is required' });
    } else {
      extracted.contactNumber = phoneDigits;
    }
  }

  // 4. Main Category & Subcategory (validated against Dealsathi's 5 canonical main categories)
  const rawCategory =
    rawBody.category !== undefined ? rawBody.category : rawBody.categorySlug;
  let resolvedMainCat = null;

  if (!isUpdate || rawCategory !== undefined) {
    if (!rawCategory || typeof rawCategory !== 'string' || !rawCategory.trim()) {
      errors.push({ field: 'category', message: 'Please select one of the 5 established main categories' });
    } else {
      try {
        resolvedMainCat = await categoryService.resolveValidMainCategory(rawCategory);
        extracted.category = resolvedMainCat.name;
        extracted.categorySlug = resolvedMainCat.slug;
      } catch (catErr) {
        errors.push({
          field: 'category',
          message: catErr.message || 'Invalid main category. Please choose from the 5 established categories.',
        });
      }
    }
  }

  // Subcategory validation
  const rawSubcategory =
    rawBody.subcategory !== undefined ? rawBody.subcategory : rawBody.subcategorySlug;
  if (rawSubcategory !== undefined && rawSubcategory !== null && String(rawSubcategory).trim() !== '') {
    const cleanSubInput = String(rawSubcategory).trim();
    const publicCats = await categoryService.getPublicCategories();
    const targetMainSlug = extracted.categorySlug || (rawCategory ? String(rawCategory).toLowerCase().trim() : '');
    const mainWithSubs = publicCats.find(
      (c) => c.slug === targetMainSlug || c.name.toLowerCase() === targetMainSlug
    );

    if (mainWithSubs && Array.isArray(mainWithSubs.subcategories)) {
      const matchedSub = mainWithSubs.subcategories.find(
        (s) =>
          s.isActive !== false &&
          (s.slug === cleanSubInput.toLowerCase() ||
            s.name.toLowerCase() === cleanSubInput.toLowerCase() ||
            String(s._id) === cleanSubInput)
      );
      if (!matchedSub) {
        errors.push({
          field: 'subcategory',
          message: `Selected subcategory does not belong to ${mainWithSubs.name} or is inactive.`,
        });
      } else {
        extracted.subcategory = matchedSub.name;
        extracted.subcategorySlug = matchedSub.slug;
      }
    } else {
      extracted.subcategory = sanitizeString(cleanSubInput);
      extracted.subcategorySlug = createSlug(cleanSubInput);
    }
  } else if (!isUpdate) {
    extracted.subcategory = '';
    extracted.subcategorySlug = '';
  }

  // 5. Services Offered
  const rawServices =
    rawBody.servicesOffered !== undefined ? rawBody.servicesOffered : rawBody.services;
  if (!isUpdate || rawServices !== undefined) {
    let cleanServices = [];
    if (Array.isArray(rawServices)) {
      cleanServices = rawServices.map((s) => sanitizeString(s)).filter(Boolean);
    } else if (typeof rawServices === 'string') {
      cleanServices = rawServices
        .split(',')
        .map((s) => sanitizeString(s))
        .filter(Boolean);
    }
    if (cleanServices.length === 0 && extracted.subcategory) {
      cleanServices = [extracted.subcategory];
    }
    if (cleanServices.length === 0) {
      errors.push({
        field: 'servicesOffered',
        message: 'Please specify or select at least one service offered',
      });
    } else {
      extracted.services = Array.from(new Set(cleanServices)).slice(0, 25);
    }
  }

  // 6. City & Location Fields
  if (!isUpdate || rawBody.city !== undefined) {
    const cleanCity = sanitizeString(rawBody.city);
    if (!cleanCity || cleanCity.length < 2) {
      errors.push({ field: 'city', message: 'Operating city is required' });
    } else {
      extracted.city = cleanCity;
    }
  }

  if (rawBody.state !== undefined) {
    extracted.state = sanitizeString(rawBody.state);
  }
  if (rawBody.address !== undefined) {
    extracted.address = sanitizeString(rawBody.address);
  }
  if (rawBody.pinCode !== undefined) {
    const cleanPin = String(rawBody.pinCode || '').trim();
    if (cleanPin && !/^\d{6}$/.test(cleanPin)) {
      errors.push({ field: 'pinCode', message: 'PIN code must be exactly 6 digits' });
    } else {
      extracted.pinCode = cleanPin;
    }
  }

  if (rawBody.serviceAreas !== undefined) {
    let cleanAreas = [];
    if (Array.isArray(rawBody.serviceAreas)) {
      cleanAreas = rawBody.serviceAreas.map((a) => sanitizeString(a)).filter(Boolean);
    } else if (typeof rawBody.serviceAreas === 'string') {
      cleanAreas = rawBody.serviceAreas
        .split(',')
        .map((a) => sanitizeString(a))
        .filter(Boolean);
    }
    extracted.serviceAreas = cleanAreas;
  }

  if (rawBody.website !== undefined) {
    extracted.website = sanitizeString(rawBody.website);
  }

  if (rawBody.experienceYears !== undefined && rawBody.experienceYears !== '') {
    const expNum = Number(rawBody.experienceYears);
    if (Number.isFinite(expNum) && expNum >= 0 && expNum <= 100) {
      extracted.experienceYears = Math.floor(expNum);
    }
  }

  // 7. Business Description
  const rawDesc =
    rawBody.businessDescription !== undefined ? rawBody.businessDescription : rawBody.description;
  if (!isUpdate || rawDesc !== undefined) {
    const cleanDesc = sanitizeString(rawDesc);
    if (!cleanDesc || cleanDesc.length < 15) {
      errors.push({
        field: 'businessDescription',
        message: 'Please provide a business description (at least 15 characters)',
      });
    } else if (cleanDesc.length > 2000) {
      errors.push({
        field: 'businessDescription',
        message: 'Business description cannot exceed 2000 characters',
      });
    } else {
      extracted.description = cleanDesc;
    }
  }

  // 8. Consents
  if (!isUpdate) {
    const isConsent =
      rawBody.consentToContact === true ||
      rawBody.consentToContact === 'true' ||
      rawBody.consentToContact === undefined; // Authenticated provider onboarding implies account consent unless explicitly false
    if (rawBody.consentToContact === false || rawBody.consentToContact === 'false') {
      errors.push({
        field: 'consentToContact',
        message: 'Consent to be contacted for verification is required',
      });
    } else {
      extracted.publicationConsent = Boolean(isConsent);
    }
  }

  if (rawBody.consentToDisplayPhone !== undefined) {
    extracted.consentToDisplayPhone =
      rawBody.consentToDisplayPhone === false || rawBody.consentToDisplayPhone === 'false'
        ? false
        : true;
  } else if (!isUpdate) {
    extracted.consentToDisplayPhone = true;
  }

  if (errors.length > 0) {
    throw createHttpError(errors[0].message, 400, errors);
  }

  return extracted;
}

/**
 * Validates and extracts strictly allowlisted service/package fields.
 */
async function validateAndExtractServicePayload(rawBody, provider, { isUpdate = false } = {}) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createHttpError('Request body must be a valid JSON object.', 400);
  }

  // Prevent provider from self-approving a service or reassigning ownership
  if (rawBody.approvalStatus === 'APPROVED') {
    throw createHttpError(
      'Forbidden: Providers cannot self-approve services. Admin verification is required.',
      403
    );
  }
  if (rawBody.providerId && String(rawBody.providerId) !== String(provider._id)) {
    throw createHttpError('Forbidden: Cannot create or transfer service to another provider.', 403);
  }

  const errors = [];
  const extracted = {};

  // 1. Service Title
  const rawTitle = rawBody.title !== undefined ? rawBody.title : rawBody.name;
  if (!isUpdate || rawTitle !== undefined) {
    const cleanTitle = sanitizeString(rawTitle);
    if (!cleanTitle || cleanTitle.length < 2) {
      errors.push({ field: 'title', message: 'Service or package title is required (min 2 characters)' });
    } else if (cleanTitle.length > 120) {
      errors.push({ field: 'title', message: 'Service title cannot exceed 120 characters' });
    } else if (/[<>]/.test(String(rawTitle || ''))) {
      errors.push({ field: 'title', message: 'Service title contains invalid characters' });
    } else {
      extracted.title = cleanTitle;
    }
  }

  // 2. Category (defaults to provider's main category if not specified)
  const rawCategory =
    rawBody.categorySlug || rawBody.category || (isUpdate ? undefined : provider.categorySlug);
  if (!isUpdate || rawCategory !== undefined) {
    try {
      const mainCat = await categoryService.resolveValidMainCategory(rawCategory);
      extracted.category = mainCat.name;
      extracted.categorySlug = mainCat.slug;
    } catch (err) {
      errors.push({
        field: 'category',
        message: err.message || 'Invalid main category. Choose one of the 5 established verticals.',
      });
    }
  }

  // 3. Subcategory
  if (rawBody.subcategory !== undefined || rawBody.subcategorySlug !== undefined) {
    const rawSub = String(rawBody.subcategory || rawBody.subcategorySlug || '').trim();
    if (!rawSub) {
      extracted.subcategory = '';
      extracted.subcategorySlug = '';
    } else {
      const publicCats = await categoryService.getPublicCategories();
      const targetMainSlug = extracted.categorySlug || provider.categorySlug;
      const mainWithSubs = publicCats.find((c) => c.slug === targetMainSlug);
      const matchedSub = mainWithSubs?.subcategories?.find(
        (s) =>
          s.isActive !== false &&
          (s.slug === rawSub.toLowerCase() || s.name.toLowerCase() === rawSub.toLowerCase())
      );
      if (mainWithSubs && !matchedSub) {
        errors.push({
          field: 'subcategory',
          message: `Subcategory "${rawSub}" is not an active subcategory under ${mainWithSubs.name}.`,
        });
      } else if (matchedSub) {
        extracted.subcategory = matchedSub.name;
        extracted.subcategorySlug = matchedSub.slug;
      } else {
        extracted.subcategory = sanitizeString(rawSub);
        extracted.subcategorySlug = createSlug(rawSub);
      }
    }
  } else if (!isUpdate) {
    extracted.subcategory = provider.subcategory || '';
    extracted.subcategorySlug = provider.subcategorySlug || '';
  }

  // 4. Description
  if (!isUpdate || rawBody.description !== undefined) {
    const cleanDesc = sanitizeString(rawBody.description);
    if (!cleanDesc || cleanDesc.length < 10) {
      errors.push({
        field: 'description',
        message: 'Service description is required (at least 10 characters)',
      });
    } else if (cleanDesc.length > 1500) {
      errors.push({
        field: 'description',
        message: 'Service description cannot exceed 1500 characters',
      });
    } else {
      extracted.description = cleanDesc;
      extracted.shortDescription = sanitizeString(rawBody.shortDescription || cleanDesc.slice(0, 220));
    }
  }

  // 5. Pricing & Deliverables
  if (rawBody.priceLabel !== undefined) {
    extracted.priceLabel = sanitizeString(rawBody.priceLabel).slice(0, 80) || 'Custom Quote';
  } else if (!isUpdate) {
    extracted.priceLabel = 'Custom Quote';
  }

  if (rawBody.priceAmount !== undefined && rawBody.priceAmount !== '' && rawBody.priceAmount !== null) {
    const amount = Number(rawBody.priceAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push({ field: 'priceAmount', message: 'Price amount must be a valid non-negative number' });
    } else {
      extracted.priceAmount = amount;
    }
  }

  const allowedPricingModels = ['custom_quote', 'starting_from', 'fixed_package', 'hourly', 'per_sqft'];
  if (rawBody.pricingModel !== undefined) {
    if (!allowedPricingModels.includes(rawBody.pricingModel)) {
      errors.push({ field: 'pricingModel', message: 'Invalid pricing model' });
    } else {
      extracted.pricingModel = rawBody.pricingModel;
    }
  }

  if (rawBody.deliverables !== undefined) {
    if (Array.isArray(rawBody.deliverables)) {
      extracted.deliverables = rawBody.deliverables.map((d) => sanitizeString(d)).filter(Boolean).slice(0, 15);
    } else if (typeof rawBody.deliverables === 'string') {
      extracted.deliverables = rawBody.deliverables
        .split(',')
        .map((d) => sanitizeString(d))
        .filter(Boolean)
        .slice(0, 15);
    }
  }

  if (rawBody.serviceAreas !== undefined) {
    if (Array.isArray(rawBody.serviceAreas)) {
      extracted.serviceAreas = rawBody.serviceAreas.map((a) => sanitizeString(a)).filter(Boolean).slice(0, 20);
    } else if (typeof rawBody.serviceAreas === 'string') {
      extracted.serviceAreas = rawBody.serviceAreas
        .split(',')
        .map((a) => sanitizeString(a))
        .filter(Boolean)
        .slice(0, 20);
    }
  } else if (!isUpdate) {
    extracted.serviceAreas = Array.isArray(provider.serviceAreas) && provider.serviceAreas.length > 0
      ? provider.serviceAreas
      : [provider.city];
  }

  if (rawBody.estimatedDuration !== undefined) {
    extracted.estimatedDuration = sanitizeString(rawBody.estimatedDuration).slice(0, 80);
  }

  if (rawBody.isActive !== undefined) {
    extracted.isActive = Boolean(rawBody.isActive);
  }

  if (rawBody.publicationStatus !== undefined) {
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(rawBody.publicationStatus)) {
      errors.push({ field: 'publicationStatus', message: 'Invalid publication status' });
    } else {
      extracted.requestedPublicationStatus = rawBody.publicationStatus;
    }
  }

  if (errors.length > 0) {
    throw createHttpError(errors[0].message, 400, errors);
  }

  return extracted;
}

export const providerPortalService = {
  _resetInMemoryStore() {
    inMemoryPortal = createInitialInMemoryPortalStore();
  },

  _getInMemoryStore() {
    return inMemoryPortal;
  },

  /**
   * Authenticates a provider using a Google Identity Services (GIS) ID Token.
   * Implements New vs Returning Provider resolution and safe Account Linking.
   */
  async authenticateWithGoogle(idToken) {
    if (!isDbActive() && env.isProduction) {
      throw createHttpError('Authentication service temporarily unavailable.', 503);
    }

    // 1. Verify Google ID token cryptographically on the backend
    const verified = await verifyGoogleIdToken(idToken);

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
    const now = new Date();

    if (isDbActive()) {
      // Check by immutable Google sub first
      let accountBySub = await ProviderAccount.findOne({ googleSub: verified.sub });
      // Also check by verified email
      let accountByEmail = await ProviderAccount.findOne({ email: verified.email });

      // Prevent account hijacking / conflicting Google sub
      if (accountByEmail && accountByEmail.googleSub !== verified.sub) {
        throw createHttpError(
          'An account with this email is already linked to a different Google identity.',
          409,
          null,
          'GOOGLE_SUB_CONFLICT'
        );
      }

      if (accountBySub && accountBySub.email !== verified.email && accountByEmail) {
        throw createHttpError(
          'Google identity conflict detected with an existing email account.',
          409,
          null,
          'GOOGLE_ACCOUNT_CONFLICT'
        );
      }

      let account = accountBySub || accountByEmail;

      if (account && (account.isDeleted === true || account.isActive === false)) {
        throw createHttpError(
          'This provider account has been deactivated or removed by Dealsathi administration.',
          403,
          null,
          'PROVIDER_ACCOUNT_DISABLED'
        );
      }

      // Check if an existing Provider business profile matches by googleSub or verified email
      let linkedProvider = null;
      if (account?.providerProfileId) {
        linkedProvider = await Provider.findById(account.providerProfileId);
      }
      if (!linkedProvider) {
        const providerBySub = await Provider.findOne({ googleSub: verified.sub });
        const providerByEmail = await Provider.findOne({ email: verified.email });

        if (
          providerByEmail &&
          providerByEmail.googleSub &&
          providerByEmail.googleSub !== verified.sub
        ) {
          throw createHttpError(
            'This business profile email is already bound to a different Google identity.',
            409,
            null,
            'PROVIDER_SUB_CONFLICT'
          );
        }

        linkedProvider = providerBySub || providerByEmail;
      }

      if (linkedProvider && linkedProvider.isDeleted === true) {
        throw createHttpError(
          'This provider business profile has been removed by Dealsathi administration.',
          403,
          null,
          'PROVIDER_PROFILE_DELETED'
        );
      }

      if (!account) {
        // Create new ProviderAccount (or link to existing legacy Provider profile if matched by verified email)
        account = new ProviderAccount({
          googleSub: verified.sub,
          email: verified.email,
          emailVerified: true,
          name: verified.name || linkedProvider?.providerName || '',
          picture: verified.picture || '',
          role: 'PROVIDER',
          providerProfileId: linkedProvider ? linkedProvider._id : null,
          onboardingCompleted: Boolean(linkedProvider),
          sessionToken,
          sessionExpiresAt,
          lastLoginAt: now,
        });
        await account.save();
      } else {
        account.email = verified.email;
        account.emailVerified = true;
        if (verified.name && !account.name) account.name = verified.name;
        if (verified.picture) account.picture = verified.picture;
        if (linkedProvider) {
          account.providerProfileId = linkedProvider._id;
          account.onboardingCompleted = true;
        }
        account.sessionToken = sessionToken;
        account.sessionExpiresAt = sessionExpiresAt;
        account.lastLoginAt = now;
        await account.save();
      }

      // If an existing Provider profile was linked, ensure its googleSub and accountId are set
      if (linkedProvider) {
        let needsSave = false;
        if (!linkedProvider.googleSub) {
          linkedProvider.googleSub = verified.sub;
          needsSave = true;
        }
        if (!linkedProvider.accountId) {
          linkedProvider.accountId = account._id;
          needsSave = true;
        }
        if (needsSave) {
          await linkedProvider.save();
        }
      }

      const onboardingCompleted = Boolean(account.onboardingCompleted && linkedProvider);
      return {
        token: sessionToken,
        expiresAt: sessionExpiresAt,
        durationHours: SESSION_DURATION_HOURS,
        isNewProvider: !onboardingCompleted,
        onboardingCompleted,
        redirectTo: onboardingCompleted
          ? '/provider/dashboard'
          : '/become-a-partner?step=business-profile',
        account: sanitizeAccountForClient(account),
        provider: sanitizeProviderForClient(linkedProvider),
      };
    }

    // In-memory store flow (development / isolated test mode)
    const accBySub = inMemoryPortal.accounts.find((a) => a.googleSub === verified.sub);
    const accByEmail = inMemoryPortal.accounts.find((a) => a.email === verified.email);

    if (accByEmail && accByEmail.googleSub !== verified.sub) {
      throw createHttpError(
        'An account with this email is already linked to a different Google identity.',
        409,
        null,
        'GOOGLE_SUB_CONFLICT'
      );
    }

    let account = accBySub || accByEmail;
    if (account && (account.isDeleted === true || account.isActive === false)) {
      throw createHttpError(
        'This provider account has been deactivated or removed by Dealsathi administration.',
        403,
        null,
        'PROVIDER_ACCOUNT_DISABLED'
      );
    }

    let linkedProvider = null;

    if (account?.providerProfileId) {
      linkedProvider = inMemoryPortal.providers.find(
        (p) => String(p._id) === String(account.providerProfileId)
      );
    }
    if (!linkedProvider) {
      const provBySub = inMemoryPortal.providers.find((p) => p.googleSub === verified.sub);
      const provByEmail = inMemoryPortal.providers.find((p) => p.email === verified.email);

      if (provByEmail && provByEmail.googleSub && provByEmail.googleSub !== verified.sub) {
        throw createHttpError(
          'This business profile email is already bound to a different Google identity.',
          409,
          null,
          'PROVIDER_SUB_CONFLICT'
        );
      }
      linkedProvider = provBySub || provByEmail || null;
    }

    if (linkedProvider && linkedProvider.isDeleted === true) {
      throw createHttpError(
        'This provider business profile has been removed by Dealsathi administration.',
        403,
        null,
        'PROVIDER_PROFILE_DELETED'
      );
    }

    if (!account) {
      account = {
        _id: nextInMemObjectId(),
        googleSub: verified.sub,
        email: verified.email,
        emailVerified: true,
        name: verified.name || linkedProvider?.providerName || '',
        picture: verified.picture || '',
        role: 'PROVIDER',
        providerProfileId: linkedProvider ? String(linkedProvider._id) : null,
        onboardingCompleted: Boolean(linkedProvider),
        onboardingDraft: {},
        sessionToken,
        sessionExpiresAt,
        lastLoginAt: now.toISOString(),
        isActive: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      inMemoryPortal.accounts.push(account);
    } else {
      account.email = verified.email;
      account.emailVerified = true;
      if (verified.name && !account.name) account.name = verified.name;
      if (verified.picture) account.picture = verified.picture;
      if (linkedProvider) {
        account.providerProfileId = String(linkedProvider._id);
        account.onboardingCompleted = true;
      }
      account.sessionToken = sessionToken;
      account.sessionExpiresAt = sessionExpiresAt;
      account.lastLoginAt = now.toISOString();
      account.updatedAt = now.toISOString();
    }

    if (linkedProvider) {
      linkedProvider.googleSub = verified.sub;
      linkedProvider.accountId = String(account._id);
    }

    const onboardingCompleted = Boolean(account.onboardingCompleted && linkedProvider);
    return {
      token: sessionToken,
      expiresAt: sessionExpiresAt,
      durationHours: SESSION_DURATION_HOURS,
      isNewProvider: !onboardingCompleted,
      onboardingCompleted,
      redirectTo: onboardingCompleted
        ? '/provider/dashboard'
        : '/become-a-partner?step=business-profile',
      account: sanitizeAccountForClient(account),
      provider: sanitizeProviderForClient(linkedProvider),
    };
  },

  /**
   * Validates an active provider session token and returns { account, provider }.
   */
  async verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (!cleanToken) return null;

    if (isDbActive()) {
      const account = await ProviderAccount.findOne({
        sessionToken: cleanToken,
        sessionExpiresAt: { $gt: new Date() },
        isActive: { $ne: false },
        isDeleted: { $ne: true },
      });
      if (!account) return null;

      let provider = null;
      if (account.providerProfileId) {
        provider = await Provider.findById(account.providerProfileId);
      }
      if (!provider) {
        provider = await Provider.findOne({
          $or: [{ accountId: account._id }, { googleSub: account.googleSub }],
        });
        if (provider && !provider.isDeleted && !account.providerProfileId) {
          account.providerProfileId = provider._id;
          account.onboardingCompleted = true;
          await account.save();
        }
      }

      if (provider && provider.isDeleted === true) {
        return null;
      }

      return { account, provider };
    }

    const account = inMemoryPortal.accounts.find(
      (a) =>
        a.sessionToken === cleanToken &&
        a.isActive !== false &&
        a.isDeleted !== true &&
        new Date(a.sessionExpiresAt) > new Date()
    );
    if (!account) return null;

    let provider = null;
    if (account.providerProfileId) {
      provider = inMemoryPortal.providers.find(
        (p) => String(p._id) === String(account.providerProfileId)
      );
    }
    if (!provider) {
      provider = inMemoryPortal.providers.find(
        (p) => String(p.accountId) === String(account._id) || p.googleSub === account.googleSub
      );
    }

    if (provider && provider.isDeleted === true) {
      return null;
    }

    return { account, provider };
  },

  /**
   * Invalidates the active provider session token (Logout).
   */
  async logoutSession(account) {
    if (!account) return;
    if (isDbActive() && typeof account.save === 'function') {
      account.sessionToken = null;
      account.sessionExpiresAt = null;
      await account.save();
      return;
    }

    const found = inMemoryPortal.accounts.find((a) => String(a._id) === String(account._id));
    if (found) {
      found.sessionToken = null;
      found.sessionExpiresAt = null;
    }
  },

  /**
   * Saves partial onboarding progress so incomplete onboarding can be resumed safely.
   */
  async saveOnboardingDraft(account, rawDraft = {}) {
    if (!rawDraft || typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
      throw createHttpError('Draft payload must be a valid object.', 400);
    }

    const allowedDraftKeys = [
      'businessName',
      'contactPerson',
      'phone',
      'category',
      'subcategory',
      'servicesOffered',
      'city',
      'state',
      'address',
      'pinCode',
      'serviceAreas',
      'website',
      'businessDescription',
      'experienceYears',
      'consentToDisplayPhone',
    ];

    const cleanDraft = {};
    for (const key of allowedDraftKeys) {
      if (rawDraft[key] !== undefined) {
        if (typeof rawDraft[key] === 'string') {
          cleanDraft[key] = sanitizeString(rawDraft[key]).slice(0, 1500);
        } else if (typeof rawDraft[key] === 'boolean' || typeof rawDraft[key] === 'number') {
          cleanDraft[key] = rawDraft[key];
        }
      }
    }

    if (isDbActive() && typeof account.save === 'function') {
      account.onboardingDraft = {
        ...(account.onboardingDraft || {}),
        ...cleanDraft,
      };
      account.markModified('onboardingDraft');
      await account.save();
      return account.onboardingDraft;
    }

    account.onboardingDraft = {
      ...(account.onboardingDraft || {}),
      ...cleanDraft,
    };
    return account.onboardingDraft;
  },

  /**
   * Completes Step 3: Business Profile Creation for an authenticated provider account.
   * strictly prevents duplicate profiles for the same provider account or Google identity.
   */
  async createOnboardingBusinessProfile(account, rawBody, uploadedImageMeta = null) {
    if (!isDbActive() && env.isProduction) {
      throw createHttpError('Onboarding service temporarily unavailable.', 503);
    }

    // Check if this authenticated account already owns a business profile
    if (isDbActive()) {
      const existingProfile = await Provider.findOne({
        $or: [
          ...(account.providerProfileId ? [{ _id: account.providerProfileId }] : []),
          { accountId: account._id },
          { googleSub: account.googleSub },
          { email: account.email },
        ],
      });

      if (existingProfile) {
        if (!account.onboardingCompleted || !account.providerProfileId) {
          account.providerProfileId = existingProfile._id;
          account.onboardingCompleted = true;
          await account.save();
        }
        throw createHttpError(
          'A business profile already exists for your provider account.',
          409,
          null,
          'DUPLICATE_PROVIDER_PROFILE'
        );
      }
    } else {
      const existingInMem = inMemoryPortal.providers.find(
        (p) =>
          String(p._id) === String(account.providerProfileId) ||
          String(p.accountId) === String(account._id) ||
          p.googleSub === account.googleSub ||
          p.email === account.email
      );
      if (existingInMem) {
        throw createHttpError(
          'A business profile already exists for your provider account.',
          409,
          null,
          'DUPLICATE_PROVIDER_PROFILE'
        );
      }
    }

    const extracted = await validateAndExtractProfilePayload(rawBody, { isUpdate: false });
    const referenceId = generateReferenceId('partner');

    if (isDbActive()) {
      // Generate unique URL slug
      const baseSlug = createSlug(extracted.businessName) || `provider-${Date.now()}`;
      let slug = baseSlug;
      let counter = 1;
      while (await Provider.findOne({ slug })) {
        slug = `${baseSlug}-${counter++}`;
      }

      // 1. Create linked Partner Application Lead so Admin Panel approval workflow remains 100% functional
      const applicationLead = new Lead({
        referenceId,
        type: 'partner',
        name: extracted.providerName,
        contactPerson: extracted.providerName,
        businessName: extracted.businessName,
        phone: extracted.contactNumber,
        email: account.email,
        category: extracted.category,
        service: extracted.subcategory || extracted.services[0] || '',
        servicesOffered: extracted.services,
        city: extracted.city,
        state: extracted.state || '',
        address: extracted.address || '',
        pinCode: extracted.pinCode || '',
        serviceAreas:
          Array.isArray(extracted.serviceAreas) && extracted.serviceAreas.length > 0
            ? extracted.serviceAreas
            : [extracted.city],
        website: extracted.website || '',
        businessDescription: extracted.description,
        shopImage: uploadedImageMeta || {},
        status: 'new',
        consentToContact: true,
        consentToDisplayPhone: extracted.consentToDisplayPhone !== false,
      });
      await applicationLead.save();

      // 2. Create Provider Business Profile linked to authenticated ProviderAccount
      const provider = new Provider({
        accountId: account._id,
        googleSub: account.googleSub,
        businessName: extracted.businessName,
        providerName: extracted.providerName,
        slug,
        description: extracted.description,
        category: extracted.category,
        categorySlug: extracted.categorySlug,
        subcategory: extracted.subcategory || '',
        subcategorySlug: extracted.subcategorySlug || '',
        services: extracted.services,
        contactNumber: extracted.contactNumber,
        email: account.email,
        address: extracted.address || '',
        city: extracted.city,
        state: extracted.state || '',
        pinCode: extracted.pinCode || '',
        serviceAreas:
          Array.isArray(extracted.serviceAreas) && extracted.serviceAreas.length > 0
            ? extracted.serviceAreas
            : [extracted.city],
        website: extracted.website || '',
        shopImage: uploadedImageMeta || {},
        experienceYears: extracted.experienceYears || 0,
        sourceApplicationId: applicationLead._id,
        sourceReferenceId: referenceId,
        verificationStatus: 'UNVERIFIED',
        publicationStatus: 'DRAFT',
        publicationConsent: true,
        consentToDisplayPhone: extracted.consentToDisplayPhone !== false,
      });
      await provider.save();

      // 3. Seed initial ProviderService records from servicesOffered so dashboard is immediately populated
      for (const svcName of extracted.services.slice(0, 10)) {
        const svcSlugBase = createSlug(svcName) || `service-${Date.now()}`;
        try {
          await ProviderService.create({
            providerId: provider._id,
            accountId: account._id,
            title: svcName,
            slug: svcSlugBase,
            category: extracted.category,
            categorySlug: extracted.categorySlug,
            subcategory: extracted.subcategory || svcName,
            subcategorySlug: extracted.subcategorySlug || createSlug(svcName),
            description: `${svcName} services provided by ${extracted.businessName} in ${extracted.city}.`,
            shortDescription: `${svcName} by ${extracted.businessName}`,
            priceLabel: 'Custom Quote',
            pricingModel: 'custom_quote',
            serviceAreas: provider.serviceAreas,
            approvalStatus: 'PENDING',
            publicationStatus: 'DRAFT',
            isActive: true,
          });
        } catch {
          // Ignore duplicate initial service slugs
        }
      }

      // 4. Mark account onboarding completed
      account.providerProfileId = provider._id;
      account.onboardingCompleted = true;
      account.onboardingDraft = {};
      if (!account.name) account.name = extracted.providerName;
      await account.save();

      return {
        account: sanitizeAccountForClient(account),
        provider: sanitizeProviderForClient(provider),
        referenceId,
      };
    }

    // In-memory store implementation
    const baseSlug = createSlug(extracted.businessName) || `provider-${Date.now()}`;
    let slug = baseSlug;
    let counter = 1;
    while (inMemoryPortal.providers.some((p) => p.slug === slug)) {
      slug = `${baseSlug}-${counter++}`;
    }

    const now = new Date().toISOString();
    const providerId = nextInMemObjectId();
    const newProvider = {
      _id: providerId,
      accountId: String(account._id),
      googleSub: account.googleSub,
      businessName: extracted.businessName,
      providerName: extracted.providerName,
      slug,
      description: extracted.description,
      category: extracted.category,
      categorySlug: extracted.categorySlug,
      subcategory: extracted.subcategory || '',
      subcategorySlug: extracted.subcategorySlug || '',
      services: extracted.services,
      contactNumber: extracted.contactNumber,
      email: account.email,
      address: extracted.address || '',
      city: extracted.city,
      state: extracted.state || '',
      pinCode: extracted.pinCode || '',
      serviceAreas:
        Array.isArray(extracted.serviceAreas) && extracted.serviceAreas.length > 0
          ? extracted.serviceAreas
          : [extracted.city],
      website: extracted.website || '',
      shopImage: uploadedImageMeta || { url: '' },
      experienceYears: extracted.experienceYears || 0,
      sourceReferenceId: referenceId,
      verificationStatus: 'UNVERIFIED',
      publicationStatus: 'DRAFT',
      publicationConsent: true,
      consentToDisplayPhone: extracted.consentToDisplayPhone !== false,
      rejectionReason: '',
      createdAt: now,
      updatedAt: now,
    };
    inMemoryPortal.providers.push(newProvider);

    // Seed initial ProviderService records in memory
    const seenSlugs = new Set();
    for (const svcName of extracted.services.slice(0, 10)) {
      const svcSlug = createSlug(svcName);
      if (!svcSlug || seenSlugs.has(svcSlug)) continue;
      seenSlugs.add(svcSlug);

      inMemoryPortal.services.push({
        _id: nextInMemObjectId(),
        providerId,
        accountId: String(account._id),
        title: svcName,
        slug: svcSlug,
        category: extracted.category,
        categorySlug: extracted.categorySlug,
        subcategory: extracted.subcategory || svcName,
        subcategorySlug: extracted.subcategorySlug || svcSlug,
        description: `${svcName} services provided by ${extracted.businessName} in ${extracted.city}.`,
        shortDescription: `${svcName} by ${extracted.businessName}`,
        priceLabel: 'Custom Quote',
        priceAmount: null,
        pricingModel: 'custom_quote',
        deliverables: [],
        serviceAreas: newProvider.serviceAreas,
        estimatedDuration: '',
        approvalStatus: 'PENDING',
        publicationStatus: 'DRAFT',
        rejectionReason: '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    account.providerProfileId = providerId;
    account.onboardingCompleted = true;
    account.onboardingDraft = {};
    if (!account.name) account.name = extracted.providerName;
    account.updatedAt = now;

    return {
      account: sanitizeAccountForClient(account),
      provider: sanitizeProviderForClient(newProvider),
      referenceId,
    };
  },

  /**
   * Updates an existing provider's business profile (strictly scoped to the authenticated provider).
   */
  async updateBusinessProfile(account, provider, rawBody, uploadedImageMeta = null) {
    if (!provider) {
      throw createHttpError('Business profile not found. Please complete onboarding first.', 404);
    }

    // Strict ownership verification
    const ownsProfile =
      (provider.accountId && String(provider.accountId) === String(account._id)) ||
      (provider.googleSub && provider.googleSub === account.googleSub) ||
      (account.providerProfileId && String(account.providerProfileId) === String(provider._id));

    if (!ownsProfile) {
      throw createHttpError('Forbidden: You do not have permission to modify this business profile.', 403);
    }

    const extracted = await validateAndExtractProfilePayload(rawBody, { isUpdate: true });

    const updatableKeys = [
      'businessName',
      'providerName',
      'description',
      'category',
      'categorySlug',
      'subcategory',
      'subcategorySlug',
      'services',
      'contactNumber',
      'address',
      'city',
      'state',
      'pinCode',
      'serviceAreas',
      'website',
      'experienceYears',
      'consentToDisplayPhone',
    ];

    for (const key of updatableKeys) {
      if (extracted[key] !== undefined) {
        provider[key] = extracted[key];
      }
    }

    if (uploadedImageMeta && uploadedImageMeta.url) {
      provider.shopImage = uploadedImageMeta;
    }

    if (isDbActive() && typeof provider.save === 'function') {
      await provider.save();
    } else {
      provider.updatedAt = new Date().toISOString();
    }

    return sanitizeProviderForClient(provider);
  },

  /**
   * Returns real database-backed dashboard statistics, recent services, and recent enquiries
   * strictly for the authenticated provider.
   */
  async getDashboardOverview(account, provider) {
    if (!provider) {
      return {
        account: sanitizeAccountForClient(account),
        provider: null,
        onboardingCompleted: false,
        stats: {
          totalServices: 0,
          activeServices: 0,
          pendingApproval: 0,
          approvedServices: 0,
          rejectedServices: 0,
          draftServices: 0,
          totalEnquiries: 0,
        },
        recentServices: [],
        recentEnquiries: [],
      };
    }

    if (isDbActive()) {
      const [allServices, enquiries] = await Promise.all([
        ProviderService.find({ providerId: provider._id, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 })
          .lean(),
        Lead.find({
          type: 'enquiry',
          assignedProviderId: provider._id,
          isDeleted: { $ne: true },
        })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      // If legacy provider has services in provider.services[] but 0 documents in ProviderService, sync them
      let servicesList = allServices;
      if (
        servicesList.length === 0 &&
        Array.isArray(provider.services) &&
        provider.services.length > 0
      ) {
        const defaultApproval =
          provider.verificationStatus === 'VERIFIED' ? 'APPROVED' : 'PENDING';
        const defaultPub =
          provider.publicationStatus === 'PUBLISHED' && defaultApproval === 'APPROVED'
            ? 'PUBLISHED'
            : 'DRAFT';

        const createdDocs = [];
        for (const svcName of provider.services.slice(0, 10)) {
          const slug = createSlug(svcName);
          if (!slug) continue;
          try {
            const doc = await ProviderService.create({
              providerId: provider._id,
              accountId: account._id,
              title: svcName,
              slug,
              category: provider.category,
              categorySlug: provider.categorySlug,
              subcategory: provider.subcategory || svcName,
              subcategorySlug: provider.subcategorySlug || slug,
              description: `${svcName} services by ${provider.businessName} in ${provider.city}.`,
              shortDescription: `${svcName} by ${provider.businessName}`,
              priceLabel: 'Custom Quote',
              serviceAreas: provider.serviceAreas,
              approvalStatus: defaultApproval,
              publicationStatus: defaultPub,
              isActive: true,
            });
            createdDocs.push(doc.toObject ? doc.toObject() : doc);
          } catch {
            // Ignore collision
          }
        }
        servicesList = createdDocs;
      }

      const totalServices = servicesList.length;
      const approvedServices = servicesList.filter((s) => s.approvalStatus === 'APPROVED').length;
      const pendingApproval = servicesList.filter((s) => s.approvalStatus === 'PENDING').length;
      const rejectedServices = servicesList.filter((s) => s.approvalStatus === 'REJECTED').length;
      const activeServices = servicesList.filter(
        (s) => s.isActive !== false && s.publicationStatus === 'PUBLISHED'
      ).length;
      const draftServices = servicesList.filter((s) => s.publicationStatus === 'DRAFT').length;

      return {
        account: sanitizeAccountForClient(account),
        provider: sanitizeProviderForClient(provider),
        onboardingCompleted: true,
        stats: {
          totalServices,
          activeServices,
          pendingApproval,
          approvedServices,
          rejectedServices,
          draftServices,
          totalEnquiries: enquiries.length,
        },
        recentServices: servicesList.slice(0, 10).map(sanitizeServiceForClient),
        recentEnquiries: enquiries.slice(0, 5),
      };
    }

    // In-memory store calculation
    const servicesList = inMemoryPortal.services
      .filter((s) => String(s.providerId) === String(provider._id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const enquiries = inMemoryPortal.enquiries
      .filter((e) => String(e.assignedProviderId) === String(provider._id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalServices = servicesList.length;
    const approvedServices = servicesList.filter((s) => s.approvalStatus === 'APPROVED').length;
    const pendingApproval = servicesList.filter((s) => s.approvalStatus === 'PENDING').length;
    const rejectedServices = servicesList.filter((s) => s.approvalStatus === 'REJECTED').length;
    const activeServices = servicesList.filter(
      (s) => s.isActive !== false && s.publicationStatus === 'PUBLISHED'
    ).length;
    const draftServices = servicesList.filter((s) => s.publicationStatus === 'DRAFT').length;

    return {
      account: sanitizeAccountForClient(account),
      provider: sanitizeProviderForClient(provider),
      onboardingCompleted: true,
      stats: {
        totalServices,
        activeServices,
        pendingApproval,
        approvedServices,
        rejectedServices,
        draftServices,
        totalEnquiries: enquiries.length,
      },
      recentServices: servicesList.slice(0, 10).map(sanitizeServiceForClient),
      recentEnquiries: enquiries.slice(0, 5),
    };
  },

  /**
   * Lists all services/packages belonging strictly to the authenticated provider.
   */
  async getProviderServices(account, provider, { status = 'all', search = '' } = {}) {
    if (!provider) {
      throw createHttpError('Please complete your business profile first.', 400);
    }

    let list = [];
    if (isDbActive()) {
      list = await ProviderService.find({ providerId: provider._id, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .lean();
    } else {
      list = inMemoryPortal.services
        .filter((s) => String(s.providerId) === String(provider._id) && s.isDeleted !== true)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    let formatted = list.map(sanitizeServiceForClient);

    if (status && status !== 'all') {
      const upper = String(status).toUpperCase();
      if (['PENDING', 'APPROVED', 'REJECTED'].includes(upper)) {
        formatted = formatted.filter((s) => s.approvalStatus === upper);
      } else if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(upper)) {
        formatted = formatted.filter((s) => s.publicationStatus === upper);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      formatted = formatted.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          (s.subcategory && s.subcategory.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }

    return formatted;
  },

  /**
   * Creates a new service/package owned by the authenticated provider.
   */
  async createProviderService(account, provider, rawBody) {
    if (!provider) {
      throw createHttpError('Please complete your business profile before creating services.', 400);
    }

    const extracted = await validateAndExtractServicePayload(rawBody, provider, { isUpdate: false });
    const baseSlug = createSlug(extracted.title);
    if (!baseSlug) {
      throw createHttpError('Service title must contain valid alphanumeric characters.', 400);
    }

    if (isDbActive()) {
      const existingDup = await ProviderService.findOne({
        providerId: provider._id,
        slug: baseSlug,
      }).lean();

      if (existingDup) {
        throw createHttpError(
          `You already have a service or package named "${extracted.title}".`,
          409
        );
      }

      const newSvc = new ProviderService({
        providerId: provider._id,
        accountId: account._id,
        title: extracted.title,
        slug: baseSlug,
        category: extracted.category,
        categorySlug: extracted.categorySlug,
        subcategory: extracted.subcategory || '',
        subcategorySlug: extracted.subcategorySlug || '',
        description: extracted.description,
        shortDescription: extracted.shortDescription,
        priceLabel: extracted.priceLabel || 'Custom Quote',
        priceAmount: extracted.priceAmount ?? null,
        pricingModel: extracted.pricingModel || 'custom_quote',
        deliverables: extracted.deliverables || [],
        serviceAreas: extracted.serviceAreas || [provider.city],
        estimatedDuration: extracted.estimatedDuration || '',
        approvalStatus: 'PENDING',
        publicationStatus: 'DRAFT',
        isActive: extracted.isActive !== false,
      });

      const saved = await newSvc.save();

      // Sync service title into provider.services array if not already present
      if (Array.isArray(provider.services) && !provider.services.includes(extracted.title)) {
        provider.services.push(extracted.title);
        if (typeof provider.save === 'function') {
          await provider.save();
        }
      }

      return sanitizeServiceForClient(saved);
    }

    const dupInMem = inMemoryPortal.services.find(
      (s) => String(s.providerId) === String(provider._id) && s.slug === baseSlug
    );
    if (dupInMem) {
      throw createHttpError(
        `You already have a service or package named "${extracted.title}".`,
        409
      );
    }

    const now = new Date().toISOString();
    const created = {
      _id: nextInMemObjectId(),
      providerId: String(provider._id),
      accountId: String(account._id),
      title: extracted.title,
      slug: baseSlug,
      category: extracted.category,
      categorySlug: extracted.categorySlug,
      subcategory: extracted.subcategory || '',
      subcategorySlug: extracted.subcategorySlug || '',
      description: extracted.description,
      shortDescription: extracted.shortDescription,
      priceLabel: extracted.priceLabel || 'Custom Quote',
      priceAmount: extracted.priceAmount ?? null,
      pricingModel: extracted.pricingModel || 'custom_quote',
      deliverables: extracted.deliverables || [],
      serviceAreas: extracted.serviceAreas || [provider.city],
      estimatedDuration: extracted.estimatedDuration || '',
      approvalStatus: 'PENDING',
      publicationStatus: 'DRAFT',
      rejectionReason: '',
      isActive: extracted.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryPortal.services.push(created);
    if (Array.isArray(provider.services) && !provider.services.includes(extracted.title)) {
      provider.services.push(extracted.title);
    }

    return sanitizeServiceForClient(created);
  },

  /**
   * Updates a service/package owned strictly by the authenticated provider.
   */
  async updateProviderService(account, provider, serviceId, rawBody) {
    if (!provider) {
      throw createHttpError('Business profile not found.', 404);
    }

    const cleanId = String(serviceId || '').trim();
    if (!cleanId) {
      throw createHttpError('Service ID is required.', 400);
    }

    const extracted = await validateAndExtractServicePayload(rawBody, provider, { isUpdate: true });

    if (isDbActive()) {
      if (!mongoose.Types.ObjectId.isValid(cleanId)) {
        throw createHttpError('Invalid service identifier format.', 400);
      }

      const svc = await ProviderService.findById(cleanId);
      if (!svc) {
        throw createHttpError('Service or package not found.', 404);
      }

      // Strict ownership check — never allow modifying another provider's service
      if (String(svc.providerId) !== String(provider._id)) {
        throw createHttpError(
          'Forbidden: You can only view or modify your own services and packages.',
          403
        );
      }

      if (extracted.title !== undefined) {
        const nextSlug = createSlug(extracted.title);
        const dup = await ProviderService.findOne({
          providerId: provider._id,
          slug: nextSlug,
          _id: { $ne: svc._id },
        }).lean();
        if (dup) {
          throw createHttpError(`Another service with title "${extracted.title}" already exists.`, 409);
        }
        svc.title = extracted.title;
        svc.slug = nextSlug;
      }

      const fields = [
        'category',
        'categorySlug',
        'subcategory',
        'subcategorySlug',
        'description',
        'shortDescription',
        'priceLabel',
        'priceAmount',
        'pricingModel',
        'deliverables',
        'serviceAreas',
        'estimatedDuration',
        'isActive',
      ];
      for (const f of fields) {
        if (extracted[f] !== undefined) {
          svc[f] = extracted[f];
        }
      }

      // Enforce publishing lifecycle: a service can only be set to PUBLISHED if it is APPROVED
      if (extracted.requestedPublicationStatus !== undefined) {
        if (
          extracted.requestedPublicationStatus === 'PUBLISHED' &&
          svc.approvalStatus !== 'APPROVED'
        ) {
          throw createHttpError(
            'This service cannot be published until it has been approved by Dealsathi operations.',
            400
          );
        }
        svc.publicationStatus = extracted.requestedPublicationStatus;
      }

      await svc.save();
      return sanitizeServiceForClient(svc);
    }

    // In-memory store update
    const svc = inMemoryPortal.services.find((s) => String(s._id) === cleanId);
    if (!svc) {
      throw createHttpError('Service or package not found.', 404);
    }

    if (String(svc.providerId) !== String(provider._id)) {
      throw createHttpError(
        'Forbidden: You can only view or modify your own services and packages.',
        403
      );
    }

    if (extracted.title !== undefined) {
      const nextSlug = createSlug(extracted.title);
      const dup = inMemoryPortal.services.find(
        (s) =>
          String(s.providerId) === String(provider._id) &&
          s.slug === nextSlug &&
          String(s._id) !== String(svc._id)
      );
      if (dup) {
        throw createHttpError(`Another service with title "${extracted.title}" already exists.`, 409);
      }
      svc.title = extracted.title;
      svc.slug = nextSlug;
    }

    const fields = [
      'category',
      'categorySlug',
      'subcategory',
      'subcategorySlug',
      'description',
      'shortDescription',
      'priceLabel',
      'priceAmount',
      'pricingModel',
      'deliverables',
      'serviceAreas',
      'estimatedDuration',
      'isActive',
    ];
    for (const f of fields) {
      if (extracted[f] !== undefined) {
        svc[f] = extracted[f];
      }
    }

    if (extracted.requestedPublicationStatus !== undefined) {
      if (
        extracted.requestedPublicationStatus === 'PUBLISHED' &&
        svc.approvalStatus !== 'APPROVED'
      ) {
        throw createHttpError(
          'This service cannot be published until it has been approved by Dealsathi operations.',
          400
        );
      }
      svc.publicationStatus = extracted.requestedPublicationStatus;
    }

    svc.updatedAt = new Date().toISOString();
    return sanitizeServiceForClient(svc);
  },

  /**
   * Deletes/archives a service owned strictly by the authenticated provider.
   */
  async deleteProviderService(account, provider, serviceId) {
    if (!provider) {
      throw createHttpError('Business profile not found.', 404);
    }
    const cleanId = String(serviceId || '').trim();

    if (isDbActive()) {
      if (!mongoose.Types.ObjectId.isValid(cleanId)) {
        throw createHttpError('Invalid service identifier format.', 400);
      }
      const svc = await ProviderService.findById(cleanId);
      if (!svc) {
        throw createHttpError('Service or package not found.', 404);
      }
      if (String(svc.providerId) !== String(provider._id)) {
        throw createHttpError('Forbidden: You can only delete your own services.', 403);
      }
      await ProviderService.deleteOne({ _id: svc._id });
      return { deletedId: String(svc._id) };
    }

    const idx = inMemoryPortal.services.findIndex((s) => String(s._id) === cleanId);
    if (idx === -1) {
      throw createHttpError('Service or package not found.', 404);
    }
    if (String(inMemoryPortal.services[idx].providerId) !== String(provider._id)) {
      throw createHttpError('Forbidden: You can only delete your own services.', 403);
    }
    const [removed] = inMemoryPortal.services.splice(idx, 1);
    return { deletedId: String(removed._id) };
  },

  /**
   * Lists customer enquiries strictly assigned to the authenticated provider.
   * Prevents providers from accessing other providers' private enquiries.
   */
  async getProviderEnquiries(account, provider) {
    if (!provider) {
      return [];
    }

    if (isDbActive()) {
      const enquiries = await Lead.find({
        type: 'enquiry',
        assignedProviderId: provider._id,
        isDeleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .select(
          'referenceId name phone email category service city location requirements estimatedBudget expectedTimeline status createdAt updatedAt'
        )
        .lean();
      return enquiries;
    }

    return inMemoryPortal.enquiries
      .filter((e) => String(e.assignedProviderId) === String(provider._id) && e.isDeleted !== true)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
};

export default providerPortalService;
