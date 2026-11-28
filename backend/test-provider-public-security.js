/**
 * Dealsathi P0 Public Provider API Security & DTO Allowlist Verification Suite
 *
 * Uses isolated in-memory Mongoose model mocks — zero production records are read or modified.
 * Run: node test-provider-public-security.js
 */

import http from 'http';
import app from './src/app.js';
import Provider from './src/models/Provider.js';
import ProviderService from './src/models/ProviderService.js';
import categoryService from './src/services/categoryService.js';
import {
  PUBLIC_PROVIDER_ALLOWED_FIELDS,
  PUBLIC_SHOP_IMAGE_ALLOWED_FIELDS,
  PUBLIC_PROVIDER_SERVICE_ALLOWED_FIELDS,
  PUBLIC_PROVIDER_SUGGESTION_ALLOWED_FIELDS,
  toPublicProviderDto,
  toPublicProviderServiceDto,
  sanitizePublicShopImage,
} from './src/utils/publicProviderDto.js';

let passed = 0;
let failed = 0;

const FORBIDDEN_PROVIDER_FIELDS = [
  'email',
  'providerName',
  'address',
  'pinCode',
  'consentToDisplayPhone',
  'googleSub',
  'accountId',
  'sourceApplicationId',
  'sourceReferenceId',
  'rejectionReason',
  'publicationConsent',
  'publicationStatus',
  'verifiedAt',
  'searchTokens',
  'locationTokens',
  'isDeleted',
  'deletedAt',
  'deletedBy',
  'deleteReason',
  'createdAt',
  'updatedAt',
  '__v',
];

const FORBIDDEN_SHOP_IMAGE_FIELDS = [
  'publicId',
  'originalName',
  'mimeType',
  'size',
  'uploadedAt',
];

const FORBIDDEN_SERVICE_FIELDS = [
  'providerId',
  'accountId',
  'keywords',
  'searchTokens',
  'approvalStatus',
  'publicationStatus',
  'rejectionReason',
  'isActive',
  'isDeleted',
  'deletedAt',
  'deletedBy',
  'deleteReason',
  'createdAt',
  'updatedAt',
  '__v',
];

async function assertTest(label, fn) {
  try {
    const res = await fn();
    if (res === true) {
      passed++;
      console.log(`  ✅ PASS: ${label}`);
    } else {
      failed++;
      console.log(`  ❌ FAIL: ${label} — ${res}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ❌ ERROR: ${label} — ${err.message}`);
  }
}

function makeRequest(baseUrl, reqPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    http
      .get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          headers: { 'x-konnevia-test-suite': 'provider-public-security' },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            let body = raw;
            try {
              body = JSON.parse(raw);
            } catch {
              // keep raw
            }
            resolve({ status: res.statusCode, body });
          });
        }
      )
      .on('error', reject);
  });
}

function oid(n) {
  return `65fb0000000000000000${String(n).padStart(4, '0')}`;
}

