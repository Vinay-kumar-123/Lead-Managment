import http from 'http';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import app from './src/app.js';
import Admin from './src/models/Admin.js';
import Lead from './src/models/Lead.js';
import Provider from './src/models/Provider.js';
import ProviderAccount from './src/models/ProviderAccount.js';
import ProviderService from './src/models/ProviderService.js';
import Blog from './src/models/Blog.js';
import Category from './src/models/Category.js';
import ActivityLog from './src/models/ActivityLog.js';
import MediaCleanupTask from './src/models/MediaCleanupTask.js';
import categoryService from './src/services/categoryService.js';
import storageService from './src/services/storageService.js';
import env from './src/config/env.js';

let passed = 0;
let failed = 0;
const results = [];

async function assertTest(label, fn) {
  try {
    const res = await fn();
    if (res === true) {
      passed++;
      console.log(`  ✅ PASS: ${label}`);
      results.push({ label, status: 'PASS' });
    } else {
      failed++;
      console.log(`  ❌ FAIL: ${label} — ${res}`);
      results.push({ label, status: 'FAIL', reason: res });
    }
  } catch (err) {
    failed++;
    console.log(`  ❌ ERROR: ${label} — ${err.message}`);
    results.push({ label, status: 'ERROR', reason: err.message });
  }
}

function makeRequest(baseUrl, reqPath, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const payload =
      body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload !== null
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json || raw,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function oid(hexSuffix) {
  return `65f90000000000000000${String(hexSuffix).padStart(4, '0')}`;
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

    // Handle nested dot path like 'shopImage.publicId'
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
        if (!arr.includes(String(actual))) return false;
      }
      if ('$gt' in val) {
        if (!actual || new Date(actual) <= new Date(val.$gt)) return false;
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
    } else {
      if (String(actual) !== String(val)) return false;
    }
  }
  return true;
}

function makeWrapDoc(collection, raw) {
  const doc = { ...raw };
  doc.toObject = () => ({ ...doc });
  doc.save = async () => {
    const idx = collection.findIndex((d) => String(d._id) === String(doc._id));
    if (idx >= 0) collection[idx] = doc;
    else collection.push(doc);
    return doc;
  };
  return doc;
}

function installCollectionMock(Model, storeArray) {
  const orig = {
    find: Model.find,
    findOne: Model.findOne,
    findById: Model.findById,
    countDocuments: Model.countDocuments,
    exists: Model.exists,
    create: Model.create,
    deleteOne: Model.deleteOne,
    deleteMany: Model.deleteMany,
    updateOne: Model.updateOne,
    updateMany: Model.updateMany,
  };

  const makeChain = (rows) => {
    let data = [...rows];
    const chain = {
      sort: () => chain,
      limit: (n) => {
        data = data.slice(0, n);
        return chain;
      },
      skip: (n) => {
        data = data.slice(n);
        return chain;
      },
      select: () => chain,
      populate: () => chain,
      lean: async () => data.map((d) => ({ ...d })),
      then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
    };
    return chain;
  };

  Model.find = (query = {}) => {
    const matched = storeArray.filter((d) => matchesQuery(d, query)).map((d) => makeWrapDoc(storeArray, d));
    return makeChain(matched);
  };

  Model.findOne = (query = {}) => {
    const found = storeArray.find((d) => matchesQuery(d, query));
    const wrapped = found ? makeWrapDoc(storeArray, found) : null;
    return {
      lean: async () => (found ? { ...found } : null),
      then: (resolve, reject) => Promise.resolve(wrapped).then(resolve, reject),
    };
  };

  Model.findById = (id) => {
    const found = storeArray.find((d) => String(d._id) === String(id));
    const wrapped = found ? makeWrapDoc(storeArray, found) : null;
    return {
      populate: () => ({
        lean: async () => (found ? { ...found } : null),
      }),
      lean: async () => (found ? { ...found } : null),
      then: (resolve, reject) => Promise.resolve(wrapped).then(resolve, reject),
    };
  };

  Model.countDocuments = async (query = {}) =>
    storeArray.filter((d) => matchesQuery(d, query)).length;

  Model.exists = async (query = {}) => {
    const found = storeArray.find((d) => matchesQuery(d, query));
    return found ? { _id: found._id } : null;
  };

  Model.create = async (payload) => {
    const doc = makeWrapDoc(storeArray, {
      _id: oid(storeArray.length + 500),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    });
    storeArray.push(doc);
    return doc;
  };

  Model.deleteOne = async (query = {}) => {
    const idx = storeArray.findIndex((d) => matchesQuery(d, query));
    if (idx === -1) return { deletedCount: 0 };
    storeArray.splice(idx, 1);
    return { deletedCount: 1 };
  };

  Model.deleteMany = async (query = {}) => {
    let count = 0;
    for (let i = storeArray.length - 1; i >= 0; i--) {
      if (matchesQuery(storeArray[i], query)) {
        storeArray.splice(i, 1);
        count++;
      }
    }
    return { deletedCount: count };
  };

  Model.updateOne = async (query = {}, update = {}) => {
    const target = storeArray.find((d) => matchesQuery(d, query));
    if (!target) return { modifiedCount: 0 };
    if (update.$set) Object.assign(target, update.$set);
    if (update.$pull) {
      for (const [field, val] of Object.entries(update.$pull)) {
        if (Array.isArray(target[field])) {
          target[field] = target[field].filter((x) => x !== val);
        }
      }
    }
    return { modifiedCount: 1 };
  };

  Model.updateMany = async (query = {}, update = {}) => {
    let count = 0;
    for (const target of storeArray) {
      if (matchesQuery(target, query)) {
        if (update.$set) Object.assign(target, update.$set);
        count++;
      }
    }
    return { modifiedCount: count };
  };

  return () => Object.assign(Model, orig);
}

