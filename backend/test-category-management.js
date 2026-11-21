import http from 'http';
import app from './src/app.js';
import Admin from './src/models/Admin.js';
import Category from './src/models/Category.js';
import ActivityLog from './src/models/ActivityLog.js';
import categoryService from './src/services/categoryService.js';

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

function makeRequest(baseUrl, path, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload =
      body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload !== null ? { 'Content-Type': 'application/json' } : {}),
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
          } catch {
            // Keep raw text if not JSON
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json || raw,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

async function runCategoryManagementTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   DEALSATHI CATEGORY MANAGEMENT & SECURITY VERIFICATION SUITE    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Mock Admin.findOne and ActivityLog.create in memory so no production MongoDB connection is touched
  const originalAdminFindOne = Admin.findOne;
  const originalActivityLogCreate = ActivityLog.create;

  const VALID_ADMIN_TOKEN = 'test-super-admin-session-token-2026';
  const NON_ADMIN_SUPPORT_TOKEN = 'test-support-agent-session-token-2026';
  const PROVIDER_ROLE_TOKEN = 'test-provider-role-session-token-2026';

  Admin.findOne = async (query) => {
    if (query?.sessionToken === VALID_ADMIN_TOKEN) {
      return {
        _id: '65f000000000000000000999',
        email: 'owner@dealsathi.in',
        role: 'SUPER_ADMIN',
        sessionToken: VALID_ADMIN_TOKEN,
        sessionExpiresAt: new Date(Date.now() + 3600_000),
      };
    }
    if (query?.sessionToken === NON_ADMIN_SUPPORT_TOKEN) {
      return {
        _id: '65f000000000000000000998',
        email: 'support@dealsathi.in',
        role: 'SUPPORT_AGENT',
        sessionToken: NON_ADMIN_SUPPORT_TOKEN,
        sessionExpiresAt: new Date(Date.now() + 3600_000),
      };
    }
    if (query?.sessionToken === PROVIDER_ROLE_TOKEN) {
      return {
        _id: '65f000000000000000000997',
        email: 'provider@dealsathi.in',
        role: 'PROVIDER',
        sessionToken: PROVIDER_ROLE_TOKEN,
        sessionExpiresAt: new Date(Date.now() + 3600_000),
      };
    }
    return null;
  };

  ActivityLog.create = async (doc) => doc;
  categoryService._resetInMemoryStore();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminHeaders = { Authorization: `Bearer ${VALID_ADMIN_TOKEN}` };
  const supportHeaders = { Authorization: `Bearer ${NON_ADMIN_SUPPORT_TOKEN}` };
  const providerHeaders = { Authorization: `Bearer ${PROVIDER_ROLE_TOKEN}` };

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. PUBLIC MARKETPLACE CATEGORY API & 5 MAIN CATEGORIES PRESERVATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('── 1. Canonical 5 Main Categories & Public Discovery APIs ──');

    await assertTest('GET /api/v1/categories returns all 5 established main categories', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/categories');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const cats = res.body?.data?.categories;
      if (!Array.isArray(cats) || cats.length !== 5) {
        return `Expected 5 main categories, got ${cats?.length}`;
      }
      const expectedNames = [
        'Home & Construction',
        'Events & Lifestyle',
        'Business & Property',
        'Digital & Professional Services',
        'Education & Career',
      ];
      const actualNames = cats.map((c) => c.name);
      for (const name of expectedNames) {
        if (!actualNames.includes(name)) return `Missing main category: ${name}`;
      }
      return true;
    });

    await assertTest('GET /api/v1/categories/home-construction returns main category and subcategories', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/categories/home-construction');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (res.body?.data?.slug !== 'home-construction') return 'Slug mismatch';
      if (!Array.isArray(res.body?.data?.subcategories) || res.body.data.subcategories.length < 5) {
        return 'Expected at least 5 default subcategories under Home & Construction';
      }
      return true;
    });

    await assertTest('GET /api/v1/categories/non-existent-category returns 404', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/categories/non-existent-category');
      return res.status === 404 ? true : `Expected 404, got ${res.status}`;
    });

    await assertTest('Public write attempt POST /api/v1/categories is rejected with 404', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/categories', {
        method: 'POST',
        body: { name: 'Unauthorized Category', parentCategory: 'home-construction' },
      });
      return res.status === 404 ? true : `Expected 404, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 2. AUTHENTICATION & AUTHORIZATION SECURITY GUARDS
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 2. Authentication & Role-Based Authorization Security ──');

    await assertTest('Unauthenticated GET /api/v1/admin/categories is rejected with 401', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories');
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Unauthenticated POST /api/v1/admin/categories is rejected with 401', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        body: { name: 'Solar Rooftop', parentCategory: 'home-construction' },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Invalid bearer token is rejected with 401', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: { Authorization: 'Bearer forged-invalid-token' },
        body: { name: 'Solar Rooftop', parentCategory: 'home-construction' },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Non-admin role (SUPPORT_AGENT) is rejected with 403 Forbidden', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: supportHeaders,
        body: { name: 'Solar Rooftop', parentCategory: 'home-construction' },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    await assertTest('Provider account token (PROVIDER role) is rejected with 403 Forbidden', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: providerHeaders,
        body: { name: 'Solar Rooftop', parentCategory: 'home-construction' },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 3. AUTHORIZED ADMIN SUBCATEGORY CREATION & NORMALIZATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 3. Authorized Admin Subcategory Creation & Normalization ──');

    let createdSubcategoryId = null;

    await assertTest('Authorized Admin can create a valid subcategory with name normalization', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: '   Modular   Kitchen   Design  ',
          parentCategory: 'home-construction',
          description: 'Custom modular kitchen cabinetry, countertops, and ergonomic layouts.',
          isActive: true,
        },
      });
      if (res.status !== 201) return `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`;
      const created = res.body?.data;
      if (created?.name !== 'Modular Kitchen Design') {
        return `Expected normalized name "Modular Kitchen Design", got "${created?.name}"`;
      }
      if (created?.slug !== 'modular-kitchen-design') {
        return `Expected slug "modular-kitchen-design", got "${created?.slug}"`;
      }
      if (created?.parentSlug !== 'home-construction') {
        return `Expected parentSlug "home-construction", got "${created?.parentSlug}"`;
      }
      if (created?.parentName !== 'Home & Construction') {
        return `Expected parentName "Home & Construction", got "${created?.parentName}"`;
      }
      createdSubcategoryId = created._id;
      return true;
    });

    await assertTest('Newly created subcategory appears in public GET /api/v1/categories/home-construction', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/categories/home-construction');
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const subs = res.body?.data?.subcategories || [];
      const found = subs.find((s) => s.slug === 'modular-kitchen-design');
      if (!found) return 'Newly created subcategory not found in public category detail endpoint';
      return true;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 4. PARENT CATEGORY VALIDATION & TOP-LEVEL PROTECTION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 4. Parent Category Validation & Main Category Protection ──');

    await assertTest('Rejects subcategory creation without parentCategory (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: { name: 'Orphaned Subcategory' },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects subcategory creation with non-existent parentCategory (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: { name: 'Automotive Repair', parentCategory: 'invalid-parent-vertical' },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects subcategory creation using another subcategory as parent (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: { name: '3D Kitchen Rendering', parentCategory: createdSubcategoryId },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Protects the 5 established main categories from modification or deactivation (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories/home-construction/status', {
        method: 'PATCH',
        headers: adminHeaders,
        body: { isActive: false },
      });
      return res.status === 400 ? true : `Expected 400 when attempting to deactivate main category, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 5. DUPLICATE CATEGORY & CONCURRENT CREATION PROTECTION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 5. Duplicate Name/Slug & Race-Condition Handling ──');

    await assertTest('Rejects duplicate subcategory name (case-insensitive) with 409 Conflict', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: 'modular kitchen design',
          parentCategory: 'home-construction',
        },
      });
      return res.status === 409 ? true : `Expected 409, got ${res.status}`;
    });

    await assertTest('Rejects duplicate subcategory colliding with existing seed subcategory (409)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: 'Wedding Planning',
          parentCategory: 'events-lifestyle',
        },
      });
      return res.status === 409 ? true : `Expected 409, got ${res.status}`;
    });

    await assertTest('Rejects subcategory colliding with an established main category name (409)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: 'Home & Construction',
          parentCategory: 'home-construction',
        },
      });
      return res.status === 409 ? true : `Expected 409, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 6. INVALID INPUT & MASS-ASSIGNMENT PROTECTION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 6. Invalid Input & Mass-Assignment Protection ──');

    await assertTest('Rejects empty or whitespace-only name with 400', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: { name: '    ', parentCategory: 'home-construction' },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects single-character name (< 2 chars) with 400', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: { name: 'A', parentCategory: 'home-construction' },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects HTML/XSS script injection in name with 400', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: '<script>alert("xss")</script>Roofing',
          parentCategory: 'home-construction',
        },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects mass-assignment attempt setting isMain: true with 400', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: 'Unauthorized Top Vertical',
          parentCategory: 'home-construction',
          isMain: true,
        },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Strips unallowed mass-assignment fields (_id, role, injectedField) on create', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name: 'Smart Home Automation',
          parentCategory: 'home-construction',
          description: 'IoT lighting, security, and smart home installations.',
          _id: '000000000000000000000000',
          role: 'SUPER_ADMIN',
          injectedField: 'malicious_value',
          __v: 99,
        },
      });
      if (res.status !== 201) return `Expected 201, got ${res.status}`;
      const doc = res.body?.data;
      if (doc._id === '000000000000000000000000') return 'Failed to prevent _id overwrite';
      if (doc.injectedField || doc.role) return 'Leaked unallowed mass-assigned properties onto document';
      if (doc.isMain !== false) return 'isMain must strictly remain false';
      return true;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 7. SUBCATEGORY EDITING, SEARCH/FILTERING & STATUS ACTIVATION TOGGLE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 7. Subcategory Editing, Status Toggle & Admin Filtering ──');

    await assertTest('Admin can edit an existing subcategory description and name', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/admin/categories/${createdSubcategoryId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: {
          name: 'Modular Kitchen & Wardrobe Design',
          description: 'Turnkey modular kitchens and fitted bedroom wardrobes.',
        },
      });
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (res.body?.data?.name !== 'Modular Kitchen & Wardrobe Design') return 'Updated name mismatch';
      if (res.body?.data?.slug !== 'modular-kitchen-wardrobe-design') return 'Updated slug mismatch';
      return true;
    });

    await assertTest('Admin can deactivate a subcategory and it hides from public marketplace API', async () => {
      const toggleRes = await makeRequest(
        baseUrl,
        `/api/v1/admin/categories/${createdSubcategoryId}/status`,
        {
          method: 'PATCH',
          headers: adminHeaders,
          body: { isActive: false },
        }
      );
      if (toggleRes.status !== 200) return `Expected 200, got ${toggleRes.status}`;
      if (toggleRes.body?.data?.isActive !== false) return 'Expected isActive=false';

      // Verify hidden from public endpoint
      const pubRes = await makeRequest(baseUrl, '/api/v1/categories/home-construction');
      const pubSubs = pubRes.body?.data?.subcategories || [];
      if (pubSubs.some((s) => s._id === createdSubcategoryId)) {
        return 'Deactivated subcategory leaked into public category endpoint!';
      }

      // Verify still visible in Admin endpoint with status=inactive filter
      const adminRes = await makeRequest(
        baseUrl,
        '/api/v1/admin/categories?parentCategory=home-construction&status=inactive',
        { headers: adminHeaders }
      );
      const inactiveSubs = adminRes.body?.data?.subcategories || [];
      if (!inactiveSubs.some((s) => s._id === createdSubcategoryId)) {
        return 'Deactivated subcategory missing from admin inactive filter';
      }
      return true;
    });

    await assertTest('Admin can re-activate a subcategory and it reappears in public marketplace API', async () => {
      const toggleRes = await makeRequest(
        baseUrl,
        `/api/v1/admin/categories/${createdSubcategoryId}/status`,
        {
          method: 'PATCH',
          headers: adminHeaders,
          body: { isActive: true },
        }
      );
      if (toggleRes.status !== 200) return `Expected 200, got ${toggleRes.status}`;
      if (toggleRes.body?.data?.isActive !== true) return 'Expected isActive=true';

      const pubRes = await makeRequest(baseUrl, '/api/v1/categories/home-construction');
      const pubSubs = pubRes.body?.data?.subcategories || [];
      if (!pubSubs.some((s) => s._id === createdSubcategoryId)) {
        return 'Reactivated subcategory did not reappear in public category endpoint';
      }
      return true;
    });

    await assertTest('Admin search query safely handles ReDoS/regex special characters', async () => {
      const res = await makeRequest(
        baseUrl,
        `/api/v1/admin/categories?search=${encodeURIComponent('([a+]+)*?[test')}`,
        { headers: adminHeaders }
      );
      return res.status === 200 ? true : `Expected 200 for regex-escaped search, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 8. DATABASE ERROR HANDLING & E11000 RACE CONDITION SIMULATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 8. Safe Database Error & Concurrent E11000 Handling ──');

    await assertTest('Simulated MongoDB E11000 duplicate key error returns clean 409 without leaking DB details', async () => {
      Category._isMocked = true;
      const origFindOne = Category.findOne;
      const origFindById = Category.findById;
      const origCount = Category.countDocuments;
      const origSave = Category.prototype.save;

      try {
        Category.findById = () => ({
          lean: async () => ({
            _id: '65f000000000000000000001',
            slug: 'home-construction',
            name: 'Home & Construction',
            isMain: true,
          }),
        });
        Category.findOne = () => ({
          lean: async () => null,
        });
        Category.countDocuments = async () => 5;
        Category.prototype.save = async () => {
          const dupErr = new Error(
            'E11000 duplicate key error collection: dealsathi_prod.categories index: slug_1 dup key: { slug: "race-sub" }'
          );
          dupErr.code = 11000;
          throw dupErr;
        };

        const res = await makeRequest(baseUrl, '/api/v1/admin/categories', {
          method: 'POST',
          headers: adminHeaders,
          body: {
            name: 'Race Condition Sub',
            parentCategory: '65f000000000000000000001',
          },
        });

        if (res.status !== 409) return `Expected 409 on E11000 race condition, got ${res.status}`;
        if (String(res.body?.message || '').includes('dealsathi_prod.categories')) {
          return 'Leaked internal MongoDB collection/index details in error message!';
        }
        return true;
      } finally {
        Category._isMocked = false;
        Category.findOne = origFindOne;
        Category.findById = origFindById;
        Category.countDocuments = origCount;
        Category.prototype.save = origSave;
      }
    });
  } finally {
    Admin.findOne = originalAdminFindOne;
    ActivityLog.create = originalActivityLogCreate;
    server.close();
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  Category Management Suite: ${String(passed).padStart(2)} PASSED, ${String(failed).padStart(2)} FAILED / ${passed + failed} total    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCategoryManagementTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