function matchesQuery(doc, query = {}) {
  for (const [key, val] of Object.entries(query)) {
    if (key === '$or') {
      if (!val.some((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }
    if (key === '$and') {
      if (!val.every((clause) => matchesQuery(doc, clause))) return false;
      continue;
    }

    const parts = key.split('.');
    let actual = doc;
    for (const p of parts) {
      actual = actual ? actual[p] : undefined;
    }

    if (val instanceof RegExp) {
      if (Array.isArray(actual)) {
        if (!actual.some((item) => val.test(String(item)))) return false;
      } else if (!val.test(String(actual || ''))) {
        return false;
      }
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$ne' in val) {
        if (String(actual) === String(val.$ne) || actual === val.$ne) return false;
      }
      if ('$in' in val) {
        const arr = val.$in.map(String);
        if (Array.isArray(actual)) {
          if (!actual.some((item) => arr.includes(String(item)))) return false;
        } else if (!arr.includes(String(actual))) {
          return false;
        }
      }
      if ('$regex' in val) {
        const rx = val.$regex instanceof RegExp
          ? val.$regex
          : new RegExp(val.$regex, val.$options || '');
        if (Array.isArray(actual)) {
          if (!actual.some((item) => rx.test(String(item)))) return false;
        } else if (!rx.test(String(actual || ''))) {
          return false;
        }
      }
    } else if (Array.isArray(actual)) {
      if (!actual.some((item) => String(item) === String(val))) return false;
    } else if (String(actual) !== String(val)) {
      return false;
    }
  }
  return true;
}

function projectDoc(doc, projectionStr) {
  if (!projectionStr || typeof projectionStr !== 'string') return { ...doc };
  const fields = projectionStr.split(/\s+/).filter(Boolean);
  const out = {};
  for (const f of fields) {
    if (doc[f] !== undefined) out[f] = doc[f];
  }
  return out;
}

function installMock(Model, store) {
  const orig = {
    find: Model.find,
    findOne: Model.findOne,
    distinct: Model.distinct,
  };

  Model.find = (query = {}) => {
    let data = store.filter((d) => matchesQuery(d, query)).map((d) => ({ ...d }));
    let projection = null;
    const chain = {
      sort: (spec = {}) => {
        if (spec.publishedAt === -1) {
          data.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
        }
        return chain;
      },
      limit: (n) => {
        data = data.slice(0, n);
        return chain;
      },
      skip: (n) => {
        data = data.slice(n);
        return chain;
      },
      select: (sel) => {
        projection = sel;
        return chain;
      },
      lean: async () => data.map((d) => projectDoc(d, projection)),
      then: (resolve, reject) =>
        Promise.resolve(data.map((d) => projectDoc(d, projection))).then(resolve, reject),
    };
    return chain;
  };

  Model.findOne = (query = {}) => {
    const found = store.find((d) => matchesQuery(d, query));
    let projection = null;
    const chain = {
      select: (sel) => {
        projection = sel;
        return chain;
      },
      lean: async () => (found ? projectDoc(found, projection) : null),
      then: (resolve, reject) =>
        Promise.resolve(found ? projectDoc(found, projection) : null).then(resolve, reject),
    };
    return chain;
  };

  Model.distinct = async (field, query = {}) => {
    const matched = store.filter((d) => matchesQuery(d, query));
    return Array.from(new Set(matched.map((d) => d[field]).filter(Boolean)));
  };

  return () => {
    Model.find = orig.find;
    Model.findOne = orig.findOne;
    Model.distinct = orig.distinct;
  };
}

function assertStrictPublicProviderShape(item, { expectSearchMeta = false } = {}) {
  for (const key of FORBIDDEN_PROVIDER_FIELDS) {
    if (key in item) {
      return `Exposed forbidden field "${key}"`;
    }
  }

  const allowedSet = new Set(PUBLIC_PROVIDER_ALLOWED_FIELDS);
  if (expectSearchMeta) allowedSet.add('searchMeta');

  for (const key of Object.keys(item)) {
    if (!allowedSet.has(key)) {
      return `Unexpected non-allowlisted key "${key}"`;
    }
  }

  if (item.shopImage && typeof item.shopImage === 'object') {
    for (const key of FORBIDDEN_SHOP_IMAGE_FIELDS) {
      if (key in item.shopImage) {
        return `Exposed forbidden shopImage field "${key}"`;
      }
    }
    const shopAllowed = new Set(PUBLIC_SHOP_IMAGE_ALLOWED_FIELDS);
    for (const key of Object.keys(item.shopImage)) {
      if (!shopAllowed.has(key)) {
        return `Unexpected non-allowlisted shopImage key "${key}"`;
      }
    }
  }

  if (expectSearchMeta && item.searchMeta) {
    const metaAllowed = new Set(['relevanceScore', 'matchType', 'locationTier', 'matchedServices']);
    for (const key of Object.keys(item.searchMeta)) {
      if (!metaAllowed.has(key)) {
        return `Unexpected searchMeta key "${key}"`;
      }
    }
  }

  return true;
}

function makeLeakyProvider(idNum, overrides = {}) {
  return {
    _id: oid(idNum),
    businessName: `Test Provider ${idNum}`,
    providerName: `Private Contact Person ${idNum}`,
    slug: `test-provider-${idNum}`,
    email: `private-owner-${idNum}@example.com`,
    contactNumber: `987654321${idNum % 10}`,
    consentToDisplayPhone: true,
    category: 'Construction & Civil',
    categorySlug: 'construction-civil',
    subcategory: 'Civil Engineering',
    subcategorySlug: 'civil-engineering',
    services: ['Structural Design', 'Civil Contracting'],
    keywords: ['structural engineer', 'civil'],
    experienceYears: 9,
    description: 'Verified structural and civil engineering works.',
    address: `Plot ${idNum}, Secret Industrial Estate, Sector 9`,
    city: 'Delhi',
    state: 'Delhi',
    pinCode: '110099',
    serviceAreas: ['Delhi', 'New Delhi'],
    website: `https://provider${idNum}.example.in`,
    logo: '',
    coverImage: '',
    gallery: [`https://cdn.example.in/g-${idNum}.jpg`],
    shopImage: {
      url: `https://res.cloudinary.com/demo/image/upload/shop-${idNum}.jpg`,
      publicId: `dealsathi/providers/shop-${idNum}`,
      originalName: `secret-aadhaar-shop-${idNum}.jpg`,
      mimeType: 'image/jpeg',
      size: 204800,
      uploadedAt: '2026-10-01T10:00:00.000Z',
    },
    verificationStatus: 'VERIFIED',
    publicationStatus: 'PUBLISHED',
    verifiedAt: '2026-10-02T10:00:00.000Z',
    publishedAt: '2026-10-03T10:00:00.000Z',
    metaTitle: `Test Provider ${idNum} | DealSathi`,
    metaDescription: `Trusted civil engineering in Delhi.`,
    isDevSample: false,
    googleSub: `google-oauth2-sub-${idNum}-secret`,
    accountId: oid(9000 + idNum),
    sourceApplicationId: oid(8000 + idNum),
    sourceReferenceId: `APP-2026-000${idNum}`,
    rejectionReason: 'Internal prior rejection note',
    publicationConsent: true,
    searchTokens: ['structural', 'civil', 'delhi'],
    locationTokens: ['delhi', '110099'],
    isDeleted: false,
    deletedAt: null,
    deletedBy: 'admin@dealsathi.in',
    deleteReason: 'Internal audit test note',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
    __v: 3,
    ...overrides,
  };
}

async function run() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║    DEALSATHI P0 PUBLIC PROVIDER SECURITY & ALLOWLIST SUITE            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  // Stub category lookup so search works isolated without MongoDB
  const origGetCategories = categoryService.getPublicCategories;
  categoryService.getPublicCategories = async () => [
    {
      name: 'Construction & Civil',
      slug: 'construction-civil',
      isActive: true,
      subcategories: [{ name: 'Civil Engineering', slug: 'civil-engineering', isActive: true }],
    },
  ];

  const providersStore = [
    makeLeakyProvider(1, {
      businessName: 'Apex Civil Engineering Works',
      slug: 'apex-civil-engineering-works',
      consentToDisplayPhone: true,
      contactNumber: '9811111111',
    }),
    makeLeakyProvider(2, {
      businessName: 'Hidden Phone Consultants',
      slug: 'hidden-phone-consultants',
      consentToDisplayPhone: false,
      contactNumber: '9822222222',
    }),
    makeLeakyProvider(3, {
      businessName: 'Unverified Engineering',
      slug: 'unverified-engineering',
      verificationStatus: 'UNVERIFIED',
      publicationStatus: 'PUBLISHED',
    }),
    makeLeakyProvider(4, {
      businessName: 'Draft Engineering',
      slug: 'draft-engineering',
      verificationStatus: 'VERIFIED',
      publicationStatus: 'DRAFT',
    }),
    makeLeakyProvider(5, {
      businessName: 'Revoked Engineering',
      slug: 'revoked-engineering',
      verificationStatus: 'REVOKED',
      publicationStatus: 'PUBLISHED',
    }),
    makeLeakyProvider(6, {
      businessName: 'Soft Deleted Engineering',
      slug: 'soft-deleted-engineering',
      isDeleted: true,
    }),
  ];

  const servicesStore = [
    {
      _id: oid(501),
      providerId: oid(1),
      accountId: oid(9001),
      title: 'Structural Safety Audit',
      slug: 'structural-safety-audit',
      category: 'Construction & Civil',
      categorySlug: 'construction-civil',
      subcategory: 'Civil Engineering',
      subcategorySlug: 'civil-engineering',
      description: 'Seismic & structural engineering safety audit.',
      shortDescription: 'Seismic audit.',
      deliverables: ['Non-Destructive Testing', 'Signed Safety Certificate'],
      serviceAreas: ['Delhi', 'New Delhi'],
      keywords: ['seismic audit'],
      searchTokens: ['structural', 'safety', 'audit', 'seismic', 'delhi'],
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      rejectionReason: '',
      isActive: true,
      isDeleted: false,
    },
    {
      _id: oid(502),
      providerId: oid(3),
      accountId: oid(9003),
      title: 'Unverified Provider Package',
      slug: 'unverified-provider-package',
      category: 'Construction & Civil',
      categorySlug: 'construction-civil',
      subcategory: 'Civil Engineering',
      subcategorySlug: 'civil-engineering',
      description: 'Should never surface unverified provider.',
      deliverables: ['Seismic Testing'],
      serviceAreas: ['Delhi'],
      searchTokens: ['seismic', 'testing', 'delhi'],
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
      isDeleted: false,
    },
  ];

  const restoreProvider = installMock(Provider, providersStore);
  const restoreService = installMock(ProviderService, servicesStore);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log('── 1. Public Provider List DTO Security & Consent ──');

    await assertTest('GET /api/v1/providers exposes ZERO private fields and strips shopImage metadata', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const list = res.body?.data?.providers || [];
      if (list.length !== 2) return `Expected strictly 2 eligible providers, got ${list.length}`;

      for (const p of list) {
        const check = assertStrictPublicProviderShape(p, { expectSearchMeta: true });
        if (check !== true) return `${p.slug}: ${check}`;
        if (!p.shopImage?.url?.startsWith('https://')) return `${p.slug}: missing shopImage.url`;
      }
      return true;
    });

    await assertTest('GET /api/v1/providers masks contactNumber when consentToDisplayPhone=false and omits consent metadata', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers');
      const list = res.body?.data?.providers || [];
      const visible = list.find((p) => p.slug === 'apex-civil-engineering-works');
      const masked = list.find((p) => p.slug === 'hidden-phone-consultants');
      if (!visible || !masked) return 'Missing expected providers';
      if ('consentToDisplayPhone' in visible || 'consentToDisplayPhone' in masked) {
        return 'Exposed consentToDisplayPhone metadata publicly';
      }
      if (visible.contactNumber !== '9811111111') return `Expected visible phone, got ${visible.contactNumber}`;
      if (masked.contactNumber !== null) {
        return `Phone leak when consent=false: ${masked.contactNumber}`;
      }
      return true;
    });

    await assertTest('Internal location scoring via PIN/address still works without leaking address, pinCode, or providerName', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Civil%20Engineering&location=110099');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const list = res.body?.data?.providers || [];
      if (list.length === 0) return 'Expected match on PIN 110099';
      for (const p of list) {
        const check = assertStrictPublicProviderShape(p, { expectSearchMeta: true });
        if (check !== true) return check;
      }
      return true;
    });

    console.log('\n── 2. Public Provider Detail DTO Security & Gating ──');

    await assertTest('ProviderService search match exposes only matchedServices title strings and excludes ineligible providers', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Non-Destructive%20Testing&location=Delhi');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const list = res.body?.data?.providers || [];
      if (list.length !== 1 || list[0].slug !== 'apex-civil-engineering-works') {
        return `Expected strictly apex-civil-engineering-works, got ${list.map((p) => p.slug).join(', ')}`;
      }
      const item = list[0];
      const check = assertStrictPublicProviderShape(item, { expectSearchMeta: true });
      if (check !== true) return check;
      if (!Array.isArray(item.searchMeta?.matchedServices) || item.searchMeta.matchedServices[0] !== 'Structural Safety Audit') {
        return `Unexpected matchedServices: ${JSON.stringify(item.searchMeta?.matchedServices)}`;
      }
      return true;
    });

    await assertTest('GET /api/v1/providers/:slug enforces strict allowlist DTO and preserves visible phone', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers/apex-civil-engineering-works');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const p = res.body?.data;
      if (!p) return 'Missing data';
      const check = assertStrictPublicProviderShape(p, { expectSearchMeta: false });
      if (check !== true) return check;
      if (p.contactNumber !== '9811111111') return `Expected phone, got ${p.contactNumber}`;
      if (p.businessName !== 'Apex Civil Engineering Works') return 'Missing businessName';
      if (!p.shopImage?.url) return 'Missing shopImage.url';
      return true;
    });

    await assertTest('GET /api/v1/providers/:slug enforces contactNumber=null and omits consentToDisplayPhone when false', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers/hidden-phone-consultants');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const p = res.body?.data;
      const check = assertStrictPublicProviderShape(p, { expectSearchMeta: false });
      if (check !== true) return check;
      if ('consentToDisplayPhone' in p) return 'Exposed consentToDisplayPhone metadata on /:slug';
      return p.contactNumber === null
        ? true
        : `Leaked contactNumber: ${p.contactNumber}`;
    });

    await assertTest('Ineligible providers (unverified, draft, revoked, soft-deleted) return 404 on /:slug', async () => {
      const ineligibleSlugs = [
        'unverified-engineering',
        'draft-engineering',
        'revoked-engineering',
        'soft-deleted-engineering',
      ];
      for (const slug of ineligibleSlugs) {
        const res = await makeRequest(baseUrl, `/api/v1/providers/${slug}`);
        if (res.status !== 404) {
          return `Slug ${slug} returned HTTP ${res.status} instead of 404`;
        }
      }
      return true;
    });

    console.log('\n── 3. Suggestions, Service DTO & Auth Boundaries ──');

    await assertTest('GET /api/v1/providers/suggestions returns strictly allowlisted keys & verified providers only', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers/suggestions?q=engineering');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const sugProviders = res.body?.data?.providers || [];
      if (sugProviders.length === 0) return 'Expected matching verified providers';
      const allowed = new Set(PUBLIC_PROVIDER_SUGGESTION_ALLOWED_FIELDS);
      for (const sp of sugProviders) {
        for (const key of Object.keys(sp)) {
          if (!allowed.has(key)) return `Unexpected suggestion key "${key}"`;
        }
        if (['unverified-engineering', 'draft-engineering', 'revoked-engineering', 'soft-deleted-engineering'].includes(sp.slug)) {
          return `Ineligible provider in suggestions: ${sp.slug}`;
        }
      }
      return true;
    });

    await assertTest('toPublicProviderServiceDto and sanitizePublicShopImage strip all internal/moderation/upload metadata', async () => {
      const rawSvc = {
        _id: oid(501),
        providerId: oid(1),
        accountId: oid(9001),
        title: 'Structural Audit Package',
        slug: 'structural-audit-package',
        category: 'Construction & Civil',
        categorySlug: 'construction-civil',
        subcategory: 'Civil Engineering',
        subcategorySlug: 'civil-engineering',
        description: 'Full structural safety inspection.',
        shortDescription: 'Safety inspection.',
        priceLabel: '₹15,000',
        priceAmount: 15000,
        pricingModel: 'FIXED',
        deliverables: [
          'Site inspection',
          'Signed structural report',
          { secretInternal: 'leak', providerId: oid(1), accountId: oid(9001) },
        ],
        serviceAreas: [
          'Delhi',
          { internalRegionNote: 'do-not-expose' },
        ],
        estimatedDuration: '5 days',
        keywords: ['audit'],
        searchTokens: ['structural', 'audit'],
        approvalStatus: 'APPROVED',
        publicationStatus: 'PUBLISHED',
        rejectionReason: 'Previous draft note',
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        deletedBy: 'admin@dealsathi.in',
        deleteReason: 'test',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        __v: 1,
      };

      const svcDto = toPublicProviderServiceDto(rawSvc);
      for (const bad of FORBIDDEN_SERVICE_FIELDS) {
        if (bad in svcDto) return `Service DTO exposed "${bad}"`;
      }
      const allowedSvc = new Set(PUBLIC_PROVIDER_SERVICE_ALLOWED_FIELDS);
      for (const k of Object.keys(svcDto)) {
        if (!allowedSvc.has(k)) return `Unexpected Service DTO key "${k}"`;
      }
      if (svcDto.deliverables.length !== 2 || svcDto.serviceAreas.length !== 1) {
        return `Nested non-string objects survived in deliverables/serviceAreas: ${JSON.stringify(svcDto)}`;
      }

      const shop = sanitizePublicShopImage({
        url: 'https://cdn.example.in/a.jpg',
        publicId: 'secret/id',
        originalName: 'id-proof.jpg',
        mimeType: 'image/jpeg',
        size: 12345,
        uploadedAt: '2026-10-01',
      });
      if (Object.keys(shop).length !== 1 || shop.url !== 'https://cdn.example.in/a.jpg') {
        return `Unexpected sanitized shopImage: ${JSON.stringify(shop)}`;
      }

      // Defensive nested media & service object sanitization test
      const injected = toPublicProviderDto({
        ...providersStore[0],
        logo: {
          url: 'https://cdn.example.in/logo.png',
          publicId: 'secret/logo-id',
          originalName: 'my-logo.png',
          mimeType: 'image/png',
          size: 1024,
        },
        coverImage: {
          url: 'https://cdn.example.in/cover.jpg',
          publicId: 'secret/cover-id',
          uploadedAt: '2026-10-01',
        },
        gallery: [
          'https://cdn.example.in/g1.jpg',
          {
            url: 'https://cdn.example.in/g2.jpg',
            publicId: 'secret/g2-id',
            originalName: 'raw-g2.jpg',
          },
        ],
        services: [
          'Structural Design',
          rawSvc,
        ],
        keywords: ['civil', { internalScoreHint: 'secret' }],
        serviceAreas: ['Delhi', { accountId: oid(9001) }],
        arbitraryInternalFlag: 'leak-me',
        rawToken: 'secret-token',
      });
      if ('arbitraryInternalFlag' in injected || 'rawToken' in injected) {
        return 'toPublicProviderDto leaked arbitrary properties';
      }
      const injectedShape = assertStrictPublicProviderShape(injected, { expectSearchMeta: false });
      if (injectedShape !== true) {
        return `Direct toPublicProviderDto on unprojected doc failed: ${injectedShape}`;
      }
      if (injected.keywords.length !== 1 || injected.serviceAreas.length !== 1) {
        return `Nested objects survived in provider keywords/serviceAreas: ${JSON.stringify({ keywords: injected.keywords, serviceAreas: injected.serviceAreas })}`;
      }
      if (injected.logo !== 'https://cdn.example.in/logo.png') {
        return `Unexpected sanitized logo: ${JSON.stringify(injected.logo)}`;
      }
      if (injected.coverImage !== 'https://cdn.example.in/cover.jpg') {
        return `Unexpected sanitized coverImage: ${JSON.stringify(injected.coverImage)}`;
      }
      if (!Array.isArray(injected.gallery) || injected.gallery.length !== 2 || injected.gallery[1] !== 'https://cdn.example.in/g2.jpg') {
        return `Unexpected sanitized gallery: ${JSON.stringify(injected.gallery)}`;
      }
      const nestedSvc = injected.services[1];
      if (!nestedSvc || typeof nestedSvc !== 'object' || 'accountId' in nestedSvc || 'providerId' in nestedSvc || 'rejectionReason' in nestedSvc) {
        return `Nested service object in services leaked private fields: ${JSON.stringify(nestedSvc)}`;
      }
      return true;
    });

    await assertTest('JSON-LD LocalBusiness schema from public API response omits address, pinCode, and unconsented phone', async () => {
      const seoModule = await import('../frontend/src/utils/seo.js');
      const visibleRes = await makeRequest(baseUrl, '/api/v1/providers/apex-civil-engineering-works');
      const hiddenRes = await makeRequest(baseUrl, '/api/v1/providers/hidden-phone-consultants');
      const ldVisible = seoModule.buildLocalBusinessSchema(visibleRes.body?.data);
      const ldHidden = seoModule.buildLocalBusinessSchema(hiddenRes.body?.data);

      if (!ldVisible || !ldHidden) return 'Expected LocalBusiness JSON-LD for verified providers';
      if (ldVisible.address?.streetAddress || ldVisible.address?.postalCode) {
        return `JSON-LD leaked streetAddress/postalCode: ${JSON.stringify(ldVisible.address)}`;
      }
      if (ldVisible.address?.addressLocality !== 'Delhi' || ldVisible.address?.addressCountry !== 'IN') {
        return `Unexpected JSON-LD city/country: ${JSON.stringify(ldVisible.address)}`;
      }
      if (ldVisible.telephone !== '9811111111') {
        return `Expected consented telephone in JSON-LD, got ${ldVisible.telephone}`;
      }
      if ('telephone' in ldHidden) {
        return `Unconsented telephone leaked in JSON-LD: ${ldHidden.telephone}`;
      }
      console.log('     [Sample Sanitized Public Detail DTO]', JSON.stringify(visibleRes.body.data));
      console.log('     [Sample Generated JSON-LD]', JSON.stringify(ldVisible));
      return true;
    });

    await assertTest('Private Admin & Provider Portal endpoints reject unauthenticated callers with HTTP 401', async () => {
      const adminRes = await makeRequest(baseUrl, '/api/v1/admin/providers');
      if (adminRes.status !== 401) return `Expected 401 on admin/providers, got ${adminRes.status}`;
      const dashRes = await makeRequest(baseUrl, '/api/v1/provider/dashboard');
      if (dashRes.status !== 401) return `Expected 401 on provider/dashboard, got ${dashRes.status}`;
      const meRes = await makeRequest(baseUrl, '/api/v1/provider/auth/me');
      if (meRes.status !== 401) return `Expected 401 on provider/auth/me, got ${meRes.status}`;
      return true;
    });

    console.log('\n════════════════════════════════════════════════════════════════════════');
    console.log(`  Public Provider Security Suite: ${passed} PASSED, ${failed} FAILED / ${passed + failed} total`);
    console.log('════════════════════════════════════════════════════════════════════════\n');
  } finally {
    restoreProvider();
    restoreService();
    categoryService.getPublicCategories = origGetCategories;
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
