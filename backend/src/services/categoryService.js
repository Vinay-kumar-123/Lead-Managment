import mongoose from 'mongoose';
import Category from '../models/Category.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

export function createSlug(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeCategoryName(text) {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ');
}

export function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const CANONICAL_MAIN_CATEGORIES = [
  {
    id: 'home-construction',
    slug: 'home-construction',
    name: 'Home & Construction',
    description:
      'Connect with verified professionals for interior design, renovation, construction, painting, plumbing, and home improvement needs.',
    shortDescription: 'Interior design, renovation, painting & plumbing',
    icon: 'Home',
    color: '#012A7A',
    bgColor: '#EEF3FF',
    displayOrder: 1,
    popularServices: ['Interior Design', 'Home Renovation', 'Modular Kitchen', 'Painting', 'Plumbing'],
    metaTitle: 'Home & Construction Services — Dealsathi',
    metaDescription:
      'Find verified interior designers, renovation contractors, painters, and plumbers across India on Dealsathi.',
    subcategories: [
      {
        id: 'interior-design',
        slug: 'interior-design',
        name: 'Interior Design',
        description: 'Transform living and work spaces with experienced interior designers.',
        displayOrder: 1,
      },
      {
        id: 'home-renovation',
        slug: 'home-renovation',
        name: 'Home Renovation',
        description: 'Full home renovation, bathroom and kitchen remodeling contractors.',
        displayOrder: 2,
      },
      {
        id: 'construction',
        slug: 'construction',
        name: 'Construction',
        description: 'Residential and commercial structural civil construction services.',
        displayOrder: 3,
      },
      {
        id: 'painting',
        slug: 'painting',
        name: 'Painting',
        description: 'Interior, exterior, waterproof, and decorative painting services.',
        displayOrder: 4,
      },
      {
        id: 'plumbing',
        slug: 'plumbing',
        name: 'Plumbing',
        description: 'Plumbing installation, sanitary fittings, repair, and pipeline maintenance.',
        displayOrder: 5,
      },
    ],
  },
  {
    id: 'events-lifestyle',
    slug: 'events-lifestyle',
    name: 'Events & Lifestyle',
    description:
      'Discover professionals for weddings, candid photography, luxury event decoration, and personalized lifestyle services.',
    shortDescription: 'Wedding planning, photography & event decoration',
    icon: 'Camera',
    color: '#FF6A03',
    bgColor: '#FFF4ED',
    displayOrder: 2,
    popularServices: ['Wedding Planning', 'Photography', 'Event Decoration', 'Catering', 'DJ & Entertainment'],
    metaTitle: 'Events & Lifestyle Services — Dealsathi',
    metaDescription:
      'Connect with trusted wedding planners, candid photographers, and event decorators across India on Dealsathi.',
    subcategories: [
      {
        id: 'wedding-planning',
        slug: 'wedding-planning',
        name: 'Wedding Planning',
        description: 'Full-service wedding planners, destination coordinators, and managers.',
        displayOrder: 1,
      },
      {
        id: 'photography',
        slug: 'photography',
        name: 'Photography',
        description: 'Candid wedding, pre-wedding, maternity, and corporate event photographers.',
        displayOrder: 2,
      },
      {
        id: 'event-decoration',
        slug: 'event-decoration',
        name: 'Event Decoration',
        description: 'Creative stage, floral, lighting, and theme decoration services.',
        displayOrder: 3,
      },
      {
        id: 'lifestyle-services',
        slug: 'lifestyle-services',
        name: 'Lifestyle Services',
        description: 'Personal styling, fitness wellness consulting, and personal care services.',
        displayOrder: 4,
      },
    ],
  },
  {
    id: 'business-property',
    slug: 'business-property',
    name: 'Business & Property',
    description:
      'Professional support for commercial property leasing, property advisory, and company business services.',
    shortDescription: 'Commercial property & business support services',
    icon: 'Building2',
    color: '#014EBA',
    bgColor: '#EFF6FF',
    displayOrder: 3,
    popularServices: [
      'Commercial Office Space',
      'Property Verification',
      'Company Incorporation',
      'GST & Accounting Advisory',
    ],
    metaTitle: 'Business & Property Services — Dealsathi',
    metaDescription:
      'Find commercial property consultants and qualified business service providers on Dealsathi.',
    subcategories: [
      {
        id: 'commercial-property',
        slug: 'commercial-property',
        name: 'Commercial Property',
        description: 'Office spaces, retail shops, co-working spaces, and commercial leasing.',
        displayOrder: 1,
      },
      {
        id: 'property-services',
        slug: 'property-services',
        name: 'Property Services',
        description: 'Property verification, documentation, valuation, and advisory.',
        displayOrder: 2,
      },
      {
        id: 'business-services',
        slug: 'business-services',
        name: 'Business Services',
        description: 'Business registration, accounting, CA/CS, compliance, and consulting.',
        displayOrder: 3,
      },
    ],
  },
  {
    id: 'digital-professional',
    slug: 'digital-professional',
    name: 'Digital & Professional Services',
    description:
      'Connect with software engineers, website developers, performance marketers, and specialized professional service agencies.',
    shortDescription: 'Website development, software & digital marketing',
    icon: 'Monitor',
    color: '#013696',
    bgColor: '#EEF3FF',
    displayOrder: 4,
    popularServices: [
      'Website Development',
      'SEO Optimization',
      'Mobile App Development',
      'Performance Marketing',
    ],
    metaTitle: 'Digital & Professional Services — Dealsathi',
    metaDescription:
      'Find top web developers, digital marketing specialists, and professional consultants on Dealsathi.',
    subcategories: [
      {
        id: 'website-development',
        slug: 'website-development',
        name: 'Website Development',
        description: 'Custom responsive websites, landing pages, and web portals.',
        displayOrder: 1,
      },
      {
        id: 'software-development',
        slug: 'software-development',
        name: 'Software Development',
        description: 'Custom SaaS, mobile applications, and backend engineering.',
        displayOrder: 2,
      },
      {
        id: 'digital-marketing',
        slug: 'digital-marketing',
        name: 'Digital Marketing',
        description: 'SEO optimization, Google/Meta Ads, content marketing, and brand growth.',
        displayOrder: 3,
      },
      {
        id: 'professional-services',
        slug: 'professional-services',
        name: 'Professional Services',
        description: 'Legal drafting, trademark filing, recruitment, and management consulting.',
        displayOrder: 4,
      },
    ],
  },
  {
    id: 'education-career',
    slug: 'education-career',
    name: 'Education & Career',
    description:
      'Explore professional training programs, career guidance mentorship, internship pathways, and educational services.',
    shortDescription: 'Professional training, internships & career guidance',
    icon: 'GraduationCap',
    color: '#E55800',
    bgColor: '#FFF4ED',
    displayOrder: 5,
    popularServices: [
      'Career Guidance & Mentorship',
      'Digital Skills Training',
      'Internship Programs',
      'Study Abroad Advisory',
    ],
    metaTitle: 'Education & Career Services — Dealsathi',
    metaDescription:
      'Discover professional skill training, internships, and career guidance programs on Dealsathi.',
    subcategories: [
      {
        id: 'training',
        slug: 'training',
        name: 'Training',
        description: 'Executive upskilling, technical bootcamps, and professional certifications.',
        displayOrder: 1,
      },
      {
        id: 'internships',
        slug: 'internships',
        name: 'Internships',
        description: 'Verified industry internship pathways for students and graduates.',
        displayOrder: 2,
      },
      {
        id: 'career-guidance',
        slug: 'career-guidance',
        name: 'Career Guidance',
        description: 'Personalized career counselling, resume audits, and interview preparation.',
        displayOrder: 3,
      },
      {
        id: 'educational-services',
        slug: 'educational-services',
        name: 'Educational Services',
        description: 'Higher education admissions guidance, test prep, and coaching.',
        displayOrder: 4,
      },
    ],
  },
];

export const CANONICAL_MAIN_SLUGS = CANONICAL_MAIN_CATEGORIES.map((c) => c.slug);

// Deterministic ObjectIds for the 5 canonical main categories in in-memory fallback mode
const INMEM_MAIN_IDS = {
  'home-construction': '65f000000000000000000001',
  'events-lifestyle': '65f000000000000000000002',
  'business-property': '65f000000000000000000003',
  'digital-professional': '65f000000000000000000004',
  'education-career': '65f000000000000000000005',
};

function buildInitialInMemoryStore() {
  const mains = [];
  const subs = [];
  let subCounter = 1;
  const now = new Date().toISOString();

  for (const cat of CANONICAL_MAIN_CATEGORIES) {
    const mainId = INMEM_MAIN_IDS[cat.slug];
    mains.push({
      _id: mainId,
      id: cat.slug,
      name: cat.name,
      normalizedName: cat.name.toLowerCase(),
      slug: cat.slug,
      description: cat.description,
      shortDescription: cat.shortDescription,
      parentCategory: null,
      parentSlug: null,
      parentName: null,
      isMain: true,
      isActive: true,
      icon: cat.icon,
      color: cat.color,
      bgColor: cat.bgColor,
      displayOrder: cat.displayOrder,
      popularServices: [...cat.popularServices],
      metaTitle: cat.metaTitle,
      metaDescription: cat.metaDescription,
      createdAt: now,
      updatedAt: now,
    });

    for (const sub of cat.subcategories) {
      const subId = `65f0000000000000000001${String(subCounter++).padStart(2, '0')}`;
      subs.push({
        _id: subId,
        id: sub.slug,
        name: sub.name,
        normalizedName: sub.name.toLowerCase(),
        slug: sub.slug,
        description: sub.description,
        shortDescription: sub.description,
        parentCategory: mainId,
        parentSlug: cat.slug,
        parentName: cat.name,
        isMain: false,
        isActive: true,
        icon: 'Layers',
        displayOrder: sub.displayOrder,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { mains, subs, nextIdCounter: 200 };
}

let inMemoryStore = buildInitialInMemoryStore();
let seedingPromise = null;
let isSeeded = false;

function createHttpError(message, statusCode = 400, errors = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
}

function isDbActive() {
  return mongoose.connection.readyState === 1 || Category._isMocked === true;
}

/**
 * Formats a subcategory document for consistent API output
 */
function formatSubcategory(sub) {
  if (!sub) return null;
  return {
    _id: String(sub._id),
    id: sub.slug,
    name: sub.name,
    slug: sub.slug,
    description: sub.description || '',
    shortDescription: sub.shortDescription || sub.description || '',
    parentCategory: sub.parentCategory ? String(sub.parentCategory) : null,
    parentSlug: sub.parentSlug || null,
    parentName: sub.parentName || null,
    isMain: false,
    isActive: sub.isActive !== false,
    icon: sub.icon || 'Layers',
    displayOrder: typeof sub.displayOrder === 'number' ? sub.displayOrder : 0,
    createdAt: sub.createdAt || null,
    updatedAt: sub.updatedAt || null,
  };
}

/**
 * Formats a main category document with its nested subcategories
 */
function formatMainCategory(main, subDocs = [], { onlyActiveSubs = false } = {}) {
  const canonical = CANONICAL_MAIN_CATEGORIES.find((c) => c.slug === main.slug) || {};
  const matchingSubs = subDocs
    .filter((s) => {
      const sameParent =
        (s.parentCategory && String(s.parentCategory) === String(main._id)) ||
        s.parentSlug === main.slug;
      if (!sameParent) return false;
      if (onlyActiveSubs && s.isActive === false) return false;
      return true;
    })
    .sort((a, b) => {
      const orderDiff = (a.displayOrder || 0) - (b.displayOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
    .map(formatSubcategory);

  const allSubsForMain = subDocs.filter(
    (s) =>
      (s.parentCategory && String(s.parentCategory) === String(main._id)) ||
      s.parentSlug === main.slug
  );
  const activeCount = allSubsForMain.filter((s) => s.isActive !== false).length;
  const inactiveCount = allSubsForMain.length - activeCount;

  return {
    _id: String(main._id),
    id: main.slug,
    slug: main.slug,
    name: main.name,
    description: main.description || canonical.description || '',
    shortDescription: main.shortDescription || canonical.shortDescription || '',
    icon: main.icon || canonical.icon || 'Layers',
    color: main.color || canonical.color || '#142D4E',
    bgColor: main.bgColor || canonical.bgColor || '#E8EDF3',
    isMain: true,
    isActive: true,
    displayOrder: main.displayOrder || canonical.displayOrder || 0,
    popularServices:
      Array.isArray(main.popularServices) && main.popularServices.length > 0
        ? main.popularServices
        : canonical.popularServices || [],
    metaTitle: main.metaTitle || canonical.metaTitle || `${main.name} Services — DEALSATHI`,
    metaDescription: main.metaDescription || canonical.metaDescription || main.description || '',
    subcategoryCount: matchingSubs.length,
    totalSubcategories: allSubsForMain.length,
    activeSubcategories: activeCount,
    inactiveSubcategories: inactiveCount,
    subcategories: matchingSubs,
  };
}

/**
 * Validates and normalizes subcategory create/update input payload.
 * Enforces explicit allowlisting (mass-assignment protection) and strict input validation.
 */
export function validateAndExtractSubcategoryFields(rawBody, { isUpdate = false } = {}) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createHttpError('Request body must be a valid JSON object.', 400);
  }

  // Prevent privilege / taxonomy escalation attempts via mass assignment
  if (rawBody.isMain === true || rawBody.isMain === 'true') {
    throw createHttpError(
      'Creating or promoting top-level main categories is prohibited. Only subcategories under the 5 established main categories are allowed.',
      400,
      [{ field: 'isMain', message: 'Top-level main categories are fixed to the 5 established business verticals.' }]
    );
  }

  const errors = [];
  const extracted = {};

  // 1. Name validation
  if (!isUpdate || rawBody.name !== undefined) {
    if (typeof rawBody.name !== 'string') {
      errors.push({ field: 'name', message: 'Subcategory name is required and must be a string' });
    } else {
      const normalized = normalizeCategoryName(rawBody.name);
      if (!normalized) {
        errors.push({ field: 'name', message: 'Subcategory name is required' });
      } else if (/[<>]|[\x00-\x1F\x7F]/.test(normalized)) {
        errors.push({ field: 'name', message: 'Subcategory name contains invalid characters' });
      } else if (normalized.length < 2) {
        errors.push({ field: 'name', message: 'Subcategory name must be at least 2 characters' });
      } else if (normalized.length > 80) {
        errors.push({ field: 'name', message: 'Subcategory name cannot exceed 80 characters' });
      } else {
        const candidateSlug = createSlug(rawBody.slug !== undefined ? rawBody.slug : normalized);
        if (!candidateSlug || candidateSlug.length < 2) {
          errors.push({
            field: 'name',
            message: 'Subcategory name must contain valid alphanumeric characters to generate a URL slug',
          });
        } else {
          extracted.name = normalized;
          extracted.normalizedName = normalized.toLowerCase();
          extracted.slug = candidateSlug;
        }
      }
    }
  } else if (rawBody.slug !== undefined) {
    if (typeof rawBody.slug !== 'string') {
      errors.push({ field: 'slug', message: 'Slug must be a valid string' });
    } else {
      const candidateSlug = createSlug(rawBody.slug);
      if (!candidateSlug || candidateSlug.length < 2 || candidateSlug.length > 90) {
        errors.push({ field: 'slug', message: 'Slug must be between 2 and 90 valid characters' });
      } else {
        extracted.slug = candidateSlug;
      }
    }
  }

  // 2. Parent Category validation (accepts parentCategory, parentId, or parentSlug)
  const rawParent =
    rawBody.parentCategory !== undefined
      ? rawBody.parentCategory
      : rawBody.parentId !== undefined
      ? rawBody.parentId
      : rawBody.parentSlug;

  if (!isUpdate || rawParent !== undefined) {
    if (rawParent === undefined || rawParent === null || rawParent === '') {
      errors.push({
        field: 'parentCategory',
        message: 'Parent main category is required. Every subcategory must belong to one of the 5 established main categories.',
      });
    } else if (typeof rawParent !== 'string' || !rawParent.trim()) {
      errors.push({
        field: 'parentCategory',
        message: 'Parent category identifier must be a non-empty string.',
      });
    } else {
      extracted.parentIdentifier = rawParent.trim();
    }
  }

  // 3. Description validation
  if (rawBody.description !== undefined) {
    if (rawBody.description === null) {
      extracted.description = '';
    } else if (typeof rawBody.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else {
      const cleanDesc = rawBody.description.trim().replace(/\s+/g, ' ');
      if (/[<>]|[\x00-\x1F\x7F]/.test(cleanDesc)) {
        errors.push({ field: 'description', message: 'Description contains invalid HTML or control characters' });
      } else if (cleanDesc.length > 500) {
        errors.push({ field: 'description', message: 'Description cannot exceed 500 characters' });
      } else {
        extracted.description = cleanDesc;
        extracted.shortDescription = cleanDesc.slice(0, 200);
      }
    }
  } else if (!isUpdate) {
    extracted.description = '';
    extracted.shortDescription = '';
  }

  // 4. Status (isActive) validation
  if (rawBody.isActive !== undefined) {
    if (typeof rawBody.isActive !== 'boolean') {
      errors.push({ field: 'isActive', message: 'isActive status must be a boolean (true or false)' });
    } else {
      extracted.isActive = rawBody.isActive;
    }
  } else if (!isUpdate) {
    extracted.isActive = true;
  }

  // 5. Display Order validation
  if (rawBody.displayOrder !== undefined) {
    const parsedOrder = Number(rawBody.displayOrder);
    if (!Number.isInteger(parsedOrder) || parsedOrder < 0 || parsedOrder > 9999) {
      errors.push({ field: 'displayOrder', message: 'displayOrder must be an integer between 0 and 9999' });
    } else {
      extracted.displayOrder = parsedOrder;
    }
  }

  // 6. Icon validation
  if (rawBody.icon !== undefined) {
    if (typeof rawBody.icon !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(rawBody.icon.trim())) {
      errors.push({ field: 'icon', message: 'Icon must be a valid icon identifier' });
    } else {
      extracted.icon = rawBody.icon.trim();
    }
  }

  if (errors.length > 0) {
    throw createHttpError(errors[0].message, 400, errors);
  }

  return extracted;
}

export const categoryService = {
  /**
   * Resets in-memory store (used by isolated unit tests)
   */
  _resetInMemoryStore() {
    inMemoryStore = buildInitialInMemoryStore();
  },

  /**
   * Idempotently ensures the 5 established main categories and initial subcategories exist in MongoDB.
   * Never overwrites existing records or IDs, and never inserts duplicates.
   */
  async ensureCanonicalCategories() {
    if (!isDbActive()) return;
    if (Category._isMocked) return;
    if (isSeeded) return;
    if (seedingPromise) return seedingPromise;

    seedingPromise = (async () => {
      try {
        for (const cat of CANONICAL_MAIN_CATEGORIES) {
          const mainDoc = await Category.findOneAndUpdate(
            { slug: cat.slug },
            {
              $setOnInsert: {
                name: cat.name,
                normalizedName: cat.name.toLowerCase(),
                slug: cat.slug,
                description: cat.description,
                shortDescription: cat.shortDescription,
                parentCategory: null,
                parentSlug: null,
                parentName: null,
                isMain: true,
                isActive: true,
                icon: cat.icon,
                color: cat.color,
                bgColor: cat.bgColor,
                displayOrder: cat.displayOrder,
                popularServices: cat.popularServices,
                metaTitle: cat.metaTitle,
                metaDescription: cat.metaDescription,
              },
            },
            { upsert: true, new: true }
          );

          for (const sub of cat.subcategories) {
            await Category.findOneAndUpdate(
              { slug: sub.slug },
              {
                $setOnInsert: {
                  name: sub.name,
                  normalizedName: sub.name.toLowerCase(),
                  slug: sub.slug,
                  description: sub.description,
                  shortDescription: sub.description,
                  parentCategory: mainDoc._id,
                  parentSlug: mainDoc.slug,
                  parentName: mainDoc.name,
                  isMain: false,
                  isActive: true,
                  icon: 'Layers',
                  displayOrder: sub.displayOrder,
                },
              },
              { upsert: true, new: true }
            );
          }
        }
        isSeeded = true;
      } catch (err) {
        logger.warn('Category canonical bootstrap check notice', { error: err.message });
      } finally {
        seedingPromise = null;
      }
    })();

    return seedingPromise;
  },

  /**
   * Resolves and validates that parentIdentifier points to one of the 5 established main categories.
   */
  async resolveValidMainCategory(parentIdentifier) {
    const cleanId = String(parentIdentifier || '').trim();
    if (!cleanId) {
      throw createHttpError(
        'Parent main category is required. Every subcategory must belong to one of the 5 established main categories.',
        400,
        [{ field: 'parentCategory', message: 'Parent main category is required' }]
      );
    }

    if (isDbActive()) {
      await this.ensureCanonicalCategories();

      let parentDoc = null;
      if (mongoose.Types.ObjectId.isValid(cleanId) && /^[a-fA-F0-9]{24}$/.test(cleanId)) {
        parentDoc = await Category.findById(cleanId).lean();
      }
      if (!parentDoc) {
        const lowerSlug = cleanId.toLowerCase();
        if (CANONICAL_MAIN_SLUGS.includes(lowerSlug)) {
          parentDoc = await Category.findOne({ slug: lowerSlug, isMain: true }).lean();
        } else {
          // Also check by exact canonical main category name
          const matchedCanonical = CANONICAL_MAIN_CATEGORIES.find(
            (c) => c.name.toLowerCase() === lowerSlug
          );
          if (matchedCanonical) {
            parentDoc = await Category.findOne({ slug: matchedCanonical.slug, isMain: true }).lean();
          }
        }
      }

      if (!parentDoc || !parentDoc.isMain || !CANONICAL_MAIN_SLUGS.includes(parentDoc.slug)) {
        throw createHttpError(
          'Invalid parent category. Every subcategory must belong to one of the 5 established main categories.',
          400,
          [{ field: 'parentCategory', message: 'Selected parent category does not exist or is not a main category' }]
        );
      }

      return parentDoc;
    }

    // In-memory store lookup
    const lower = cleanId.toLowerCase();
    const foundMain = inMemoryStore.mains.find(
      (m) => String(m._id) === cleanId || m.slug === lower || m.name.toLowerCase() === lower
    );

    if (!foundMain || !foundMain.isMain || !CANONICAL_MAIN_SLUGS.includes(foundMain.slug)) {
      throw createHttpError(
        'Invalid parent category. Every subcategory must belong to one of the 5 established main categories.',
        400,
        [{ field: 'parentCategory', message: 'Selected parent category does not exist or is not a main category' }]
      );
    }

    return foundMain;
  },

  /**
   * Public API: Returns the 5 active main categories with their active subcategories.
   */
  async getPublicCategories() {
    if (isDbActive()) {
      await this.ensureCanonicalCategories();
      const [mains, subs] = await Promise.all([
        Category.find({ isMain: true, isActive: true }).sort({ displayOrder: 1 }).lean(),
        Category.find({ isMain: false, isActive: true }).sort({ displayOrder: 1, name: 1 }).lean(),
      ]);

      // Ensure canonical order of the 5 main categories
      const orderedMains = CANONICAL_MAIN_CATEGORIES.map((canon) => {
        const dbMain = mains.find((m) => m.slug === canon.slug) || canon;
        return formatMainCategory(dbMain, subs, { onlyActiveSubs: true });
      });

      return orderedMains;
    }

    return inMemoryStore.mains.map((main) =>
      formatMainCategory(main, inMemoryStore.subs, { onlyActiveSubs: true })
    );
  },

  /**
   * Public API: Get a main category (with active subcategories) or subcategory by slug.
   */
  async getPublicCategoryBySlug(slug) {
    const cleanSlug = String(slug || '').toLowerCase().trim();
    if (!cleanSlug) {
      throw createHttpError('Category slug is required', 400);
    }

    const allMainCategories = await this.getPublicCategories();
    const foundMain = allMainCategories.find((c) => c.slug === cleanSlug);
    if (foundMain) {
      return foundMain;
    }

    // Also allow looking up an active subcategory by slug
    for (const main of allMainCategories) {
      const foundSub = main.subcategories.find((s) => s.slug === cleanSlug);
      if (foundSub) {
        return {
          ...foundSub,
          parentCategoryDetails: {
            _id: main._id,
            id: main.id,
            slug: main.slug,
            name: main.name,
          },
        };
      }
    }

    throw createHttpError(`Category "${cleanSlug}" was not found.`, 404);
  },

  /**
   * Admin API: Get full category overview (5 main categories + filtered subcategories + summary counts)
   */
  async getAdminCategories({ parentCategory = '', status = 'all', search = '' } = {}) {
    let mains = [];
    let allSubs = [];

    if (isDbActive()) {
      await this.ensureCanonicalCategories();
      [mains, allSubs] = await Promise.all([
        Category.find({ isMain: true }).sort({ displayOrder: 1 }).lean(),
        Category.find({ isMain: false }).sort({ displayOrder: 1, name: 1 }).lean(),
      ]);
    } else {
      mains = [...inMemoryStore.mains];
      allSubs = [...inMemoryStore.subs];
    }

    const formattedMains = CANONICAL_MAIN_CATEGORIES.map((canon) => {
      const dbMain = mains.find((m) => m.slug === canon.slug) || {
        ...canon,
        _id: INMEM_MAIN_IDS[canon.slug],
      };
      return formatMainCategory(dbMain, allSubs, { onlyActiveSubs: false });
    });

    // Apply filters to subcategories list
    let filteredSubs = allSubs.map(formatSubcategory);

    if (parentCategory && parentCategory !== 'all') {
      const cleanParent = String(parentCategory).trim().toLowerCase();
      filteredSubs = filteredSubs.filter(
        (s) =>
          String(s.parentCategory).toLowerCase() === cleanParent ||
          String(s.parentSlug).toLowerCase() === cleanParent ||
          String(s.parentName || '').toLowerCase() === cleanParent
      );
    }

    if (status && status !== 'all') {
      const normalizedStatus = String(status).toLowerCase().trim();
      if (normalizedStatus === 'active' || normalizedStatus === 'true') {
        filteredSubs = filteredSubs.filter((s) => s.isActive === true);
      } else if (normalizedStatus === 'inactive' || normalizedStatus === 'false') {
        filteredSubs = filteredSubs.filter((s) => s.isActive === false);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const cappedSearch = search.trim().slice(0, 100);
      const regex = new RegExp(escapeRegex(cappedSearch), 'i');
      filteredSubs = filteredSubs.filter(
        (s) =>
          regex.test(s.name) ||
          regex.test(s.slug) ||
          regex.test(s.description || '') ||
          regex.test(s.parentName || '')
      );
    }

    filteredSubs.sort((a, b) => {
      const parentOrderA = CANONICAL_MAIN_SLUGS.indexOf(a.parentSlug);
      const parentOrderB = CANONICAL_MAIN_SLUGS.indexOf(b.parentSlug);
      if (parentOrderA !== parentOrderB) return parentOrderA - parentOrderB;
      const orderDiff = (a.displayOrder || 0) - (b.displayOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    const totalSubcategories = allSubs.length;
    const activeSubcategories = allSubs.filter((s) => s.isActive !== false).length;
    const inactiveSubcategories = totalSubcategories - activeSubcategories;

    return {
      mainCategories: formattedMains,
      subcategories: filteredSubs,
      summary: {
        totalMainCategories: formattedMains.length,
        totalSubcategories,
        activeSubcategories,
        inactiveSubcategories,
      },
    };
  },

  /**
   * Admin API: Get a single category or subcategory by ID or slug
   */
  async getAdminCategoryById(idOrSlug) {
    const clean = String(idOrSlug || '').trim();
    if (!clean) {
      throw createHttpError('Category ID or slug is required', 400);
    }

    const { mainCategories, subcategories } = await this.getAdminCategories();

    const foundMain = mainCategories.find(
      (m) => String(m._id) === clean || m.slug === clean.toLowerCase()
    );
    if (foundMain) return foundMain;

    const foundSub = subcategories.find(
      (s) => String(s._id) === clean || s.slug === clean.toLowerCase()
    );
    if (foundSub) return foundSub;

    throw createHttpError('Category or subcategory not found', 404);
  },

  /**
   * Admin API: Create a new subcategory under one of the 5 established main categories
   */
  async createSubcategory(rawBody) {
    if (!isDbActive() && env.isProduction) {
      throw createHttpError('Database service is temporarily unavailable.', 503);
    }

    const extracted = validateAndExtractSubcategoryFields(rawBody, { isUpdate: false });
    const parentMain = await this.resolveValidMainCategory(extracted.parentIdentifier);

    // Prevent collision with the 5 canonical main category names or slugs
    const collidesWithMain = CANONICAL_MAIN_CATEGORIES.some(
      (c) => c.slug === extracted.slug || c.name.toLowerCase() === extracted.normalizedName
    );
    if (collidesWithMain) {
      throw createHttpError(
        `Cannot create a subcategory that duplicates an established main category ("${extracted.name}").`,
        409,
        [{ field: 'name', message: 'Name or slug conflicts with an established main category' }]
      );
    }

    if (isDbActive()) {
      // Case-insensitive duplicate name or slug check
      const existing = await Category.findOne({
        $or: [{ slug: extracted.slug }, { normalizedName: extracted.normalizedName }],
      }).lean();

      if (existing) {
        throw createHttpError(
          `A subcategory with the name "${extracted.name}" or slug "${extracted.slug}" already exists.`,
          409,
          [{ field: 'name', message: 'A subcategory with this name or slug already exists' }]
        );
      }

      // Compute default displayOrder if not provided
      let displayOrder = extracted.displayOrder;
      if (displayOrder === undefined) {
        const countUnderParent = await Category.countDocuments({
          parentCategory: parentMain._id,
          isMain: false,
        });
        displayOrder = countUnderParent + 1;
      }

      try {
        const newSub = new Category({
          name: extracted.name,
          normalizedName: extracted.normalizedName,
          slug: extracted.slug,
          description: extracted.description,
          shortDescription: extracted.shortDescription,
          parentCategory: parentMain._id,
          parentSlug: parentMain.slug,
          parentName: parentMain.name,
          isMain: false,
          isActive: extracted.isActive,
          icon: extracted.icon || 'Layers',
          displayOrder,
        });

        const saved = await newSub.save();
        return formatSubcategory(saved.toObject ? saved.toObject() : saved);
      } catch (err) {
        // Handle MongoDB E11000 concurrent duplicate creation race condition
        if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
          throw createHttpError(
            `A subcategory with the name "${extracted.name}" or slug "${extracted.slug}" already exists.`,
            409,
            [{ field: 'name', message: 'A subcategory with this name or slug already exists' }]
          );
        }
        throw err;
      }
    }

    // In-memory store implementation
    const duplicateInMem = inMemoryStore.subs.find(
      (s) => s.slug === extracted.slug || s.normalizedName === extracted.normalizedName
    );
    if (duplicateInMem) {
      throw createHttpError(
        `A subcategory with the name "${extracted.name}" or slug "${extracted.slug}" already exists.`,
        409,
        [{ field: 'name', message: 'A subcategory with this name or slug already exists' }]
      );
    }

    const siblingsCount = inMemoryStore.subs.filter(
      (s) => s.parentSlug === parentMain.slug
    ).length;

    const now = new Date().toISOString();
    const createdSub = {
      _id: `65f000000000000000000${++inMemoryStore.nextIdCounter}`,
      id: extracted.slug,
      name: extracted.name,
      normalizedName: extracted.normalizedName,
      slug: extracted.slug,
      description: extracted.description,
      shortDescription: extracted.shortDescription,
      parentCategory: String(parentMain._id),
      parentSlug: parentMain.slug,
      parentName: parentMain.name,
      isMain: false,
      isActive: extracted.isActive,
      icon: extracted.icon || 'Layers',
      displayOrder:
        extracted.displayOrder !== undefined ? extracted.displayOrder : siblingsCount + 1,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryStore.subs.push(createdSub);
    return formatSubcategory(createdSub);
  },

  /**
   * Admin API: Update an existing subcategory
   */
  async updateSubcategory(id, rawBody) {
    if (!isDbActive() && env.isProduction) {
      throw createHttpError('Database service is temporarily unavailable.', 503);
    }

    const cleanId = String(id || '').trim();
    if (!cleanId) {
      throw createHttpError('Subcategory ID is required', 400);
    }

    const extracted = validateAndExtractSubcategoryFields(rawBody, { isUpdate: true });

    if (isDbActive()) {
      await this.ensureCanonicalCategories();

      let targetDoc = null;
      if (mongoose.Types.ObjectId.isValid(cleanId) && /^[a-fA-F0-9]{24}$/.test(cleanId)) {
        targetDoc = await Category.findById(cleanId);
      }
      if (!targetDoc) {
        targetDoc = await Category.findOne({ slug: cleanId.toLowerCase() });
      }

      if (!targetDoc) {
        throw createHttpError('Subcategory not found', 404);
      }

      if (targetDoc.isMain || CANONICAL_MAIN_SLUGS.includes(targetDoc.slug)) {
        throw createHttpError(
          'The 5 established main categories are protected and cannot be modified or converted into subcategories.',
          400
        );
      }

      // If parentCategory is being changed, validate the new parent main category
      if (extracted.parentIdentifier !== undefined) {
        const newParent = await this.resolveValidMainCategory(extracted.parentIdentifier);
        targetDoc.parentCategory = newParent._id;
        targetDoc.parentSlug = newParent.slug;
        targetDoc.parentName = newParent.name;
      }

      // If name or slug is being updated, check for duplicates excluding current record
      const nextNormalizedName =
        extracted.normalizedName !== undefined ? extracted.normalizedName : targetDoc.normalizedName;
      const nextSlug = extracted.slug !== undefined ? extracted.slug : targetDoc.slug;

      const collidesWithMain = CANONICAL_MAIN_CATEGORIES.some(
        (c) => c.slug === nextSlug || c.name.toLowerCase() === nextNormalizedName
      );
      if (collidesWithMain) {
        throw createHttpError(
          'Subcategory name or slug conflicts with one of the 5 established main categories.',
          409
        );
      }

      const duplicate = await Category.findOne({
        _id: { $ne: targetDoc._id },
        $or: [{ slug: nextSlug }, { normalizedName: nextNormalizedName }],
      }).lean();

      if (duplicate) {
        throw createHttpError(
          `Another subcategory with name "${extracted.name || targetDoc.name}" or slug "${nextSlug}" already exists.`,
          409,
          [{ field: 'name', message: 'A subcategory with this name or slug already exists' }]
        );
      }

      if (extracted.name !== undefined) {
        targetDoc.name = extracted.name;
        targetDoc.normalizedName = extracted.normalizedName;
      }
      if (extracted.slug !== undefined) {
        targetDoc.slug = extracted.slug;
        targetDoc.id = extracted.slug;
      }
      if (extracted.description !== undefined) {
        targetDoc.description = extracted.description;
        targetDoc.shortDescription = extracted.shortDescription;
      }
      if (extracted.isActive !== undefined) {
        targetDoc.isActive = extracted.isActive;
      }
      if (extracted.displayOrder !== undefined) {
        targetDoc.displayOrder = extracted.displayOrder;
      }
      if (extracted.icon !== undefined) {
        targetDoc.icon = extracted.icon;
      }

      try {
        const saved = await targetDoc.save();
        return formatSubcategory(saved.toObject ? saved.toObject() : saved);
      } catch (err) {
        if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
          throw createHttpError('A subcategory with this name or slug already exists.', 409);
        }
        throw err;
      }
    }

    // In-memory store update
    const isMainInMem = inMemoryStore.mains.some(
      (m) => String(m._id) === cleanId || m.slug === cleanId.toLowerCase()
    );
    if (isMainInMem) {
      throw createHttpError(
        'The 5 established main categories are protected and cannot be modified or converted into subcategories.',
        400
      );
    }

    const subIdx = inMemoryStore.subs.findIndex(
      (s) => String(s._id) === cleanId || s.slug === cleanId.toLowerCase()
    );
    if (subIdx === -1) {
      throw createHttpError('Subcategory not found', 404);
    }

    const currentSub = inMemoryStore.subs[subIdx];
    let updatedParent = null;
    if (extracted.parentIdentifier !== undefined) {
      updatedParent = await this.resolveValidMainCategory(extracted.parentIdentifier);
    }

    const nextNormalizedName =
      extracted.normalizedName !== undefined ? extracted.normalizedName : currentSub.normalizedName;
    const nextSlug = extracted.slug !== undefined ? extracted.slug : currentSub.slug;

    const collidesWithMain = CANONICAL_MAIN_CATEGORIES.some(
      (c) => c.slug === nextSlug || c.name.toLowerCase() === nextNormalizedName
    );
    if (collidesWithMain) {
      throw createHttpError(
        'Subcategory name or slug conflicts with one of the 5 established main categories.',
        409
      );
    }

    const duplicateInMem = inMemoryStore.subs.find(
      (s, idx) =>
        idx !== subIdx && (s.slug === nextSlug || s.normalizedName === nextNormalizedName)
    );
    if (duplicateInMem) {
      throw createHttpError(
        `Another subcategory with name "${extracted.name || currentSub.name}" or slug "${nextSlug}" already exists.`,
        409
      );
    }

    const updatedSub = {
      ...currentSub,
      name: extracted.name !== undefined ? extracted.name : currentSub.name,
      normalizedName: nextNormalizedName,
      slug: nextSlug,
      id: nextSlug,
      description:
        extracted.description !== undefined ? extracted.description : currentSub.description,
      shortDescription:
        extracted.shortDescription !== undefined
          ? extracted.shortDescription
          : currentSub.shortDescription,
      parentCategory: updatedParent ? String(updatedParent._id) : currentSub.parentCategory,
      parentSlug: updatedParent ? updatedParent.slug : currentSub.parentSlug,
      parentName: updatedParent ? updatedParent.name : currentSub.parentName,
      isActive: extracted.isActive !== undefined ? extracted.isActive : currentSub.isActive,
      displayOrder:
        extracted.displayOrder !== undefined ? extracted.displayOrder : currentSub.displayOrder,
      icon: extracted.icon !== undefined ? extracted.icon : currentSub.icon,
      updatedAt: new Date().toISOString(),
    };

    inMemoryStore.subs[subIdx] = updatedSub;
    return formatSubcategory(updatedSub);
  },

  /**
   * Admin API: Activate or deactivate a subcategory
   */
  async updateSubcategoryStatus(id, isActive) {
    if (typeof isActive !== 'boolean') {
      throw createHttpError('isActive status must be a boolean (true or false)', 400, [
        { field: 'isActive', message: 'isActive must be true or false' },
      ]);
    }
    return this.updateSubcategory(id, { isActive });
  },
};

export default categoryService;
