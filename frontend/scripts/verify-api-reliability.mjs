import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PRERENDER_ROUTES } from './prerender.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(FRONTEND_ROOT, 'dist');

const API_MODULE_URL = pathToFileURL(path.resolve(FRONTEND_ROOT, 'src/services/api.js')).href;
const PROVIDER_SERVICE_URL = pathToFileURL(path.resolve(FRONTEND_ROOT, 'src/services/providerService.js')).href;
const BLOG_SERVICE_URL = pathToFileURL(path.resolve(FRONTEND_ROOT, 'src/services/blogService.js')).href;

const PORT = 4179;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function startLocalDistServer() {
  const explicitRewrites = new Map(
    PRERENDER_ROUTES.filter((r) => r !== '/').map((routePath) => [
      routePath,
      path.join(DIST_DIR, routePath.replace(/^\/+/, ''), 'index.html'),
    ])
  );

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, BASE_URL).pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      return fs.createReadStream(path.join(DIST_DIR, 'index.html')).pipe(res);
    }

    const relPath = pathname.replace(/^\/+/, '');
    const directFile = path.join(DIST_DIR, relPath);
    if (relPath && !pathname.endsWith('/') && fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
      const ext = path.extname(directFile).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(directFile).pipe(res);
    }

    if (explicitRewrites.has(pathname)) {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      return fs.createReadStream(explicitRewrites.get(pathname)).pipe(res);
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
    return fs.createReadStream(path.join(DIST_DIR, '_spa.html')).pipe(res);
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const SAMPLE_PROVIDER = {
  _id: 'p1',
  businessName: 'Apex Civil Engineering Works',
  slug: 'apex-civil-engineering-works',
  description: 'Licensed Grade-1 civil contracting firm.',
  category: 'Home & Construction',
  categorySlug: 'home-construction',
  city: 'Bengaluru',
  state: 'Karnataka',
  services: ['Civil Masonry'],
  verificationStatus: 'VERIFIED',
  publicationStatus: 'PUBLISHED',
  isDevSample: false,
};

const SAMPLE_BLOG = {
  _id: 'b1',
  title: 'How to Choose a Designer',
  slug: 'how-to-choose-interior-designer',
  excerpt: 'Key scoping questions.',
  content: '### Step 1\n\nDefine scope clearly.',
  category: 'Home & Construction',
  tags: ['Interior Design'],
  author: { name: 'Priya Sharma', role: 'Lead' },
  status: 'published',
  publishedAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  relatedArticles: [],
};

// ============================================================================
// PART A: Unit Tests for api.js, providerService.js, blogService.js Retries
// ============================================================================
async function runUnitTests() {
  console.log('\n--- PART A: Public API Reliability & Service Retry Unit Tests ---');
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };

  const { default: api, ApiError } = await import(API_MODULE_URL);
  const { default: providerService } = await import(PROVIDER_SERVICE_URL);
  const { default: blogService } = await import(BLOG_SERVICE_URL);

  try {
    // 1. Public provider list retries via providerService.getProviders (explicitly ensures /providers is NOT blocked by /provider guard)
    {
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        assert.ok(String(url).includes('/providers?'), `Unexpected URL: ${url}`);
        if (calls === 1) {
          return new Response(JSON.stringify({ message: 'Service Unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { providers: [SAMPLE_PROVIDER], total: 1, page: 1, limit: 3, totalPages: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      };
      const res = await providerService.getProviders({ page: 1, limit: 3 });
      assert.equal(calls, 2, 'providerService.getProviders must retry 503 and recover on 2nd attempt');
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0].slug, 'apex-civil-engineering-works');
      console.log('PASS [Unit 1]: Public provider list (/providers) retries and recovers from 503');
    }

    // 2. Public provider detail retries via providerService.getProviderBySlug
    {
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        assert.ok(String(url).includes('/providers/apex-civil-engineering-works'), `Unexpected URL: ${url}`);
        if (calls <= 2) {
          return new Response(JSON.stringify({ message: 'Temporary Server Error' }), {
            status: calls === 1 ? 500 : 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, data: SAMPLE_PROVIDER }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      const provider = await providerService.getProviderBySlug('apex-civil-engineering-works');
      assert.equal(calls, 3, 'providerService.getProviderBySlug must retry 500 -> 503 -> 200 across 3 attempts');
      assert.equal(provider.businessName, 'Apex Civil Engineering Works');
      console.log('PASS [Unit 2]: Public provider detail (/providers/:slug) retries and recovers from 500 -> 503');
    }

    // 3. Public blog detail recovers from network failure via blogService.getBlogBySlug
    {
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        assert.ok(String(url).includes('/blogs/how-to-choose-interior-designer'));
        if (calls === 1) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify({ success: true, data: SAMPLE_BLOG }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      const blog = await blogService.getBlogBySlug('how-to-choose-interior-designer');
      assert.equal(calls, 2);
      assert.equal(blog.data.slug, 'how-to-choose-interior-designer');
      console.log('PASS [Unit 3]: Public blog detail (/blogs/:slug) recovers from transient network failure');
    }

    // 4. Confirmed 404 performs 1 attempt only
    {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      };
      await assert.rejects(
        () => providerService.getProviderBySlug('missing-provider'),
        (err) => err instanceof ApiError && err.status === 404
      );
      assert.equal(calls, 1, '404 must never retry');
      console.log('PASS [Unit 4]: Confirmed 404 executes strictly 1 attempt (0 retries)');
    }

    // 5. Auth failures (401/403) and mutations (POST/PUT/PATCH/DELETE) never retry
    {
      for (const status of [401, 403]) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status,
            headers: { 'content-type': 'application/json' },
          });
        };
        await assert.rejects(
          () => api.get('/blogs/restricted', { retry: true }),
          (err) => err instanceof ApiError && err.status === status
        );
        assert.equal(calls, 1, `HTTP ${status} must never retry`);
      }

      for (const methodFn of ['post', 'put', 'patch']) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return new Response(JSON.stringify({ message: 'Unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        };
        await assert.rejects(
          () => api[methodFn]('/leads', { name: 'test' }, { retry: true }),
          (err) => err instanceof ApiError && err.status === 503
        );
        assert.equal(calls, 1, `${methodFn.toUpperCase()} must never retry`);
      }

      let delCalls = 0;
      globalThis.fetch = async () => {
        delCalls++;
        return new Response(JSON.stringify({ message: 'Unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      };
      await assert.rejects(() => api.delete('/leads/1', { retry: true }));
      assert.equal(delCalls, 1, 'DELETE must never retry');
      console.log('PASS [Unit 5]: Zero retries on 401/403 and POST/PUT/PATCH/DELETE mutations');
    }

    // 6. Protected namespaces (/admin, /provider, /leads) never retry even if retry:true is passed
    {
      for (const endpoint of ['/admin/blogs', '/provider', '/provider/profile', '/leads']) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return new Response(JSON.stringify({ message: 'Unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        };
        await assert.rejects(() => api.get(endpoint, { retry: { maxRetries: 2, baseDelayMs: 20 } }));
        assert.equal(calls, 1, `${endpoint} is protected and must never retry`);
      }
      console.log('PASS [Unit 6]: Protected endpoints (/admin, /provider, /leads) never retry');
    }

    // 7. Total timeout budget strictly bounds retries when attempts stall
    {
      let calls = 0;
      globalThis.fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          calls++;
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      const started = Date.now();
      await assert.rejects(
        () =>
          api.get('/providers', {
            retry: { maxRetries: 3, perAttemptTimeoutMs: 1000, totalTimeoutMs: 5000, baseDelayMs: 50 },
          }),
        (err) => err instanceof ApiError && err.status === 0
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 6000, `Timeout budget exceeded: ${elapsed}ms`);
      assert.ok(calls >= 2 && calls <= 4, `Unexpected call count: ${calls}`);
      console.log(`PASS [Unit 7]: Total timeout budget bounded (${elapsed}ms across ${calls} attempts)`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
}

// ============================================================================
// PART B: E2E Playwright Browser Tests Against Built dist/
// ============================================================================
async function runPlaywrightE2E() {
  console.log('\n--- PART B: Playwright Reliability & SEO E2E Verification ---');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'index.html')), 'frontend/dist missing. Run npm run build first.');

  const server = await startLocalDistServer();
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Simulated >15s API latency on homepage recovers automatically via bounded retry
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const counts = { providers: 0, blogs: 0 };

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/categories')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: [] }),
          });
        }
        if (url.includes('/providers')) {
          counts.providers++;
          if (counts.providers === 1) {
            await new Promise((r) => setTimeout(r, 16000));
            return route.abort('timedout').catch(() => {});
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { providers: [SAMPLE_PROVIDER], total: 1, page: 1, limit: 3, totalPages: 1 },
            }),
          });
        }
        if (url.includes('/blogs')) {
          counts.blogs++;
          if (counts.blogs === 1) {
            await new Promise((r) => setTimeout(r, 16000));
            return route.abort('timedout').catch(() => {});
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { blogs: [SAMPLE_BLOG], pagination: { page: 1, limit: 3, total: 1, pages: 1 } },
            }),
          });
        }
        return route.continue();
      });

      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=Apex Civil Engineering Works', { timeout: 25000 });
      await page.waitForSelector('text=How to Choose a Designer', { timeout: 25000 });
      const hasErrors = await page.evaluate(() => ({
        provErr: document.body.innerText.includes('Unable to load providers right now'),
        blogErr: document.body.innerText.includes('Editorial guides temporarily unavailable'),
      }));
      assert.equal(hasErrors.provErr, false);
      assert.equal(hasErrors.blogErr, false);
      assert.ok(counts.providers >= 2 && counts.blogs >= 2);
      console.log(`PASS [E2E 1]: Homepage recovered from >15s cold-start delay (providers=${counts.providers}, blogs=${counts.blogs})`);
      await ctx.close();
    }

    // 2. Exhausted 503/500 on homepage renders retryable recovery buttons without noindex, then succeeds on click
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      let mode = 'fail';
      let provCalls = 0;
      let blogCalls = 0;

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/categories')) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
        }
        if (url.includes('/providers')) {
          provCalls++;
          if (mode === 'fail') {
            return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Unavailable' }) });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { providers: [SAMPLE_PROVIDER], total: 1, page: 1, limit: 3, totalPages: 1 },
            }),
          });
        }
        if (url.includes('/blogs')) {
          blogCalls++;
          if (mode === 'fail') {
            return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Server Error' }) });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { blogs: [SAMPLE_BLOG], pagination: { page: 1, limit: 3, total: 1, pages: 1 } },
            }),
          });
        }
        return route.continue();
      });

      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button:has-text("Retry Loading Providers")', { timeout: 15000 });
      await page.waitForSelector('button:has-text("Retry Loading Guides")', { timeout: 15000 });
      assert.equal(provCalls, 3);
      assert.equal(blogCalls, 3);
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content || null), null);

      mode = 'ok';
      await page.click('button:has-text("Retry Loading Providers")');
      await page.click('button:has-text("Retry Loading Guides")');
      await page.waitForSelector('text=Apex Civil Engineering Works', { timeout: 10000 });
      await page.waitForSelector('text=How to Choose a Designer', { timeout: 10000 });
      console.log('PASS [E2E 2]: Homepage 503/500 retryable fallback + manual retry recovery verified');
      await ctx.close();
    }

    // 3. Dynamic Blog & Provider SEO: 404 -> noindex vs 503/network error -> NO noindex, plus SPA metadata reset
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqCounts = {};
      let tempProviderRecovered = false;

      await page.route('**/api/v1/**', async (route) => {
        const key = new URL(route.request().url()).pathname;
        reqCounts[key] = (reqCounts[key] || 0) + 1;

        if (key === '/api/v1/categories') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
        }
        if (key === '/api/v1/blogs/how-to-choose-interior-designer') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: SAMPLE_BLOG }) });
        }
        if (key === '/api/v1/blogs/missing-blog') {
          return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Not found' }) });
        }
        if (key === '/api/v1/blogs/temp-503-blog') {
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Busy' }) });
        }
        if (key === '/api/v1/providers/apex-civil-engineering-works') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: SAMPLE_PROVIDER }) });
        }
        if (key === '/api/v1/providers/missing-provider') {
          return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Not found' }) });
        }
        if (key === '/api/v1/providers/temp-neterr-provider') {
          if (!tempProviderRecovered) return route.abort('failed');
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: SAMPLE_PROVIDER }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
      });

      const readHead = () =>
        page.evaluate(() => ({
          canonical: document.querySelector('link[rel="canonical"]')?.href || null,
          robots: document.querySelector('meta[name="robots"]')?.content || null,
          articleMetas: document.querySelectorAll('meta[property^="article:"]').length,
          jsonLdCount: document.querySelectorAll('script[type="application/ld+json"]').length,
        }));

      const spaNavigate = (targetPath) =>
        page.evaluate((p) => {
          window.history.pushState({}, '', p);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, targetPath);

      await page.goto(`${BASE_URL}/blog/how-to-choose-interior-designer`, { waitUntil: 'networkidle' });
      let h = await readHead();
      assert.equal(h.canonical, 'https://dealsathi.in/blog/how-to-choose-interior-designer');
      assert.equal(h.robots, null);
      assert.ok(h.articleMetas > 0 && h.jsonLdCount === 2);

      await spaNavigate('/blog/missing-blog');
      await page.waitForSelector('text=Article Not Found', { timeout: 10000 });
      h = await readHead();
      assert.equal(h.robots, 'noindex, nofollow');
      assert.equal(h.canonical, null);
      assert.equal(h.articleMetas, 0);
      assert.equal(h.jsonLdCount, 0);
      assert.equal(reqCounts['/api/v1/blogs/missing-blog'], 1);

      await spaNavigate('/blog/temp-503-blog');
      await page.waitForSelector('text=Unable to Load Article Right Now', { timeout: 15000 });
      h = await readHead();
      assert.equal(h.robots, null);
      assert.equal(h.canonical, null);
      assert.equal(reqCounts['/api/v1/blogs/temp-503-blog'], 3);

      await spaNavigate('/providers/apex-civil-engineering-works');
      await page.waitForSelector('h1:has-text("Apex Civil Engineering Works")', { timeout: 10000 });
      h = await readHead();
      assert.equal(h.canonical, 'https://dealsathi.in/providers/apex-civil-engineering-works');
      assert.equal(h.robots, null);
      assert.equal(h.articleMetas, 0);
      assert.equal(h.jsonLdCount, 2);

      await spaNavigate('/providers/missing-provider');
      await page.waitForSelector('text=Provider Profile Not Found', { timeout: 10000 });
      h = await readHead();
      assert.equal(h.robots, 'noindex, nofollow');
      assert.equal(h.canonical, null);
      assert.equal(reqCounts['/api/v1/providers/missing-provider'], 1);

      await spaNavigate('/providers/temp-neterr-provider');
      await page.waitForSelector('text=Unable to Load Provider Profile Right Now', { timeout: 15000 });
      h = await readHead();
      assert.equal(h.robots, null);
      assert.equal(reqCounts['/api/v1/providers/temp-neterr-provider'], 3);

      tempProviderRecovered = true;
      await page.click('button:has-text("Try Again")');
      await page.waitForSelector('h1:has-text("Apex Civil Engineering Works")', { timeout: 10000 });
      h = await readHead();
      assert.equal(h.canonical, 'https://dealsathi.in/providers/apex-civil-engineering-works');
      assert.equal(h.robots, null);

      console.log('PASS [E2E 3]: Dynamic 404 vs temporary-error SEO, retry recovery, and SPA metadata reset verified');
      await ctx.close();
    }

    // 4. Auth 401 and Lead POST 500 fire strictly 1 request (0 retries)
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      let loginCalls = 0;
      let leadCalls = 0;

      await page.route('**/api/v1/**', async (route) => {
        const url = route.request().url();
        const method = route.request().method();
        if (url.includes('/categories')) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
        }
        if (url.includes('/admin/auth/login') && method === 'POST') {
          loginCalls++;
          return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Invalid credentials' }) });
        }
        if (url.includes('/leads') && method === 'POST') {
          leadCalls++;
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Server error' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
      });

      await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', 'admin@dealsathi.in');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForSelector('text=Invalid credentials', { timeout: 5000 });
      await page.waitForTimeout(800);
      assert.equal(loginCalls, 1);

      await page.goto(`${BASE_URL}/get-quote?category=home-construction&service=Interior%20Design`, { waitUntil: 'networkidle' });
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="phone"]', '9876543210');
      await page.fill('input[name="city"]', 'Bengaluru');
      await page.fill('textarea[name="requirements"]', 'Need civil contractor verification for house project');
      await page.check('input[name="consentToContact"]');
      await page.check('input[name="consentProviderSharing"]');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1200);
      assert.equal(leadCalls, 1);
      console.log('PASS [E2E 4]: Admin login (401) and Get-Quote POST (500) fired strictly 1 attempt');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

await runUnitTests();
await runPlaywrightE2E();
console.log('\nALL TARGETED RELIABILITY & SEO TESTS PASSED.');