async function runDeletionSystemTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   DEALSATHI GLOBAL ADMIN DELETION & CLEANUP VERIFICATION SUITE         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  // Isolate upload directory and Cloudinary credentials for test
  const origUploadDir = env.storage.uploadDir;
  const origCloudConfig = { ...env.storage.cloudinary };
  const origStorageProvider = env.storage.provider;
  const tempUploadDir = path.resolve(process.cwd(), 'uploads-test-deletion');
  fs.mkdirSync(tempUploadDir, { recursive: true });
  env.storage.uploadDir = tempUploadDir;
  env.storage.cloudinary = {
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    folder: 'konnevia/providers',
  };

  const cloudinaryCalls = [];
  let failCloudinaryForId = null;
  storageService._setCloudinaryClient({
    uploader: {
      destroy: async (publicId) => {
        cloudinaryCalls.push(publicId);
        if (failCloudinaryForId && publicId === failCloudinaryForId) {
          throw new Error('Simulated Cloudinary 503 outage');
        }
        return { result: 'ok' };
      },
    },
  });

  // Create in-memory isolated collections
  const leadsStore = [
    {
      _id: oid(1),
      referenceId: 'DS-ENQ-1001',
      type: 'enquiry',
      name: 'Rohan Mehta',
      phone: '9876543210',
      email: 'rohan@example.com',
      category: 'Home & Construction',
      service: 'Interior Design',
      city: 'Pune',
      requirements: 'Full 3BHK interior design',
      status: 'assigned',
      assignedProviderId: oid(10),
      isDeleted: false,
      createdAt: new Date(),
    },
    {
      _id: oid(2),
      referenceId: 'DS-ENQ-1002',
      type: 'enquiry',
      name: 'Unrelated Customer',
      phone: '9811112222',
      email: 'unrelated@example.com',
      category: 'Events & Lifestyle',
      service: 'Photography',
      city: 'Mumbai',
      requirements: 'Wedding shoot',
      status: 'new',
      assignedProviderId: null,
      isDeleted: false,
      createdAt: new Date(),
    },
    {
      _id: oid(3),
      referenceId: 'DS-PTR-2001',
      type: 'partner',
      name: 'Vikram Singh',
      contactPerson: 'Vikram Singh',
      businessName: 'Studio Vastu Interiors',
      phone: '9822233344',
      email: 'vikram@vastu.in',
      category: 'Home & Construction',
      city: 'Delhi',
      status: 'qualified',
      shopImage: {
        url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/konnevia/providers/shared-shop.jpg',
        publicId: 'konnevia/providers/shared-shop',
      },
      isDeleted: false,
      createdAt: new Date(),
    },
  ];

  const providersStore = [
    {
      _id: oid(10),
      businessName: 'Studio Vastu Interiors',
      providerName: 'Vikram Singh',
      slug: 'studio-vastu-interiors',
      description: 'Award-winning residential interior designers.',
      category: 'Home & Construction',
      categorySlug: 'home-construction',
      subcategory: 'Interior Design',
      subcategorySlug: 'interior-design',
      services: ['Interior Design', 'Modular Kitchen'],
      contactNumber: '9822233344',
      email: 'vikram@vastu.in',
      city: 'Delhi',
      accountId: oid(20),
      googleSub: 'google-sub-vastu',
      sourceApplicationId: oid(3),
      shopImage: {
        url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/konnevia/providers/shared-shop.jpg',
        publicId: 'konnevia/providers/shared-shop',
      },
      verificationStatus: 'VERIFIED',
      publicationStatus: 'PUBLISHED',
      consentToDisplayPhone: true,
      isDeleted: false,
      createdAt: new Date(),
    },
    {
      _id: oid(11),
      businessName: 'Unrelated Craft Events',
      providerName: 'Neha Rao',
      slug: 'unrelated-craft-events',
      description: 'Wedding planning and decor studio.',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      services: ['Wedding Planning'],
      contactNumber: '9833344455',
      city: 'Jaipur',
      verificationStatus: 'VERIFIED',
      publicationStatus: 'PUBLISHED',
      consentToDisplayPhone: true,
      isDeleted: false,
      createdAt: new Date(),
    },
  ];

  const accountsStore = [
    {
      _id: oid(20),
      googleSub: 'google-sub-vastu',
      email: 'vikram@vastu.in',
      emailVerified: true,
      role: 'PROVIDER',
      providerProfileId: oid(10),
      onboardingCompleted: true,
      sessionToken: 'provider-vastu-active-session-token',
      sessionExpiresAt: new Date(Date.now() + 3600_000),
      isActive: true,
      isDeleted: false,
    },
  ];

  const servicesStore = [
    {
      _id: oid(30),
      providerId: oid(10),
      accountId: oid(20),
      title: 'Modular Kitchen',
      slug: 'modular-kitchen',
      category: 'Home & Construction',
      categorySlug: 'home-construction',
      subcategory: 'Interior Design',
      subcategorySlug: 'interior-design',
      description: 'End-to-end modular kitchen execution.',
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
    },
    {
      _id: oid(31),
      providerId: oid(10),
      accountId: oid(20),
      title: 'Full Home Design',
      slug: 'full-home-design',
      category: 'Home & Construction',
      categorySlug: 'home-construction',
      subcategory: 'Interior Design',
      subcategorySlug: 'interior-design',
      description: 'Full home turnkey design package.',
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
    },
    {
      _id: oid(32),
      providerId: oid(11),
      title: 'Royal Wedding Decor',
      slug: 'royal-wedding-decor',
      category: 'Events & Lifestyle',
      categorySlug: 'events-lifestyle',
      description: 'Unrelated provider service.',
      approvalStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED',
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
    },
  ];

  const blogsStore = [
    {
      _id: oid(40),
      title: 'Decorate With Confidence',
      slug: 'decorate-with-confidence',
      excerpt: 'Actionable checklist',
      content: 'Content body',
      category: 'Home & Construction',
      coverImage: 'https://res.cloudinary.com/test-cloud/image/upload/v1/konnevia/providers/blog-hero-fail.jpg',
      status: 'published',
      publishedAt: new Date(),
      isDeleted: false,
      createdAt: new Date(),
    },
  ];

  const activityLogsStore = [];
  const cleanupTasksStore = [];

  // Mock Mongoose connection state for public blog/provider queries? Wait:
  // providerController checks Model directly; blogController checks mongoose.connection.readyState === 1.
  // We'll leave mongoose.connection.readyState as-is for blogController or test admin endpoints directly,
  // and also check categoryService in-memory store.
  const restores = [
    installCollectionMock(Lead, leadsStore),
    installCollectionMock(Provider, providersStore),
    installCollectionMock(ProviderAccount, accountsStore),
    installCollectionMock(ProviderService, servicesStore),
    installCollectionMock(Blog, blogsStore),
    installCollectionMock(ActivityLog, activityLogsStore),
    installCollectionMock(MediaCleanupTask, cleanupTasksStore),
  ];
  Provider._isMocked = true;

  const origAdminFindOne = Admin.findOne;
  const SUPER_TOKEN = 'tok-super-admin';
  const ADMIN_TOKEN = 'tok-admin';
  const OPS_TOKEN = 'tok-ops-manager';
  const CONTENT_TOKEN = 'tok-content-manager';
  const SUPPORT_TOKEN = 'tok-support-agent';

  Admin.findOne = async (query) => {
    const map = {
      [SUPER_TOKEN]: { _id: oid(901), email: 'super@dealsathi.in', role: 'SUPER_ADMIN' },
      [ADMIN_TOKEN]: { _id: oid(902), email: 'admin@dealsathi.in', role: 'ADMIN' },
      [OPS_TOKEN]: { _id: oid(903), email: 'ops@dealsathi.in', role: 'OPERATIONS_MANAGER' },
      [CONTENT_TOKEN]: { _id: oid(904), email: 'content@dealsathi.in', role: 'CONTENT_MANAGER' },
      [SUPPORT_TOKEN]: { _id: oid(905), email: 'support@dealsathi.in', role: 'SUPPORT_AGENT' },
    };
    const found = map[query?.sessionToken];
    return found ? { ...found, sessionToken: query.sessionToken, sessionExpiresAt: new Date(Date.now() + 3600_000) } : null;
  };

  categoryService._resetInMemoryStore();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const superH = { Authorization: `Bearer ${SUPER_TOKEN}` };
  const adminH = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const opsH = { Authorization: `Bearer ${OPS_TOKEN}` };
  const contentH = { Authorization: `Bearer ${CONTENT_TOKEN}` };
  const supportH = { Authorization: `Bearer ${SUPPORT_TOKEN}` };

  try {
    // 1. SECURITY & AUTHORIZATION TESTS
    console.log('── 1. Security, RBAC, Validation & IDOR Guards ──');

    await assertTest('Unauthenticated DELETE /api/v1/admin/providers/:id returns 401', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}`, { method: 'DELETE' });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('SUPPORT_AGENT cannot soft-delete enquiries, providers, services, categories, or blogs (403)', async () => {
      const checks = await Promise.all([
        makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}`, { method: 'DELETE', headers: supportH }),
        makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}`, { method: 'DELETE', headers: supportH }),
        makeRequest(baseUrl, `/api/v1/admin/services/${oid(30)}`, { method: 'DELETE', headers: supportH }),
        makeRequest(baseUrl, `/api/v1/admin/blogs/${oid(40)}`, { method: 'DELETE', headers: supportH }),
        makeRequest(baseUrl, `/api/v1/admin/categories/interior-design`, { method: 'DELETE', headers: supportH }),
      ]);
      const bad = checks.find((r) => r.status !== 403);
      return !bad ? true : `Expected 403 for all, got ${bad.status}`;
    });

    await assertTest('ADMIN (non-SUPER_ADMIN) cannot permanently delete records (403 Forbidden)', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}/permanent`, {
        method: 'DELETE',
        headers: adminH,
        body: { confirmPermanent: true },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    await assertTest('Invalid ObjectId format returns 400 cleanly', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/enquiries/invalid-id-123', {
        method: 'DELETE',
        headers: superH,
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Missing record ID returns 404 cleanly', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(9999)}`, {
        method: 'DELETE',
        headers: superH,
      });
      return res.status === 404 ? true : `Expected 404, got ${res.status}`;
    });

    await assertTest('Permanent delete without confirmPermanent=true is rejected with 400', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: {},
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    // 2. CATEGORIES & SUBCATEGORIES PROTECTION
    console.log('\n── 2. Main Categories & Subcategories Protection ──');

    await assertTest('Cannot soft-delete or permanently delete the 5 canonical main categories (403)', async () => {
      const softRes = await makeRequest(baseUrl, '/api/v1/admin/categories/home-construction', {
        method: 'DELETE',
        headers: superH,
      });
      const permRes = await makeRequest(baseUrl, '/api/v1/admin/categories/home-construction/permanent', {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      return softRes.status === 403 && permRes.status === 403
        ? true
        : `Expected 403/403, got ${softRes.status}/${permRes.status}`;
    });

    let customSubId = null;
    await assertTest('Create custom subcategory, soft-delete hides from public & active, restore works, permanent delete succeeds', async () => {
      const createRes = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminH,
        body: { name: 'Custom Solar Rooftop', parentCategory: 'home-construction' },
      });
      if (createRes.status !== 201) return `Create failed: ${createRes.status}`;
      customSubId = createRes.body.data._id;

      const softRes = await makeRequest(baseUrl, `/api/v1/admin/categories/${customSubId}`, {
        method: 'DELETE',
        headers: adminH,
        body: { reason: 'Temporary cleanup' },
      });
      if (softRes.status !== 200) return `Soft delete failed: ${softRes.status}`;

      const pubRes = await makeRequest(baseUrl, '/api/v1/categories/home-construction');
      if (pubRes.body.data.subcategories.some((s) => s._id === customSubId)) {
        return 'Soft-deleted subcategory leaked into public endpoint!';
      }

      const trashRes = await makeRequest(baseUrl, '/api/v1/admin/categories?status=deleted', { headers: adminH });
      if (!trashRes.body.data.subcategories.some((s) => s._id === customSubId)) {
        return 'Soft-deleted subcategory missing from Trash view';
      }

      const restoreRes = await makeRequest(baseUrl, `/api/v1/admin/categories/${customSubId}/restore`, {
        method: 'POST',
        headers: adminH,
      });
      if (restoreRes.status !== 200) return `Restore failed: ${restoreRes.status}`;

      const permRes = await makeRequest(baseUrl, `/api/v1/admin/categories/${customSubId}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (permRes.status !== 200) return `Permanent delete failed: ${permRes.status}`;
      return true;
    });

    await assertTest('Subcategory with active Provider/Service dependencies blocks permanent delete (409) until reassigned', async () => {
      // interior-design is referenced by Provider oid(10) and Services oid(30)/oid(31)
      const depRes = await makeRequest(baseUrl, '/api/v1/admin/categories/interior-design/dependencies', {
        headers: adminH,
      });
      if (depRes.status !== 200) return `Dependencies check failed: ${depRes.status}`;
      if (depRes.body.data.canPermanentlyDelete !== false || depRes.body.data.dependencies.providersCount < 1) {
        return `Expected dependency blocker, got ${JSON.stringify(depRes.body.data)}`;
      }

      const blockedPerm = await makeRequest(baseUrl, '/api/v1/admin/categories/interior-design/permanent', {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (blockedPerm.status !== 409) return `Expected 409 Conflict when dependencies exist, got ${blockedPerm.status}`;
      return true;
    });

    // 3. ENQUIRIES (CLIENT/CUSTOMER DATA): SOFT DELETE, ANONYMIZE, RESTORE, PERMANENT DELETE
    console.log('\n── 3. Customer Enquiries: Soft Delete, PII Anonymization, Restore & Purge ──');

    await assertTest('OPS_MANAGER can soft-delete enquiry; hidden from active; duplicate soft-delete returns 409; restore works', async () => {
      const del1 = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}`, {
        method: 'DELETE',
        headers: opsH,
        body: { reason: 'Duplicate request' },
      });
      if (del1.status !== 200) return `Expected 200, got ${del1.status}`;

      const del2 = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}`, {
        method: 'DELETE',
        headers: opsH,
      });
      if (del2.status !== 409) return `Expected 409 on duplicate soft-delete, got ${del2.status}`;

      const activeList = await makeRequest(baseUrl, '/api/v1/admin/enquiries', { headers: opsH });
      if (activeList.body.data.some((e) => e._id === oid(1))) return 'Soft-deleted enquiry appeared in active list';

      const restoreRes = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}/restore`, {
        method: 'POST',
        headers: opsH,
      });
      if (restoreRes.status !== 200) return `Restore failed: ${restoreRes.status}`;
      return true;
    });

    await assertTest('Customer PII anonymization scrubs personal details while preserving enquiry & assigned provider', async () => {
      const anonRes = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(1)}/anonymize`, {
        method: 'POST',
        headers: adminH,
      });
      if (anonRes.status !== 200) return `Expected 200, got ${anonRes.status}`;
      if (anonRes.body.data.name !== 'Anonymized Customer' || anonRes.body.data.email !== '') {
        return 'Customer PII was not anonymized';
      }
      if (!providersStore.some((p) => p._id === oid(10))) {
        return 'Assigned provider was accidentally deleted!';
      }
      return true;
    });

    await assertTest('SUPER_ADMIN permanent delete of enquiry removes record without affecting assigned provider', async () => {
      const perm = await makeRequest(baseUrl, `/api/v1/admin/enquiries/${oid(2)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (perm.status !== 200) return `Expected 200, got ${perm.status}`;
      if (leadsStore.some((l) => l._id === oid(2))) return 'Enquiry still exists after permanent delete';
      if (!providersStore.some((p) => p._id === oid(10))) return 'Provider was affected!';
      return true;
    });

    // 4. SERVICES & PACKAGES
    console.log('\n── 4. Services & Packages: Moderation, Soft Delete, Restore & Permanent Delete ──');

    await assertTest('Admin can soft-delete & restore a service, and SUPER_ADMIN permanent delete preserves Provider', async () => {
      const softRes = await makeRequest(baseUrl, `/api/v1/admin/services/${oid(30)}`, {
        method: 'DELETE',
        headers: opsH,
      });
      if (softRes.status !== 200) return `Soft delete failed: ${softRes.status}`;

      const restRes = await makeRequest(baseUrl, `/api/v1/admin/services/${oid(30)}/restore`, {
        method: 'POST',
        headers: opsH,
      });
      if (restRes.status !== 200) return `Restore failed: ${restRes.status}`;

      const permRes = await makeRequest(baseUrl, `/api/v1/admin/services/${oid(30)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (permRes.status !== 200) return `Permanent delete failed: ${permRes.status}`;
      if (servicesStore.some((s) => s._id === oid(30))) return 'Service not deleted';
      const prov = providersStore.find((p) => p._id === oid(10));
      if (!prov) return 'Parent provider was deleted!';
      if (prov.services.includes('Modular Kitchen')) return 'Service title not pulled from provider.services';
      return true;
    });

    // 5. PARTNER APPLICATION SHARED MEDIA GUARD
    console.log('\n── 5. Partner Application Deletion & Shared Cloudinary Asset Guard ──');

    await assertTest('Permanent delete of Partner Application preserves linked Provider AND shared Cloudinary image', async () => {
      const beforeCount = cloudinaryCalls.length;
      const permRes = await makeRequest(baseUrl, `/api/v1/admin/applications/${oid(3)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (permRes.status !== 200) return `Expected 200, got ${permRes.status}`;
      if (leadsStore.some((l) => l._id === oid(3))) return 'Partner application not deleted';
      const prov = providersStore.find((p) => p._id === oid(10));
      if (!prov) return 'Linked Provider was deleted!';
      if (prov.sourceApplicationId !== null) return 'sourceApplicationId was not unlinked';
      if (cloudinaryCalls.length !== beforeCount) {
        return 'Shared Cloudinary asset was wrongly deleted while still used by Provider!';
      }
      if (permRes.body.data.mediaCleanup?.status !== 'SKIPPED_SHARED') {
        return `Expected SKIPPED_SHARED, got ${permRes.body.data.mediaCleanup?.status}`;
      }
      return true;
    });

    // 6. PROVIDER SOFT DELETE -> AUTH REVOCATION -> RESTORE -> PERMANENT DELETE + CLOUDINARY CLEANUP
    console.log('\n── 6. Provider Soft Delete, Auth Block, Restore & Permanent Delete ──');

    await assertTest('Provider soft-delete hides from public API, blocks protected /api/v1/provider/* routes, and suspends services', async () => {
      const softRes = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}`, {
        method: 'DELETE',
        headers: adminH,
        body: { reason: 'Compliance hold' },
      });
      if (softRes.status !== 200) return `Soft delete failed: ${softRes.status}`;

      // Public API must hide soft-deleted provider
      const pubRes = await makeRequest(baseUrl, '/api/v1/providers/studio-vastu-interiors');
      if (pubRes.status !== 404) return `Expected 404 on public provider slug, got ${pubRes.status}`;

      // Protected provider portal route must reject deleted provider token with 401
      const portalRes = await makeRequest(baseUrl, '/api/v1/provider/dashboard', {
        headers: { 'x-provider-token': 'provider-vastu-active-session-token' },
      });
      if (portalRes.status !== 401) return `Deleted provider accessed protected route! status=${portalRes.status}`;

      // Service 31 must be soft-deleted
      const svc = servicesStore.find((s) => s._id === oid(31));
      if (!svc.isDeleted) return 'Provider service was not soft-deleted';

      // Dashboard stats must exclude soft-deleted provider and services
      const dashRes = await makeRequest(baseUrl, '/api/v1/admin/dashboard', { headers: adminH });
      if (dashRes.status !== 200) return `Dashboard failed: ${dashRes.status}`;
      if (dashRes.body.data.stats.providers.total !== 1) {
        return `Expected 1 active provider in dashboard stats, got ${dashRes.body.data.stats.providers.total}`;
      }
      return true;
    });

    await assertTest('Restoring soft-deleted Provider restores profile as DRAFT and restores its services', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}/restore`, {
        method: 'POST',
        headers: adminH,
      });
      if (res.status !== 200) return `Restore failed: ${res.status}`;
      const prov = providersStore.find((p) => p._id === oid(10));
      if (prov.isDeleted || prov.publicationStatus !== 'DRAFT') return 'Provider not restored as DRAFT';
      const svc = servicesStore.find((s) => s._id === oid(31));
      if (svc.isDeleted) return 'Provider service not restored';
      return true;
    });

    await assertTest('Provider permanent delete requires matching confirmBusinessName, deletes owned Cloudinary asset, preserves unrelated provider & unlinks enquiries', async () => {
      const wrongConfirm = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true, confirmBusinessName: 'Wrong Name' },
      });
      if (wrongConfirm.status !== 400) return `Expected 400 on wrong confirmBusinessName, got ${wrongConfirm.status}`;

      const permRes = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true, confirmBusinessName: 'Studio Vastu Interiors' },
      });
      if (permRes.status !== 200) return `Expected 200, got ${permRes.status}`;
      if (providersStore.some((p) => p._id === oid(10))) return 'Provider still in DB';
      if (servicesStore.some((s) => s.providerId === oid(10))) return 'Provider services still in DB';
      if (accountsStore.some((a) => a._id === oid(20))) return 'Provider account still in DB';
      if (!cloudinaryCalls.includes('konnevia/providers/shared-shop')) {
        return 'Owned Cloudinary asset was not destroyed now that partner app was already gone!';
      }
      // Customer enquiry oid(1) must still exist with assignedProviderId=null
      const enq = leadsStore.find((l) => l._id === oid(1));
      if (!enq || enq.assignedProviderId !== null) return 'Enquiry was deleted or not unlinked cleanly';
      // Unrelated provider oid(11) and its service oid(32) must remain untouched
      if (!providersStore.some((p) => p._id === oid(11)) || !servicesStore.some((s) => s._id === oid(32))) {
        return 'Unrelated provider or service was deleted!';
      }

      // Duplicate permanent delete returns 404
      const dupRes = await makeRequest(baseUrl, `/api/v1/admin/providers/${oid(10)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (dupRes.status !== 404) return `Expected 404 on duplicate permanent delete, got ${dupRes.status}`;
      return true;
    });

    // 7. BLOG CMS + PARTIAL CLOUDINARY FAILURE RECOVERY
    console.log('\n── 7. Blog CMS Deletion & Partial Cloudinary Failure Recovery Queue ──');

    await assertTest('CONTENT_MANAGER can soft-delete & restore blog; SUPER_ADMIN permanent delete queues retry task on Cloudinary failure and recovers via retry endpoint', async () => {
      const softRes = await makeRequest(baseUrl, `/api/v1/admin/blogs/${oid(40)}`, {
        method: 'DELETE',
        headers: contentH,
      });
      if (softRes.status !== 200 || softRes.body.data.status !== 'archived') {
        return `Blog soft delete failed: ${softRes.status}`;
      }

      const restRes = await makeRequest(baseUrl, `/api/v1/admin/blogs/${oid(40)}/restore`, {
        method: 'POST',
        headers: contentH,
      });
      if (restRes.status !== 200 || restRes.body.data.status !== 'draft') {
        return `Blog restore failed: ${restRes.status}`;
      }

      // Simulate Cloudinary outage for blog's coverImage
      failCloudinaryForId = 'konnevia/providers/blog-hero-fail';
      const permRes = await makeRequest(baseUrl, `/api/v1/admin/blogs/${oid(40)}/permanent`, {
        method: 'DELETE',
        headers: superH,
        body: { confirmPermanent: true },
      });
      if (permRes.status !== 200) return `Permanent delete failed: ${permRes.status}`;
      if (permRes.body.data.mediaCleanup?.status !== 'PARTIAL_FAILURE') {
        return `Expected PARTIAL_FAILURE status, got ${permRes.body.data.mediaCleanup?.status}`;
      }
      if (cleanupTasksStore.length !== 1 || cleanupTasksStore[0].status !== 'PENDING') {
        return 'Failed media cleanup was not queued in MediaCleanupTask';
      }

      // Recover Cloudinary and trigger retry endpoint
      failCloudinaryForId = null;
      const retryRes = await makeRequest(
        baseUrl,
        `/api/v1/admin/media-cleanup/${cleanupTasksStore[0]._id}/retry`,
        { method: 'POST', headers: adminH }
      );
      if (retryRes.status !== 200 || retryRes.body.data.status !== 'COMPLETED') {
        return `Cleanup retry failed: ${JSON.stringify(retryRes.body)}`;
      }
      return true;
    });

    // 8. AUDIT LOG VERIFICATION & IMMUTABILITY
    console.log('\n── 8. Audit Log Recording & Immutability ──');

    await assertTest('Administrative deletion, restoration, and anonymization actions are recorded in ActivityLog without sensitive PII', async () => {
      const logRes = await makeRequest(baseUrl, '/api/v1/admin/activity-logs?limit=50', { headers: superH });
      if (logRes.status !== 200) return `Expected 200, got ${logRes.status}`;
      const actions = activityLogsStore.map((l) => l.action);
      const required = [
        'ENQUIRY_SOFT_DELETED',
        'ENQUIRY_RESTORED',
        'ENQUIRY_CUSTOMER_ANONYMIZED',
        'ENQUIRY_PERMANENTLY_DELETED',
        'SERVICE_PERMANENTLY_DELETED',
        'APPLICATION_PERMANENTLY_DELETED',
        'PROVIDER_SOFT_DELETED',
        'PROVIDER_RESTORED',
        'PROVIDER_PERMANENTLY_DELETED',
        'BLOG_PERMANENTLY_DELETED',
        'MEDIA_CLEANUP_RETRIED',
      ];
      for (const act of required) {
        if (!actions.includes(act)) return `Missing audit log action: ${act}`;
      }
      const rawLogsJson = JSON.stringify(activityLogsStore);
      if (rawLogsJson.includes('9876543210') || rawLogsJson.includes('rohan@example.com')) {
        return 'Sensitive customer phone/email leaked into audit logs!';
      }

      // Activity logs cannot be deleted
      const delLogRes = await makeRequest(baseUrl, `/api/v1/admin/activity-logs/${oid(1)}`, {
        method: 'DELETE',
        headers: superH,
      });
      if (delLogRes.status !== 404) return `Expected 404 for activity log delete, got ${delLogRes.status}`;
      return true;
    });

    // 9. LOCAL STORAGE vs CLOUDINARY SEPARATION GUARD
    console.log('\n── 9. Storage Isolation & Path Traversal Guard ──');

    await assertTest('Local upload deletion removes file in uploadDir while static /assets/ and path traversal attempts are blocked', async () => {
      const testLocalFile = path.join(tempUploadDir, 'shop-test-123.jpg');
      fs.writeFileSync(testLocalFile, 'dummy');
      const localRes = await storageService.deleteAsset({ url: '/uploads/shop-test-123.jpg', publicId: 'shop-test-123.jpg' });
      if (!localRes.success || fs.existsSync(testLocalFile)) return 'Local file was not deleted';

      const staticRes = await storageService.deleteAsset({ url: '/assets/blog/interior-guide.jpg' });
      if (!staticRes.skipped) return 'Static site asset was not skipped!';

      // Cloudinary URL must never call local fs even if local uploadDir has same basename
      const trapFile = path.join(tempUploadDir, 'trap-asset.jpg');
      fs.writeFileSync(trapFile, 'must-survive');
      await storageService.deleteAsset({
        url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/konnevia/providers/trap-asset.jpg',
        publicId: 'konnevia/providers/trap-asset',
      });
      if (!fs.existsSync(trapFile)) return 'Cloudinary URL touched local filesystem!';
      return true;
    });
  } finally {
    Provider._isMocked = false;
    Admin.findOne = origAdminFindOne;
    restores.forEach((fn) => fn());
    storageService._setCloudinaryClient(null);
    env.storage.uploadDir = origUploadDir;
    env.storage.cloudinary = origCloudConfig;
    env.storage.provider = origStorageProvider;
    try {
      fs.rmSync(tempUploadDir, { recursive: true, force: true });
    } catch {}
    server.close();
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  Global Deletion Suite: ${String(passed).padStart(2)} PASSED, ${String(failed).padStart(2)} FAILED / ${passed + failed} total        ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter((r) => r.status !== 'PASS').forEach((r) => {
      console.log(`  ✗ ${r.label}: ${r.reason}`);
    });
    process.exit(1);
  }
}

runDeletionSystemTests().catch((err) => {
  console.error('Fatal deletion test error:', err);
  process.exit(1);
});
