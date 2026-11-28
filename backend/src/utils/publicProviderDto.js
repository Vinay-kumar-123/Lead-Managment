/**
 * Strict Public Provider DTO Serialization
 *
 * Security policy:
 * Public provider endpoints MUST return an explicit allowlist of display,
 * classification, and SEO fields — never raw Mongoose documents or
 * unrestricted `.lean()` output.
 *
 * Excluded unconditionally:
 * - Auth / Account / Consent: email, googleSub, accountId, providerName,
 *   consentToDisplayPhone
 * - Private Address: address, pinCode
 * - Internal Source / Moderation: sourceApplicationId, sourceReferenceId,
 *   rejectionReason, publicationConsent, publicationStatus, verifiedAt,
 *   searchTokens, locationTokens
 * - Deletion / Audit / Internal DB: isDeleted, deletedAt, deletedBy,
 *   deleteReason, createdAt, updatedAt, __v
 * - Nested media upload/storage metadata: publicId, originalName, mimeType,
 *   size, uploadedAt (across shopImage, logo, coverImage, gallery)
 */

export const PUBLIC_SHOP_IMAGE_ALLOWED_FIELDS = Object.freeze(['url']);

export const PUBLIC_PROVIDER_ALLOWED_FIELDS = Object.freeze([
  '_id',
  'businessName',
  'slug',
  'description',
  'category',
  'categorySlug',
  'subcategory',
  'subcategorySlug',
  'services',
  'keywords',
  'experienceYears',
  'contactNumber',
  'city',
  'state',
  'serviceAreas',
  'website',
  'logo',
  'coverImage',
  'gallery',
  'shopImage',
  'verificationStatus',
  'publishedAt',
  'metaTitle',
  'metaDescription',
  'isDevSample',
]);

export const PUBLIC_PROVIDER_SERVICE_ALLOWED_FIELDS = Object.freeze([
  '_id',
  'title',
  'slug',
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
]);

export const PUBLIC_PROVIDER_SUGGESTION_ALLOWED_FIELDS = Object.freeze([
  'businessName',
  'slug',
  'city',
  'category',
  'subcategory',
]);

/**
 * MongoDB `.select()` projection for single public provider profile fetches.
 * Includes `consentToDisplayPhone` internally so the server can enforce phone
 * masking before `toPublicProviderDto` omits the consent flag itself.
 */
export const PUBLIC_PROVIDER_PROJECTION = [
  ...PUBLIC_PROVIDER_ALLOWED_FIELDS,
  'consentToDisplayPhone',
].join(' ');

/**
 * MongoDB `.select()` projection for search candidate scoring.
 * Includes `consentToDisplayPhone`, `publicationStatus`, `providerName`,
 * `address`, and `pinCode` ONLY for internal server-side gating, phone
 * consent enforcement, relevance, and location-tier scoring inside
 * `providerSearchService`; `toPublicProviderDto` omits all of them before
 * any data leaves the service.
 */
export const PUBLIC_PROVIDER_SEARCH_PROJECTION = [
  ...PUBLIC_PROVIDER_ALLOWED_FIELDS,
  'consentToDisplayPhone',
  'publicationStatus',
  'providerName',
  'address',
  'pinCode',
].join(' ');

/**
 * Safely apply `.select(projection)` to a Mongoose query when supported
 * (defensive against lightweight test mocks that omit `.select()` on findOne).
 */
export function applyPublicProjection(query, projection = PUBLIC_PROVIDER_PROJECTION) {
  if (query && typeof query.select === 'function' && projection) {
    query.select(projection);
  }
  return query;
}

/**
 * Strictly sanitize string arrays (e.g. `deliverables`, `serviceAreas`, `keywords`)
 * so embedded/nested objects or non-string metadata cannot pass through.
 */
export function sanitizePublicStringArray(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Extract a clean URL string from a string or legacy media subdocument,
 * dropping any storage IDs, filenames, MIME types, sizes, or upload metadata.
 */
export function sanitizePublicMediaUrl(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.url === 'string') {
    return value.url;
  }
  return '';
}

/**
 * Strictly allowlist `shopImage` to `{ url }` only.
 */
export function sanitizePublicShopImage(shopImage) {
  if (!shopImage || typeof shopImage !== 'object') {
    return { url: '' };
  }
  return {
    url: sanitizePublicMediaUrl(shopImage),
  };
}

/**
 * Strict allowlist serializer for a public `ProviderService` record.
 */
export function toPublicProviderServiceDto(service) {
  if (!service || typeof service !== 'object') {
    return null;
  }

  const dto = {};
  for (const field of PUBLIC_PROVIDER_SERVICE_ALLOWED_FIELDS) {
    if (service[field] === undefined) continue;

    if (field === 'deliverables' || field === 'serviceAreas') {
      dto[field] = sanitizePublicStringArray(service[field]);
    } else {
      dto[field] = service[field];
    }
  }
  return dto;
}

/**
 * Strict allowlist serializer for a single public `Provider` profile/card.
 */
export function toPublicProviderDto(provider, options = {}) {
  if (!provider || typeof provider !== 'object') {
    return null;
  }

  const canDisplayPhone = provider.consentToDisplayPhone === true;
  const dto = {};

  for (const field of PUBLIC_PROVIDER_ALLOWED_FIELDS) {
    if (field === 'shopImage') {
      dto.shopImage = sanitizePublicShopImage(provider.shopImage);
      continue;
    }

    if (field === 'contactNumber') {
      dto.contactNumber = canDisplayPhone ? (provider.contactNumber ?? null) : null;
      continue;
    }

    if (provider[field] === undefined) {
      continue;
    }

    if (field === 'logo' || field === 'coverImage') {
      dto[field] = sanitizePublicMediaUrl(provider[field]);
    } else if (field === 'gallery') {
      dto.gallery = Array.isArray(provider.gallery)
        ? provider.gallery.map(sanitizePublicMediaUrl).filter(Boolean)
        : [];
    } else if (field === 'services') {
      dto.services = Array.isArray(provider.services)
        ? provider.services
            .map((item) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object') return toPublicProviderServiceDto(item);
              return null;
            })
            .filter((item) => item !== null && item !== '')
        : [];
    } else if (field === 'keywords' || field === 'serviceAreas') {
      dto[field] = sanitizePublicStringArray(provider[field]);
    } else {
      dto[field] = provider[field];
    }
  }

  if (options.searchMeta && typeof options.searchMeta === 'object') {
    dto.searchMeta = {
      relevanceScore: options.searchMeta.relevanceScore,
      matchType: options.searchMeta.matchType,
      locationTier: options.searchMeta.locationTier,
      matchedServices: Array.isArray(options.searchMeta.matchedServices)
        ? [...options.searchMeta.matchedServices]
        : [],
    };
  }

  if (Array.isArray(options.approvedServices)) {
    dto.approvedServices = options.approvedServices
      .map(toPublicProviderServiceDto)
      .filter(Boolean);
  }

  return dto;
}

/**
 * Strict allowlist serializer for provider autocomplete suggestions.
 */
export function toPublicProviderSuggestionDto(provider) {
  if (!provider || typeof provider !== 'object') {
    return null;
  }
  return {
    businessName: typeof provider.businessName === 'string' ? provider.businessName : '',
    slug: typeof provider.slug === 'string' ? provider.slug : '',
    city: typeof provider.city === 'string' ? provider.city : '',
    category: typeof provider.category === 'string' ? provider.category : '',
    subcategory: typeof provider.subcategory === 'string' ? provider.subcategory : '',
  };
}
