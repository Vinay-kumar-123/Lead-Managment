import http from 'http';
import app from './src/app.js';
import providerPortalService from './src/services/providerPortalService.js';
import categoryService from './src/services/categoryService.js';
import { signNonProdGoogleIdToken } from './src/services/googleTokenVerifier.js';

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
          'x-konnevia-test-suite': 'provider-ecosystem',
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
            // Keep raw text
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

async function runProviderEcosystemTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   DEALSATHI PROVIDER GOOGLE AUTH, ONBOARDING & DASHBOARD TEST SUITE    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  providerPortalService._resetInMemoryStore();
  categoryService._resetInMemoryStore();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. GOOGLE ID TOKEN CRYPTOGRAPHIC & CLAIMS VERIFICATION TESTS
    // ─────────────────────────────────────────────────────────────────────
    console.log('── 1. Google Identity Services (GIS) Backend Token Verification ──');

    await assertTest('Rejects missing Google ID token with 400', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: {},
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects malformed JWT string with 401', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: 'not.a.valid.jwt' },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects tampered RS256 cryptographic signature with 401', async () => {
      const tampered = signNonProdGoogleIdToken(
        { sub: 'google-sub-tampered', email: 'tampered@gmail.com' },
        { tamperSignature: true }
      );
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: tampered },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects unsupported/insecure algorithm (alg: none) with 401', async () => {
      const algNone = signNonProdGoogleIdToken(
        { sub: 'google-sub-none', email: 'none@gmail.com' },
        { alg: 'none' }
      );
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: algNone },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects invalid token issuer (iss) with 401', async () => {
      const wrongIssuer = signNonProdGoogleIdToken({
        iss: 'https://evil-idp.example.com',
        sub: 'google-sub-iss',
        email: 'issuer@gmail.com',
      });
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: wrongIssuer },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects wrong audience (aud mismatch) with 401', async () => {
      const wrongAud = signNonProdGoogleIdToken({
        aud: 'wrong-other-app-client-id.apps.googleusercontent.com',
        sub: 'google-sub-aud',
        email: 'aud@gmail.com',
      });
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: wrongAud },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects expired Google ID token (exp in past) with 401', async () => {
      const expiredToken = signNonProdGoogleIdToken({
        sub: 'google-sub-expired',
        email: 'expired@gmail.com',
        exp: Math.floor(Date.now() / 1000) - 120,
      });
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: expiredToken },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    await assertTest('Rejects unverified Google email (email_verified: false) with 403', async () => {
      const unverifiedToken = signNonProdGoogleIdToken({
        sub: 'google-sub-unverified',
        email: 'unverified@gmail.com',
        email_verified: false,
      });
      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: unverifiedToken },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 2. NEW GOOGLE USER -> ONBOARDING FLOW & DRAFT PERSISTENCE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 2. New Provider Resolution & Onboarding Journey ──');

    let providerAToken = null;
    let providerACookie = null;

    await assertTest('New Google user authenticates -> resolves to isNewProvider=true & business-profile step', async () => {
      const validToken = signNonProdGoogleIdToken({
        sub: 'google-sub-provider-a-1001',
        email: 'anand.skyline@gmail.com',
        email_verified: true,
        name: 'Anand Kulkarni',
      });

      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: validToken },
      });

      if (res.status !== 200) return `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`;
      const data = res.body?.data;
      if (data?.isNewProvider !== true) return `Expected isNewProvider=true, got ${data?.isNewProvider}`;
      if (data?.onboardingCompleted !== false) return 'Expected onboardingCompleted=false';
      if (data?.redirectTo !== '/become-a-partner?step=business-profile') {
        return `Unexpected redirectTo: ${data?.redirectTo}`;
      }
      if (!data?.token) return 'Missing session token';

      providerAToken = data.token;
      const setCookie = res.headers['set-cookie'];
      if (setCookie && setCookie[0]) {
        providerACookie = setCookie[0].split(';')[0];
      }
      return true;
    });

    await assertTest('New provider can save and resume incomplete onboarding draft', async () => {
      const saveRes = await makeRequest(baseUrl, '/api/v1/provider/onboarding/draft', {
        method: 'PUT',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Skyline Turnkey Interiors Draft',
          city: 'Pune',
          category: 'home-construction',
        },
      });
      if (saveRes.status !== 200) return `Expected 200, got ${saveRes.status}`;

      const meRes = await makeRequest(baseUrl, '/api/v1/provider/auth/me', {
        headers: { 'x-provider-token': providerAToken },
      });
      if (meRes.status !== 200) return `Expected 200, got ${meRes.status}`;
      const draft = meRes.body?.data?.account?.onboardingDraft;
      if (draft?.businessName !== 'Skyline Turnkey Interiors Draft' || draft?.city !== 'Pune') {
        return 'Saved onboarding draft was not preserved on /auth/me';
      }
      return true;
    });

    await assertTest('Rejects onboarding profile creation with missing required fields (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Skyline Interiors',
          // missing contactPerson, phone, category, city, description
        },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects onboarding with invalid non-Dealsathi main category (400)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Skyline Interiors LLP',
          contactPerson: 'Anand Kulkarni',
          phone: '9820123456',
          category: 'arbitrary-invalid-vertical',
          servicesOffered: 'Interior Design',
          city: 'Pune',
          businessDescription: 'Complete residential and commercial interior architecture studio.',
        },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Rejects mass-assignment attempt to escalate role to SUPER_ADMIN or self-verify (403)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Skyline Interiors LLP',
          contactPerson: 'Anand Kulkarni',
          phone: '9820123456',
          category: 'home-construction',
          subcategory: 'Interior Design',
          servicesOffered: 'Interior Design',
          city: 'Pune',
          businessDescription: 'Complete residential and commercial interior architecture studio.',
          role: 'SUPER_ADMIN',
        },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    await assertTest('Completes Business Profile Creation and links profile to authenticated Google account (201)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Skyline Architecture & Interiors LLP',
          contactPerson: 'Anand Kulkarni',
          phone: '9820123456',
          category: 'home-construction',
          subcategory: 'Interior Design',
          servicesOffered: 'Interior Design, Home Renovation',
          city: 'Pune',
          state: 'Maharashtra',
          address: '402 Elite Chambers, Baner Road',
          pinCode: '411045',
          serviceAreas: 'Baner, Kothrud, Wakad',
          experienceYears: 9,
          businessDescription:
            'Licensed interior architecture and turnkey residential renovation firm in Pune.',
          consentToContact: true,
          consentToDisplayPhone: true,
        },
      });
      if (res.status !== 201) return `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`;
      const data = res.body?.data;
      if (data?.onboardingCompleted !== true) return 'Expected onboardingCompleted=true';
      if (data?.redirectTo !== '/provider/dashboard') return 'Expected redirectTo=/provider/dashboard';
      if (data?.provider?.category !== 'Home & Construction') return `Unexpected category: ${data?.provider?.category}`;
      if (data?.provider?.subcategory !== 'Interior Design') return `Unexpected subcategory: ${data?.provider?.subcategory}`;
      if (data?.provider?.verificationStatus !== 'UNVERIFIED') return 'New profile must start UNVERIFIED pending admin review';
      return true;
    });

    await assertTest('Prevents duplicate business profile creation on repeated submission (409 Conflict)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          businessName: 'Duplicate Skyline Profile',
          contactPerson: 'Anand Kulkarni',
          phone: '9820123456',
          category: 'home-construction',
          subcategory: 'Interior Design',
          servicesOffered: 'Interior Design',
          city: 'Pune',
          businessDescription: 'Attempting to create a duplicate profile for the same provider.',
        },
      });
      return res.status === 409 ? true : `Expected 409, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 3. RETURNING PROVIDER & ACCOUNT LINKING CONFLICT TESTS
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 3. Returning Provider & Safe Account Linking ──');

    await assertTest('Returning provider signing in with Google goes directly to /provider/dashboard without duplicates', async () => {
      const returningToken = signNonProdGoogleIdToken({
        sub: 'google-sub-provider-a-1001',
        email: 'anand.skyline@gmail.com',
        email_verified: true,
        name: 'Anand Kulkarni',
      });

      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: returningToken },
      });

      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const data = res.body?.data;
      if (data?.isNewProvider !== false) return 'Returning provider must have isNewProvider=false';
      if (data?.onboardingCompleted !== true) return 'Returning provider must have onboardingCompleted=true';
      if (data?.redirectTo !== '/provider/dashboard') return `Expected /provider/dashboard, got ${data?.redirectTo}`;
      if (data?.provider?.businessName !== 'Skyline Architecture & Interiors LLP') {
        return 'Returning provider did not receive existing business profile';
      }
      providerAToken = data.token;
      return true;
    });

    await assertTest('Rejects Google account conflict when different sub claims an already-linked email (409)', async () => {
      const conflictingSubToken = signNonProdGoogleIdToken({
        sub: 'google-sub-attacker-9999',
        email: 'anand.skyline@gmail.com',
        email_verified: true,
        name: 'Impersonator',
      });

      const res = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: conflictingSubToken },
      });
      return res.status === 409 ? true : `Expected 409 on sub conflict, got ${res.status}`;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 4. PROVIDER DASHBOARD, SERVICES CRUD & CROSS-PROVIDER ISOLATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 4. Provider Dashboard Statistics, Services CRUD & Ownership Security ──');

    let providerAServiceId = null;

    await assertTest('GET /api/v1/provider/dashboard returns real provider identity and seeded service statistics', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/dashboard', {
        headers: { 'x-provider-token': providerAToken },
      });
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      const data = res.body?.data;
      if (data?.provider?.businessName !== 'Skyline Architecture & Interiors LLP') {
        return 'Dashboard provider identity mismatch';
      }
      if (data?.stats?.totalServices !== 2) {
        return `Expected 2 initial services from onboarding, got ${data?.stats?.totalServices}`;
      }
      if (data?.stats?.pendingApproval !== 2) {
        return `Expected 2 pendingApproval services, got ${data?.stats?.pendingApproval}`;
      }
      return true;
    });

    await assertTest('Provider can create a new service package in their dashboard (201)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/provider/services', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
        body: {
          title: 'Turnkey 3BHK Luxury Interior Package',
          categorySlug: 'home-construction',
          subcategory: 'Interior Design',
          pricingModel: 'starting_from',
          priceAmount: 450000,
          priceLabel: '₹4,50,000',
          deliverables: ['3D Renderings', 'Modular Kitchen', 'False Ceiling'],
          description: 'Complete end-to-end 3BHK residential interior design and execution.',
        },
      });
      if (res.status !== 201) return `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`;
      const svc = res.body?.data;
      if (svc?.approvalStatus !== 'PENDING') return 'New service must start with PENDING approvalStatus';
      if (svc?.publicationStatus !== 'DRAFT') return 'New service must start with DRAFT publicationStatus';
      providerAServiceId = svc._id;
      return true;
    });

    await assertTest('Rejects provider attempt to self-approve a service (403)', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/provider/services/${providerAServiceId}`, {
        method: 'PUT',
        headers: { 'x-provider-token': providerAToken },
        body: {
          title: 'Self Approved Attempt',
          approvalStatus: 'APPROVED',
        },
      });
      return res.status === 403 ? true : `Expected 403, got ${res.status}`;
    });

    await assertTest('Rejects provider attempt to publish an unapproved service (400)', async () => {
      const res = await makeRequest(baseUrl, `/api/v1/provider/services/${providerAServiceId}`, {
        method: 'PUT',
        headers: { 'x-provider-token': providerAToken },
        body: {
          publicationStatus: 'PUBLISHED',
        },
      });
      return res.status === 400 ? true : `Expected 400, got ${res.status}`;
    });

    await assertTest('Cross-Provider Isolation: Provider B cannot modify or delete Provider A services (403)', async () => {
      // Authenticate Provider B
      const tokenB = signNonProdGoogleIdToken({
        sub: 'google-sub-provider-b-2002',
        email: 'meera.events@gmail.com',
        email_verified: true,
        name: 'Meera Deshmukh',
      });
      const authB = await makeRequest(baseUrl, '/api/v1/provider/auth/google', {
        method: 'POST',
        body: { credential: tokenB },
      });
      const providerBToken = authB.body?.data?.token;

      await makeRequest(baseUrl, '/api/v1/provider/onboarding', {
        method: 'POST',
        headers: { 'x-provider-token': providerBToken },
        body: {
          businessName: 'Verve Luxury Weddings',
          contactPerson: 'Meera Deshmukh',
          phone: '9820998877',
          category: 'events-lifestyle',
          subcategory: 'Wedding Planning',
          servicesOffered: 'Wedding Planning',
          city: 'Mumbai',
          businessDescription: 'Full-scale luxury destination wedding planning and decor.',
        },
      });

      // Provider B attempts to edit Provider A's service
      const editAttempt = await makeRequest(
        baseUrl,
        `/api/v1/provider/services/${providerAServiceId}`,
        {
          method: 'PUT',
          headers: { 'x-provider-token': providerBToken },
          body: { title: 'Hacked by Provider B' },
        }
      );
      if (editAttempt.status !== 403) {
        return `Expected 403 when Provider B edits Provider A service, got ${editAttempt.status}`;
      }

      // Provider B attempts to delete Provider A's service
      const deleteAttempt = await makeRequest(
        baseUrl,
        `/api/v1/provider/services/${providerAServiceId}`,
        {
          method: 'DELETE',
          headers: { 'x-provider-token': providerBToken },
        }
      );
      if (deleteAttempt.status !== 403) {
        return `Expected 403 when Provider B deletes Provider A service, got ${deleteAttempt.status}`;
      }

      return true;
    });

    // ─────────────────────────────────────────────────────────────────────
    // 5. ADMIN / PROVIDER ROLE SEPARATION, CSRF & LOGOUT REVOCATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── 5. Role Separation, CSRF Origin Validation & Logout Revocation ──');

    await assertTest('Provider session token cannot access Admin endpoints (/api/v1/admin/dashboard -> 401)', async () => {
      const res = await makeRequest(baseUrl, '/api/v1/admin/dashboard', {
        headers: {
          Authorization: `Bearer ${providerAToken}`,
          'x-admin-token': providerAToken,
        },
      });
      return res.status === 401 ? true : `Expected 401, got ${res.status}`;
    });

    if (providerACookie) {
      await assertTest('Cookie-authenticated state-changing request from untrusted Origin is blocked (403)', async () => {
        const res = await makeRequest(baseUrl, '/api/v1/provider/profile', {
          method: 'PUT',
          headers: {
            Cookie: providerACookie,
            Origin: 'https://malicious-attacker-site.example.com',
          },
          body: { city: 'Hacked City' },
        });
        return res.status === 403 ? true : `Expected 403 for untrusted origin, got ${res.status}`;
      });
    }

    await assertTest('Logout invalidates provider session token and subsequent requests return 401', async () => {
      const logoutRes = await makeRequest(baseUrl, '/api/v1/provider/auth/logout', {
        method: 'POST',
        headers: { 'x-provider-token': providerAToken },
      });
      if (logoutRes.status !== 200) return `Expected 200 on logout, got ${logoutRes.status}`;

      const afterRes = await makeRequest(baseUrl, '/api/v1/provider/dashboard', {
        headers: { 'x-provider-token': providerAToken },
      });
      return afterRes.status === 401 ? true : `Expected 401 after logout, got ${afterRes.status}`;
    });
  } finally {
    server.close();
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  Provider Ecosystem Suite: ${String(passed).padStart(2)} PASSED, ${String(failed).padStart(2)} FAILED / ${passed + failed} total        ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runProviderEcosystemTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
