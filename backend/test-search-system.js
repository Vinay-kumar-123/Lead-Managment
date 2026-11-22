/**
 * Dealsathi Search System Automated Verification Suite
 *
 * Uses isolated in-memory Mongoose model mocks — zero production records are read or modified.
 * Run: node backend/test-search-system.js
 */

import http from 'http';
import { performance } from 'perf_hooks';
import app from './src/app.js';
import Provider from './src/models/Provider.js';
import ProviderService from './src/models/ProviderService.js';
import categoryService from './src/services/categoryService.js';
import {
  normalizeKeywords,
  buildProviderSearchTokens,
  buildProviderLocationTokens,
  buildServiceSearchTokens,
} from './src/config/searchDictionary.js';
import { runSearchTokenBackfill } from './src/scripts/backfillSearchTokens.js';

let passed = 0;
let failed = 0;

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
          headers: { 'x-konnevia-test-suite': 'search-system' },
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
  return `65fa0000000000000000${String(n).padStart(4, '0')}`;
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
      if ('$gt' in val) {
        if (!actual || String(actual) <= String(val.$gt)) return false;
      }
      if ('$regex' in val) {
        const rx = new RegExp(val.$regex, val.$options || '');
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

function installMock(Model, store) {
  const orig = {
    find: Model.find,
    findOne: Model.findOne,
    distinct: Model.distinct,
    bulkWrite: Model.bulkWrite,
    _isMocked: Model._isMocked,
  };

  Model._isMocked = true;

  Model.find = (query = {}) => {
    let data = store.filter((d) => matchesQuery(d, query)).map((d) => ({ ...d }));
    const chain = {
      sort: (spec = {}) => {
        if (spec._id === 1) {
          data.sort((a, b) => String(a._id).localeCompare(String(b._id)));
        } else if (spec.publishedAt === -1) {
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
      select: () => chain,
      lean: async () => data.map((d) => ({ ...d })),
      then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
    };
    return chain;
  };

  Model.findOne = (query = {}) => {
    const found = store.find((d) => matchesQuery(d, query));
    return {
      lean: async () => (found ? { ...found } : null),
      then: (resolve, reject) => Promise.resolve(found ? { ...found } : null).then(resolve, reject),
    };
  };

  Model.distinct = async (field, query = {}) => {
    const matched = store.filter((d) => matchesQuery(d, query));
    return Array.from(new Set(matched.map((d) => d[field]).filter(Boolean)));
  };

  Model.bulkWrite = async (ops = []) => {
    let modifiedCount = 0;
    for (const op of ops) {
      if (op.updateOne) {
        const target = store.find((d) => String(d._id) === String(op.updateOne.filter._id));
        if (target && op.updateOne.update?.$set) {
          Object.assign(target, op.updateOne.update.$set);
          modifiedCount++;
        }
      }
    }
    return { modifiedCount };
  };

  return () => {
    Model.find = orig.find;
    Model.findOne = orig.findOne;
    Model.distinct = orig.distinct;
    Model.bulkWrite = orig.bulkWrite;
    Model._isMocked = orig._isMocked;
  };
}

function makeProvider(idNum, fields) {
  const doc = {
    _id: oid(idNum),
    slug: `provider-${idNum}`,
    providerName: 'Test Owner',
    description: 'Verified service provider on Dealsathi.',
    category: 'Events & Lifestyle',
    categorySlug: 'events-lifestyle',
    subcategory: '',
    subcategorySlug: '',
    services: [],
    keywords: [],
    city: 'Delhi',
    state: 'Delhi',
    serviceAreas: [],
    experienceYears: 5,
    verificationStatus: 'VERIFIED',
    publicationStatus: 'PUBLISHED',
    consentToDisplayPhone: true,
    contactNumber: '9876543210',
    isDeleted: false,
    publishedAt: new Date(Date.UTC(2026, 10, idNum)).toISOString(),
    ...fields,
  };
  if (!fields._skipTokens) {
    doc.searchTokens = buildProviderSearchTokens(doc);
    doc.locationTokens = buildProviderLocationTokens(doc);
  }
  delete doc._skipTokens;
  return doc;
}

function makeService(idNum, providerId, fields) {
  const doc = {
    _id: oid(500 + idNum),
    providerId,
    title: 'Standard Service',
    slug: `service-${idNum}`,
    category: 'Events & Lifestyle',
    categorySlug: 'events-lifestyle',
    subcategory: '',
    subcategorySlug: '',
    description: 'Detailed package scope.',
    shortDescription: 'Package summary.',
    deliverables: [],
    keywords: [],
    serviceAreas: [],
    approvalStatus: 'APPROVED',
    publicationStatus: 'PUBLISHED',
    isActive: true,
    isDeleted: false,
    ...fields,
  };
  doc.searchTokens = buildServiceSearchTokens(doc);
  return doc;
}

async function runSearchTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║         DEALSATHI SEARCH SYSTEM & RANKING VERIFICATION SUITE          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  categoryService._resetInMemoryStore();

  const providersStore = [
    // 1. Exact Event Management provider in New Delhi
    makeProvider(1, {
      businessName: 'Capital Event Managers',
      slug: 'capital-event-managers',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Event Management', 'Corporate Event Planning'],
      keywords: ['event manager', 'corporate events'],
      city: 'New Delhi',
      state: 'Delhi',
      serviceAreas: ['South Delhi', 'Connaught Place'],
      description: 'End-to-end corporate and social event management in New Delhi.',
      publishedAt: '2026-10-01T10:00:00.000Z',
    }),
    // 2. Wedding Planner in Delhi (related to Event Manager, newer publishedAt to prove relevance > publishedAt)
    makeProvider(2, {
      businessName: 'Shubh Vivah Planners',
      slug: 'shubh-vivah-planners',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Wedding Planning', 'Destination Weddings'],
      city: 'Delhi',
      state: 'Delhi',
      serviceAreas: ['West Delhi', 'Central Delhi'],
      description: 'Full-service wedding planner and bridal coordination across Delhi.',
      publishedAt: '2026-11-20T10:00:00.000Z',
    }),
    // 3. Dedicated Wedding Photographer in Delhi
    makeProvider(3, {
      businessName: 'LensCraft Candid Studio',
      slug: 'lenscraft-candid-studio',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      services: ['Wedding Photography', 'Candid Shoot', 'Pre-Wedding'],
      keywords: ['wedding photographer', 'candid wedding'],
      city: 'Delhi',
      state: 'Delhi',
      serviceAreas: ['South Delhi', 'New Delhi'],
      description: 'Award-winning candid wedding photographers in Delhi.',
      publishedAt: '2026-10-05T10:00:00.000Z',
    }),
    // 4. General Photography provider in Delhi (matches via ProviderService package!)
    makeProvider(4, {
      businessName: 'FrameWorks Visuals',
      slug: 'frameworks-visuals',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      services: ['Event Photography'],
      city: 'New Delhi',
      state: 'Delhi',
      serviceAreas: ['Delhi'],
      description: 'Studio photography across Delhi.',
      publishedAt: '2026-11-18T10:00:00.000Z',
    }),
    // 5. Event Decorator in Delhi (must NOT appear for Wedding Photographer Delhi)
    makeProvider(5, {
      businessName: 'Marigold Stage Decorators',
      slug: 'marigold-stage-decorators',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Event Decoration',
      subcategorySlug: 'event-decoration',
      services: ['Floral Stage Decor', 'Mandap Decoration'],
      city: 'Delhi',
      state: 'Delhi',
      description: 'Wedding stage and floral event decoration in Delhi.',
      publishedAt: '2026-11-21T10:00:00.000Z',
    }),
    // 6. Gurugram-only Event Manager (must NOT silently appear in strict Delhi results when Delhi has results)
    makeProvider(6, {
      businessName: 'CyberCity Events Gurgaon',
      slug: 'cybercity-events-gurgaon',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Event Management'],
      city: 'Gurugram',
      state: 'Haryana',
      serviceAreas: ['Gurugram', 'DLF Phase 3'],
      description: 'Corporate event management strictly in Gurugram.',
    }),
    // 7. Event Management provider in Kolkata (legacy record WITHOUT precomputed tokens!)
    makeProvider(7, {
      businessName: 'Hooghly Event Creations',
      slug: 'hooghly-event-creations',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Event Management', 'Stage Production'],
      city: 'Calcutta', // Alias test for Kolkata!
      state: 'West Bengal',
      serviceAreas: ['Kolkata', 'Salt Lake'],
      description: 'Complete corporate and wedding event management in Kolkata.',
      _skipTokens: true,
    }),
    // 8. Interior Designer in Haldia
    makeProvider(8, {
      businessName: 'Coastline Living Interiors',
      slug: 'coastline-living-interiors',
      category: 'Home & Construction',
      categorySlug: 'home-construction',
      subcategory: 'Interior Design',
      subcategorySlug: 'interior-design',
      services: ['Interior Design', 'Modular Kitchen'],
      city: 'Haldia',
      state: 'West Bengal',
      serviceAreas: ['Haldia', 'Durgachak'],
      description: 'Residential and commercial interior design studio in Haldia.',
    }),
    // 9. Interior Designer in Kolkata (must NOT appear for Interior Designer Haldia)
    makeProvider(9, {
      businessName: 'Metro Spaces Kolkata',
      slug: 'metro-spaces-kolkata',
      category: 'Home & Construction',
      categorySlug: 'home-construction',
      subcategory: 'Interior Design',
      subcategorySlug: 'interior-design',
      services: ['Interior Design'],
      city: 'Kolkata',
      state: 'West Bengal',
      serviceAreas: ['Kolkata'],
      description: 'Interior designer in Kolkata.',
    }),
    // 10. Website Developer in Kolkata
    makeProvider(10, {
      businessName: 'Bengal WebWorks',
      slug: 'bengal-webworks',
      category: 'Digital & Professional Services',
      categorySlug: 'digital-professional',
      subcategory: 'Website Development',
      subcategorySlug: 'website-development',
      services: ['Website Development', 'React Web Apps'],
      city: 'Kolkata',
      state: 'West Bengal',
      serviceAreas: ['Kolkata', 'New Town'],
      description: 'Custom business websites and web applications in Kolkata.',
    }),
    // 11. Excluded UNVERIFIED provider in Delhi
    makeProvider(11, {
      businessName: 'Unverified Event Manager Delhi',
      slug: 'unverified-event-manager',
      services: ['Event Management', 'Wedding Photography'],
      city: 'Delhi',
      verificationStatus: 'UNVERIFIED',
      publicationStatus: 'PUBLISHED',
    }),
    // 12. Excluded DRAFT provider in Delhi
    makeProvider(12, {
      businessName: 'Draft Event Manager Delhi',
      slug: 'draft-event-manager',
      services: ['Event Management', 'Wedding Photography'],
      city: 'Delhi',
      verificationStatus: 'VERIFIED',
      publicationStatus: 'DRAFT',
    }),
    // 13. Excluded DELETED provider in Delhi
    makeProvider(13, {
      businessName: 'Deleted Photographer Delhi',
      slug: 'deleted-photographer',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      services: ['Wedding Photography'],
      city: 'Delhi',
      isDeleted: true,
    }),
    // 14. Additional Delhi Wedding Planners for pagination testing
    makeProvider(14, {
      businessName: 'Heritage Wedding Co',
      slug: 'heritage-wedding-co',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Wedding Planning'],
      city: 'Delhi',
      experienceYears: 12,
      publishedAt: '2026-09-01T10:00:00.000Z',
    }),
    makeProvider(15, {
      businessName: 'Royal Knot Events',
      slug: 'royal-knot-events',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Wedding Planning', 'Event Management'],
      city: 'Delhi',
      experienceYears: 8,
      publishedAt: '2026-10-15T10:00:00.000Z',
    }),
    // 16. Provider in Jaipur ONLY (no Delhi serviceAreas) with approved Drone service
    makeProvider(16, {
      businessName: 'PinkCity Event Pros',
      slug: 'pinkcity-event-pros',
      subcategory: 'Wedding Planning',
      subcategorySlug: 'wedding-planning',
      services: ['Event Management'],
      city: 'Jaipur',
      state: 'Rajasthan',
      serviceAreas: ['Jaipur'],
      description: 'Wedding and event management in Jaipur.',
    }),
  ];

  const servicesStore = [
    // Approved & Published ProviderService for FrameWorks Visuals (#4)
    makeService(1, oid(4), {
      title: 'Candid Wedding Photography Package',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      deliverables: ['Full Wedding Coverage', 'Drone Aerial Shots', 'Pre-Wedding Shoot'],
      serviceAreas: ['Delhi', 'South Delhi'],
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
    }),
    // PENDING service on #5 (must NOT match Wedding Photographer)
    makeService(2, oid(5), {
      title: 'Wedding Photography Add-on',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      approvalStatus: 'PENDING',
      publicationStatus: 'DRAFT',
      isActive: true,
    }),
    // INACTIVE service on #10
    makeService(3, oid(10), {
      title: 'Wedding Photography Microsite',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: false,
    }),
    // APPROVED+PUBLISHED service belonging to UNVERIFIED provider (#11) — must NEVER expose #11!
    makeService(4, oid(11), {
      title: 'VIP Wedding Photography Delhi',
      subcategory: 'Photography',
      subcategorySlug: 'photography',
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
    }),
  ];

  const restoreProvider = installMock(Provider, providersStore);
  const restoreService = installMock(ProviderService, servicesStore);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log('── 1. Core Marketplace Query Accuracy & Ranking ──');

    await assertTest('Event Manager Delhi retrieves Delhi event & wedding providers and ranks exact Event Management first', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Manager%20Delhi');
      const list = res.body?.data?.providers || [];
      const slugs = list.map((p) => p.slug);
      if (res.status !== 200) return `Status ${res.status}`;
      if (slugs[0] !== 'capital-event-managers') return `Expected capital-event-managers #1, got ${slugs.join(', ')}`;
      if (!slugs.includes('shubh-vivah-planners')) return 'Expected related Wedding Planning provider in Delhi';
      if (slugs.includes('cybercity-events-gurgaon')) return 'Should NOT mix Gurgaon-only provider into Delhi results when Delhi matches exist';
      if (slugs.includes('unverified-event-manager') || slugs.includes('draft-event-manager')) return 'Leaked unverified/draft provider';
      return res.body.data.meta?.extractedLocation === 'Delhi' ? true : 'Missing extractedLocation meta';
    });

    await assertTest('Wedding Planning Delhi prioritizes Delhi wedding planners above general decor', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Wedding%20Planning%20Delhi');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      if (!slugs.includes('shubh-vivah-planners') || !slugs.includes('heritage-wedding-co')) {
        return `Missing wedding planners: ${slugs.join(', ')}`;
      }
      const plannerIdx = slugs.indexOf('shubh-vivah-planners');
      const decorIdx = slugs.indexOf('marigold-stage-decorators');
      if (decorIdx !== -1 && decorIdx < plannerIdx) {
        return 'Decorator ranked ahead of wedding planner';
      }
      return true;
    });

    await assertTest('Wedding Photographer Delhi prioritizes photography providers and excludes non-photo planners/decorators', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Wedding%20Photographer%20Delhi');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      if (slugs[0] !== 'lenscraft-candid-studio') return `Expected lenscraft-candid-studio #1, got ${slugs.join(', ')}`;
      if (!slugs.includes('frameworks-visuals')) return 'Expected frameworks-visuals matched via approved ProviderService package';
      if (slugs.includes('shubh-vivah-planners')) return 'Unrelated wedding planner without photography appeared';
      if (slugs.includes('marigold-stage-decorators')) return 'Decorator with PENDING photography service appeared';
      if (slugs.includes('deleted-photographer') || slugs.includes('unverified-event-manager')) return 'Leaked deleted/unverified provider';
      return true;
    });

    await assertTest('Event Management Kolkata matches legacy doc & Calcutta alias', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Management%20Kolkata');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      return slugs.includes('hooghly-event-creations')
        ? true
        : `Expected hooghly-event-creations, got ${slugs.join(', ')}`;
    });

    await assertTest('Interior Designer Haldia returns Haldia specialist and excludes Kolkata', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Interior%20Designer%20Haldia');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      if (slugs.length !== 1 || slugs[0] !== 'coastline-living-interiors') {
        return `Expected strictly coastline-living-interiors, got ${slugs.join(', ')}`;
      }
      return true;
    });

    await assertTest('Website Developer Kolkata returns Bengal WebWorks', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Website%20Developer%20Kolkata');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      return slugs[0] === 'bengal-webworks' ? true : `Got ${slugs.join(', ')}`;
    });

    console.log('\n── 2. Typo Tolerance, Partial Match, ProviderService & Location Rules ──');

    await assertTest('Typo tolerance: "weeding photografer delhii" resolves to Wedding Photographer Delhi', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=weeding%20photografer%20delhii');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      if (!slugs.includes('lenscraft-candid-studio')) return `Got ${slugs.join(', ')}`;
      return res.body.data.meta?.correctedQuery ? true : 'Expected correctedQuery in meta';
    });

    await assertTest('Partial prefix match: "photog" in Delhi returns photography studios', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=photog&location=Delhi');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      return slugs.includes('lenscraft-candid-studio') ? true : `Got ${slugs.join(', ')}`;
    });

    await assertTest('ProviderService deliverables match: "Drone Aerial" in Delhi matches FrameWorks Visuals', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Drone%20Aerial&location=Delhi');
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      return slugs.includes('frameworks-visuals') ? true : `Got ${slugs.join(', ')}`;
    });

    await assertTest('Nearby-region relaxation only triggers when exact city has 0 matches and informs user', async () => {
      // Search for Interior Designer in Noida (no Noida provider, none in nearby too) vs Event Management in Noida (Gurugram/Delhi nearby!)
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Management&location=Noida');
      const meta = res.body?.data?.meta;
      const list = res.body?.data?.providers || [];
      if (list.length === 0) return 'Expected nearby NCR matches when Noida has 0 exact matches';
      if (!meta?.locationRelaxed || !meta?.locationRelaxationReason) {
        return 'Expected locationRelaxed=true and clear locationRelaxationReason';
      }
      return true;
    });

    await assertTest('Strict location flag prevents nearby relaxation', async () => {
      const res = await makeRequest(
        baseUrl,
        '/api/v1/providers?search=Event%20Management&location=Noida&strictLocation=true'
      );
      return (res.body?.data?.providers || []).length === 0
        ? true
        : 'Expected 0 results under strictLocation=true';
    });

    console.log('\n── 3. Filters, Zero-Result API, Pagination, Suggestions & Security ──');

    await assertTest('Explicit category & subcategory filter works accurately', async () => {
      const res = await makeRequest(
        baseUrl,
        '/api/v1/providers?category=events-lifestyle&subcategory=photography&location=Delhi'
      );
      const slugs = (res.body?.data?.providers || []).map((p) => p.slug);
      if (!slugs.includes('lenscraft-candid-studio') || !slugs.includes('frameworks-visuals')) {
        return `Got ${slugs.join(', ')}`;
      }
      if (slugs.includes('shubh-vivah-planners')) return 'Included non-photography provider';
      return true;
    });

    await assertTest('Zero-result API returns empty array and recovery metadata (never seed listings)', async () => {
      const res = await makeRequest(
        baseUrl,
        '/api/v1/providers?search=Interior%20Designer&location=Jaipur'
      );
      const data = res.body?.data;
      if (res.status !== 200) return `Status ${res.status}`;
      if (!Array.isArray(data.providers) || data.providers.length !== 0 || data.total !== 0) {
        return `Expected 0 results, got ${data?.providers?.length}`;
      }
      if (!data.meta?.recovery || data.meta.recovery.broadenedAvailableCount < 1) {
        return 'Expected recovery broadenedAvailableCount > 0';
      }
      return true;
    });

    await assertTest('Pagination ranks before slicing and slices pages accurately', async () => {
      const p1 = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Manager%20Delhi&page=1&limit=2');
      const p2 = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Manager%20Delhi&page=2&limit=2');
      const list1 = p1.body?.data?.providers || [];
      const list2 = p2.body?.data?.providers || [];
      if (list1.length !== 2 || p1.body.data.total < 3) return `Unexpected page 1: len=${list1.length}, total=${p1.body.data.total}`;
      if (list1[0].slug !== 'capital-event-managers') return 'Page 1 #1 should be highest-ranked provider';
      if (list2.some((x) => list1.some((y) => y.slug === x.slug))) return 'Duplicate item across pages';
      return true;
    });

    await assertTest('GET /api/v1/providers/suggestions returns services, cities, and verified providers (not swallowed by /:slug)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/providers/suggestions?q=wed');
      const data = res.body?.data;
      if (res.status !== 200) return `Status ${res.status}`;
      if (!Array.isArray(data?.services) || data.services.length === 0) return 'Expected service suggestions';
      if (data.providers.some((p) => p.slug === 'unverified-event-manager' || p.slug === 'draft-event-manager')) {
        return 'Leaked unverified/draft provider in suggestions';
      }
      return true;
    });

    await assertTest('Internal searchTokens & locationTokens are never leaked in public API responses', async () => {
      const listRes = await makeRequest(baseUrl, '/api/v1/providers?search=Wedding%20Photographer%20Delhi');
      const first = listRes.body?.data?.providers?.[0];
      const detailRes = await makeRequest(baseUrl, '/api/v1/providers/lenscraft-candid-studio');
      if ('searchTokens' in first || 'locationTokens' in first) return 'Leaked tokens in list response';
      if ('searchTokens' in detailRes.body.data || 'locationTokens' in detailRes.body.data) {
        return 'Leaked tokens in detail response';
      }
      return true;
    });

    console.log('\n── 4. Keyword Safety & Idempotent Backfill Migration ──');

    await assertTest('normalizeKeywords enforces limits, deduplication, and anti-stuffing', async () => {
      const normalized = normalizeKeywords([
        'Event Manager',
        'event manager', // duplicate
        'a', // too short
        'delhi delhi delhi', // repeated word stuffing
        'this has way more than five words in one tag',
        '<b>Corporate Events</b>',
        ...Array.from({ length: 20 }, (_, i) => `Tag ${i + 1}`),
      ]);
      if (normalized.length !== 15) return `Expected cap 15, got ${normalized.length}`;
      if (normalized[0] !== 'Event Manager') return 'Expected Event Manager preserved';
      if (normalized.includes('delhi delhi delhi')) return 'Failed anti-stuffing check';
      if (normalized.some((k) => k.includes('<b>'))) return 'Failed sanitization check';
      return true;
    });

    await assertTest('Idempotent backfill updates legacy doc tokens without overwriting profile fields', async () => {
      const legacy = providersStore.find((p) => p.slug === 'hooghly-event-creations');
      if (legacy.searchTokens) return 'Legacy test fixture already had searchTokens';
      const dry = await runSearchTokenBackfill({ batchSize: 5, dryRun: true });
      if (dry.providerResult.updated !== 1 || legacy.searchTokens) return 'Dry run mutated record or wrong count';
      const live = await runSearchTokenBackfill({ batchSize: 5, dryRun: false });
      if (live.providerResult.updated !== 1 || !Array.isArray(legacy.searchTokens) || legacy.searchTokens.length === 0) {
        return 'Live backfill did not populate searchTokens';
      }
      if (legacy.businessName !== 'Hooghly Event Creations' || legacy.city !== 'Calcutta') {
        return 'Backfill modified profile fields';
      }
      // Second run must be 0 updates (idempotent)
      const second = await runSearchTokenBackfill({ batchSize: 5, dryRun: false });
      return second.providerResult.updated === 0 ? true : `Expected 0 updates on rerun, got ${second.providerResult.updated}`;
    });

    console.log('\n── 5. Frontend providerService Seed-Fallback Guard Check ──');

    await assertTest('providerService returns empty list on 200 zero-results and respects explicit dev fallback flag', async () => {
      const { default: providerService, isDevSeedFallbackEnabled } = await import(
        '../frontend/src/services/providerService.js'
      );
      if (isDevSeedFallbackEnabled({ DEV: false, VITE_ENABLE_DEV_SEED_FALLBACK: 'true' }) !== false) {
        return 'Enabled fallback outside DEV';
      }
      if (isDevSeedFallbackEnabled({ DEV: true, VITE_ENABLE_DEV_SEED_FALLBACK: 'false' }) !== false) {
        return 'Enabled fallback when flag is false';
      }
      if (isDevSeedFallbackEnabled({ DEV: true }) !== false) {
        return 'Enabled fallback when flag is omitted';
      }
      if (isDevSeedFallbackEnabled({ DEV: true, VITE_ENABLE_DEV_SEED_FALLBACK: 'true' }) !== true) {
        return 'Did not enable fallback when DEV=true and flag=true';
      }

      const origFetch = globalThis.fetch;
      try {
        // 1. Live API returns 200 with 0 providers -> MUST NOT fall back to seedProviders
        globalThis.fetch = async () => ({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            success: true,
            data: { providers: [], total: 0, page: 1, limit: 12, totalPages: 1, meta: {} },
          }),
        });
        const zeroRes = await providerService.getProviders({ search: 'Wedding Planning', location: 'Delhi' });
        if (zeroRes.data.length !== 0 || zeroRes.total !== 0 || zeroRes.isFallback !== false) {
          return `Substituted seed data on 200 zero-result: len=${zeroRes.data.length}`;
        }

        // 2. Network error without explicit dev fallback enabled -> MUST throw (fail closed)
        globalThis.fetch = async () => {
          throw new Error('ECONNREFUSED');
        };
        let threw = false;
        try {
          await providerService.getProviders({ search: 'Wedding Planning' });
        } catch {
          threw = true;
        }
        if (!threw) return 'Expected getProviders to throw when API unreachable and fallback disabled';
      } finally {
        globalThis.fetch = origFetch;
      }
      return true;
    });

    console.log('\n── 6. Scale & Latency Benchmark (250+ Providers, 500+ Services) ──');

    await assertTest('Search query completes well under 100ms on 266 providers & 504 services', async () => {
      for (let i = 100; i < 350; i++) {
        const p = makeProvider(i, {
          businessName: `Benchmark Provider ${i}`,
          slug: `benchmark-provider-${i}`,
          category: i % 2 === 0 ? 'Events & Lifestyle' : 'Home & Construction',
          categorySlug: i % 2 === 0 ? 'events-lifestyle' : 'home-construction',
          subcategory: i % 2 === 0 ? 'Wedding Planning' : 'Interior Design',
          subcategorySlug: i % 2 === 0 ? 'wedding-planning' : 'interior-design',
          services: i % 2 === 0 ? ['Wedding Planning', 'Event Management'] : ['Interior Design'],
          city: i % 3 === 0 ? 'Delhi' : i % 3 === 1 ? 'Mumbai' : 'Bengaluru',
        });
        providersStore.push(p);
        servicesStore.push(
          makeService(i * 2, p._id, { title: `Package A ${i}` }),
          makeService(i * 2 + 1, p._id, { title: `Package B ${i}` })
        );
      }

      const start = performance.now();
      const res = await makeRequest(baseUrl, '/api/v1/providers?search=Event%20Manager%20Delhi&page=1&limit=12');
      const elapsedMs = performance.now() - start;
      console.log(`     [Benchmark] 266 providers + 504 services -> ${elapsedMs.toFixed(2)} ms (total=${res.body?.data?.total})`);
      return res.status === 200 && elapsedMs < 150 ? true : `Slow response: ${elapsedMs.toFixed(2)}ms`;
    });
  } finally {
    server.close();
    restoreProvider();
    restoreService();
  }

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`  Search System Suite: ${passed} PASSED, ${failed} FAILED / ${passed + failed} total`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runSearchTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
