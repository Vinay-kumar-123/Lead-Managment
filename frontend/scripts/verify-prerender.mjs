import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PRERENDER_ROUTES } from './prerender.mjs';
import { validateDistSeoFiles, validateNeutralSpaHtml } from './spa-fallback.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(FRONTEND_ROOT, 'dist');
const SSR_CACHE_ROOT = path.resolve(FRONTEND_ROOT, 'node_modules', '.cache');

const PORT = 4176;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const NESTED_STATIC_ROUTES = PRERENDER_ROUTES.filter((r) => r !== '/');
const EXPLICIT_REWRITES = new Map(
  NESTED_STATIC_ROUTES.map((routePath) => [
    routePath,
    path.join(DIST_DIR, routePath.replace(/^\//, ''), 'index.html'),
  ])
);

function expectedCanonicalFor(routePath) {
  return routePath === '/' ? 'https://dealsathi.in/' : `https://dealsathi.in${routePath}`;
}

/**
 * Simulates the proposed Render Option B static + rewrite configuration locally:
 * 1) Physical files (/index.html, /_spa.html, /assets/*, /robots.txt, /<route>/index.html, and trailing-slash /<route>/)
 * 2) 18 explicit static route rewrites (/<route> -> /<route>/index.html)
 * 3) Final SPA wildcard fallback (/* -> /_spa.html)
 * Note: Local simulation validates code/fallback invariants; actual Render CDN routing must still be verified on Render staging.
 */
function startSimulatedRenderServer() {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, BASE_URL);
    const pathname = reqUrl.pathname;

    // 1a. Exact physical file match
    if (pathname === '/') {
      const homeFile = path.join(DIST_DIR, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      return fs.createReadStream(homeFile).pipe(res);
    }

    const relPath = pathname.replace(/^\/+/, '');
    const directFile = path.join(DIST_DIR, relPath);
    if (relPath && !pathname.endsWith('/') && fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
      const ext = path.extname(directFile).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(directFile).pipe(res);
    }

    // 1b. Trailing-slash directory index (/route/ -> dist/route/index.html)
    if (pathname.endsWith('/')) {
      const dirIndex = path.join(DIST_DIR, relPath, 'index.html');
      if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        return fs.createReadStream(dirIndex).pipe(res);
      }
    }

    // 2. Explicit 18 extensionless static route rewrites
    const rewriteTarget = EXPLICIT_REWRITES.get(pathname);
    if (rewriteTarget && fs.existsSync(rewriteTarget)) {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      return fs.createReadStream(rewriteTarget).pipe(res);
    }

    // 3. Final neutral wildcard fallback (/* -> /_spa.html)
    const spaFile = path.join(DIST_DIR, '_spa.html');
    res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
    return fs.createReadStream(spaFile).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function setupBrowserMocks(page) {
  // Stub Google GSI library locally so third-party origin check on 127.0.0.1 doesn't trigger 403 noise
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.google = window.google || { accounts: { id: { initialize(){}, renderButton(){}, prompt(){} } } };',
    })
  );

  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/blogs/how-to-choose-interior-designer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'b1',
            title: 'How to Choose the Right Home Interior Designer in India',
            slug: 'how-to-choose-interior-designer',
            excerpt: 'Essential scoping questions before hiring an interior firm.',
            content: '### Step 1\n\nVerify portfolio and deliverables.',
            category: 'Home & Construction',
            coverImage: '/assets/blog/interior-guide.jpg',
            tags: ['Interior Design', 'Budgeting'],
            status: 'published',
            publishedAt: '2026-01-15T10:00:00.000Z',
            updatedAt: '2026-11-12T07:46:40.953Z',
            author: { name: 'Dealsathi Editorial Team', role: 'Lead' },
          },
        }),
      });
    }
    if (url.includes('/blogs/non-existent-slug-test')) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Blog not found' }),
      });
    }
    if (url.includes('/blogs?')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            blogs: [
              {
                _id: 'b1',
                title: 'How to Choose the Right Home Interior Designer in India',
                slug: 'how-to-choose-interior-designer',
                excerpt: 'Essential scoping questions before hiring an interior firm.',
                category: 'Home & Construction',
                coverImage: '/assets/blog/interior-guide.jpg',
                readingTimeMinutes: 6,
                status: 'published',
                publishedAt: '2026-01-15T10:00:00.000Z',
                author: { name: 'Dealsathi Editorial Team', role: 'Lead' },
              },
            ],
            pagination: { page: 1, limit: 9, total: 1, pages: 1 },
          },
        }),
      });
    }
    if (url.includes('/blogs/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: ['Home & Construction'] }),
      });
    }
    if (url.includes('/providers/verified-studio-mumbai')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'p1',
            businessName: 'Verified Studio Mumbai',
            slug: 'verified-studio-mumbai',
            description: 'Architectural and interior studio serving Mumbai.',
            category: 'Home & Construction',
            categorySlug: 'home-construction',
            city: 'Mumbai',
            state: 'Maharashtra',
            servicesOffered: ['Interior Design', 'Home Renovation'],
            verificationStatus: 'VERIFIED',
            publicationStatus: 'PUBLISHED',
          },
        }),
      });
    }
    if (url.includes('/providers/non-existent-slug-test')) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Provider not found' }),
      });
    }
    if (url.includes('/admin/auth/me') || url.includes('/provider/auth/me')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}

function attachIssueListeners(page, ignoreExpected404 = false) {
  const issues = [];
  page.on('pageerror', (err) => issues.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text();
      if (ignoreExpected404 && text.includes('status of 404')) return;
      issues.push(`[${msg.type()}] ${text}`);
    }
  });
  return issues;
}

async function runTests() {
  const failures = [];

  // 0. Filesystem & artifact invariants before launching HTTP tests
  validateDistSeoFiles(DIST_DIR);
  const spaDiskHtml = fs.readFileSync(path.join(DIST_DIR, '_spa.html'), 'utf8');
  validateNeutralSpaHtml(spaDiskHtml, 'dist/_spa.html', DIST_DIR);

  if (fs.existsSync(path.join(FRONTEND_ROOT, '.prerender-tmp'))) {
    failures.push('Leftover frontend/.prerender-tmp directory found.');
  }
  const leftoverCacheDirs = fs.existsSync(SSR_CACHE_ROOT)
    ? fs.readdirSync(SSR_CACHE_ROOT).filter((d) => d.startsWith('dealsathi-prerender-'))
    : [];
  if (leftoverCacheDirs.length > 0) {
    failures.push(`Leftover SSR cache temp directories found: ${leftoverCacheDirs.join(', ')}`);
  }
  for (const requiredAsset of ['dealsathi-logo.png', 'dealsathi-logo-original.jpg', 'favicon.png', 'robots.txt']) {
    if (!fs.existsSync(path.join(DIST_DIR, requiredAsset))) {
      failures.push(`Required public asset missing in dist/: ${requiredAsset}`);
    }
  }

  const server = await startSimulatedRenderServer();
  const browser = await chromium.launch();

  try {
    // 1. All 19 canonical static URLs (raw HTML + Chromium hydration)
    for (const routePath of PRERENDER_ROUTES) {
      const expectedCanonical = expectedCanonicalFor(routePath);
      const res = await fetch(`${BASE_URL}${routePath}`, { headers: { 'User-Agent': CHROME_UA } });
      const rawHtml = await res.text();

      const rawCanonicals = [...rawHtml.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/gi)].map(
        (m) => m[1]
      );
      const rawOgUrls = [...rawHtml.matchAll(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/gi)].map(
        (m) => m[1]
      );
      const rawTitles = [...rawHtml.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1]);

      if (res.status !== 200) failures.push(`${routePath}: raw HTTP status=${res.status}`);
      if (rawCanonicals.length !== 1 || rawCanonicals[0] !== expectedCanonical) {
        failures.push(`${routePath}: raw canonicals=${JSON.stringify(rawCanonicals)}`);
      }
      if (rawOgUrls.length !== 1 || rawOgUrls[0] !== expectedCanonical) {
        failures.push(`${routePath}: raw og:url=${JSON.stringify(rawOgUrls)}`);
      }
      if (rawTitles.length !== 1) failures.push(`${routePath}: raw titles=${rawTitles.length}`);
      if (!rawHtml.includes(`data-prerender-route="${routePath}"`)) {
        failures.push(`${routePath}: missing data-prerender-route="${routePath}"`);
      }
      if (!rawHtml.includes('<main') || !rawHtml.includes('<h1')) {
        failures.push(`${routePath}: missing semantic <main> or <h1> in raw HTML`);
      }

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);

      await page.goto(`${BASE_URL}${routePath}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);

      const dom = await page.evaluate(() => ({
        title: document.title,
        canonicals: Array.from(document.querySelectorAll('link[rel="canonical"]')).map((e) => e.getAttribute('href')),
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || null,
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || null,
        h1: document.querySelector('h1')?.textContent?.trim() || null,
        jsonLdCount: document.querySelectorAll('script[type="application/ld+json"]').length,
      }));

      if (issues.length > 0) failures.push(`${routePath}: browser issues -> ${issues.join(' | ')}`);
      if (dom.canonicals.length !== 1 || dom.canonicals[0] !== expectedCanonical) {
        failures.push(`${routePath}: DOM canonicals=${JSON.stringify(dom.canonicals)}`);
      }
      if (dom.ogUrl !== expectedCanonical) failures.push(`${routePath}: DOM og:url=${dom.ogUrl}`);
      if (!dom.h1) failures.push(`${routePath}: missing <h1> in hydrated DOM`);
      if (dom.robots) failures.push(`${routePath}: unexpected robots meta=${dom.robots}`);
      if (/Services Services/i.test(dom.title)) {
        failures.push(`${routePath}: duplicate "Services Services" in title="${dom.title}"`);
      }

      const expectsJsonLd =
        routePath === '/' ||
        routePath.startsWith('/categories') ||
        routePath.startsWith('/services/') ||
        routePath === '/providers' ||
        routePath === '/blog';
      if (expectsJsonLd && dom.jsonLdCount < 1) {
        failures.push(`${routePath}: expected JSON-LD in DOM, found ${dom.jsonLdCount}`);
      }

      console.log(`OK static ${routePath} | title="${dom.title}" | jsonLd=${dom.jsonLdCount}`);
      await context.close();
    }

    // 2. All 18 trailing-slash variants (/categories/ ... /terms/)
    for (const routePath of NESTED_STATIC_ROUTES) {
      const slashPath = `${routePath}/`;
      const expectedCanonical = expectedCanonicalFor(routePath);

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);

      await page.goto(`${BASE_URL}${slashPath}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      if (canonical !== expectedCanonical) {
        failures.push(`${slashPath}: canonical=${canonical} expected=${expectedCanonical}`);
      }
      if (issues.length > 0) failures.push(`${slashPath}: issues=${issues.join(' | ')}`);
      await context.close();
    }
    console.log(`OK all ${NESTED_STATIC_ROUTES.length} trailing-slash variants normalized cleanly`);

    // 3. Direct /_spa.html and direct static artifact URLs (/index.html, /categories/index.html, /categories/digital-professional/index.html)
    {
      const spaRes = await fetch(`${BASE_URL}/_spa.html`);
      const spaRaw = await spaRes.text();
      validateNeutralSpaHtml(spaRaw, 'HTTP /_spa.html', DIST_DIR);

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);
      await page.goto(`${BASE_URL}/_spa.html`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      const canonCount = await page.locator('link[rel="canonical"]').count();
      if (robots !== 'noindex, nofollow' || canonCount !== 0) {
        failures.push(`direct /_spa.html DOM unexpected: robots=${robots} canonCount=${canonCount}`);
      }
      if (issues.length > 0) failures.push(`direct /_spa.html browser issues: ${issues.join(' | ')}`);
      await context.close();
      console.log('OK /_spa.html neutral raw HTML & direct-access noindex guard');

      for (const art of [
        { path: '/index.html', expectedRawCanon: 'https://dealsathi.in/' },
        { path: '/categories/index.html', expectedRawCanon: 'https://dealsathi.in/categories' },
        {
          path: '/categories/digital-professional/index.html',
          expectedRawCanon: 'https://dealsathi.in/categories/digital-professional',
        },
      ]) {
        const res = await fetch(`${BASE_URL}${art.path}`);
        const html = await res.text();
        const rawCanon = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
        if (rawCanon !== art.expectedRawCanon) {
          failures.push(`artifact ${art.path}: rawCanon=${rawCanon} expected=${art.expectedRawCanon}`);
        }
        const ctx = await browser.newContext();
        const pg = await ctx.newPage();
        await setupBrowserMocks(pg);
        const pgIssues = attachIssueListeners(pg);
        await pg.goto(`${BASE_URL}${art.path}`, { waitUntil: 'networkidle' });
        await pg.waitForTimeout(200);
        if (pgIssues.length > 0) failures.push(`artifact ${art.path} browser issues: ${pgIssues.join(' | ')}`);
        await ctx.close();
      }
      console.log('OK direct HTML artifact URLs');
    }

    // 4. Dynamic blog & provider routes (served via _spa.html, ZERO homepage canonical leakage in raw HTML!)
    for (const dynCase of [
      {
        path: '/blog/how-to-choose-interior-designer',
        expectedCanon: 'https://dealsathi.in/blog/how-to-choose-interior-designer',
        expectedTitlePart: 'How to Choose the Right Home Interior Designer',
      },
      {
        path: '/providers/verified-studio-mumbai',
        expectedCanon: 'https://dealsathi.in/providers/verified-studio-mumbai',
        expectedTitlePart: 'Verified Studio Mumbai',
      },
    ]) {
      const rawHtml = await (await fetch(`${BASE_URL}${dynCase.path}`)).text();
      validateNeutralSpaHtml(rawHtml, `raw ${dynCase.path}`, DIST_DIR);

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);
      await page.goto(`${BASE_URL}${dynCase.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);

      const canonCount = await page.locator('link[rel="canonical"]').count();
      const canon = await page.locator('link[rel="canonical"]').getAttribute('href');
      const title = await page.title();
      const robotsCount = await page.locator('meta[name="robots"]').count();
      if (canonCount !== 1 || canon !== dynCase.expectedCanon || !title.includes(dynCase.expectedTitlePart) || robotsCount !== 0) {
        failures.push(`dynamic ${dynCase.path}: canonCount=${canonCount} canon=${canon} title=${title} robotsCount=${robotsCount}`);
      }
      if (issues.length > 0) failures.push(`dynamic ${dynCase.path}: issues=${issues.join(' | ')}`);
      await context.close();
      console.log(`OK dynamic CSR ${dynCase.path} -> ${canon}`);
    }

    // 5. Missing dynamic slugs, unknown routes, and admin/auth routes
    for (const check of [
      { path: '/blog/non-existent-slug-test', expect404Api: true },
      { path: '/providers/non-existent-slug-test', expect404Api: true },
      { path: '/non-existent-route-xyz', expect404Api: false },
      { path: '/admin/login', expect404Api: false },
      { path: '/provider/dashboard', expect404Api: false, expectedFinalPath: '/become-a-partner' },
    ]) {
      const rawHtml = await (await fetch(`${BASE_URL}${check.path}`)).text();
      validateNeutralSpaHtml(rawHtml, `raw ${check.path}`, DIST_DIR);

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page, check.expect404Api);
      await page.goto(`${BASE_URL}${check.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);

      if (check.expectedFinalPath) {
        const finalPathname = new URL(page.url()).pathname;
        if (finalPathname !== check.expectedFinalPath) {
          failures.push(`${check.path}: expected redirect to ${check.expectedFinalPath}, got ${finalPathname}`);
        }
      } else {
        const robots = await page.locator('meta[name="robots"]').getAttribute('content');
        const canonCount = await page.locator('link[rel="canonical"]').count();
        if (robots !== 'noindex, nofollow' || canonCount !== 0) {
          failures.push(`${check.path}: expected noindex, nofollow + 0 canonicals, got robots=${robots} canonCount=${canonCount}`);
        }
      }
      if (issues.length > 0) failures.push(`${check.path}: issues=${issues.join(' | ')}`);
      await context.close();
      console.log(`OK protected/noindex route ${check.path}`);
    }

    // 6. Query parameters & query-dependent hydration behavior
    for (const qCase of [
      { path: '/?utm_source=audit', expectedCanon: 'https://dealsathi.in/' },
      { path: '/providers?category=home-construction', expectedCanon: 'https://dealsathi.in/providers' },
      {
        path: '/get-quote?service=Interior%20Design&category=home-construction',
        expectedCanon: 'https://dealsathi.in/get-quote',
      },
      { path: '/blog?category=Home%20%26%20Construction', expectedCanon: 'https://dealsathi.in/blog' },
    ]) {
      const rawHtml = await (await fetch(`${BASE_URL}${qCase.path}`)).text();
      const rawCanon = rawHtml.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
      if (rawCanon !== qCase.expectedCanon) {
        failures.push(`query ${qCase.path}: rawCanon=${rawCanon} expected=${qCase.expectedCanon}`);
      }

      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);
      await page.goto(`${BASE_URL}${qCase.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const canon = await page.locator('link[rel="canonical"]').getAttribute('href');
      if (canon !== qCase.expectedCanon) {
        failures.push(`query ${qCase.path}: DOM canon=${canon} expected=${qCase.expectedCanon}`);
      }
      if (issues.length > 0) failures.push(`query ${qCase.path}: hydration/browser issues -> ${issues.join(' | ')}`);
      await context.close();
      console.log(`OK query fallback & canonical ${qCase.path} -> ${canon}`);
    }

    // 7. Mocked authenticated sessions + SPA <Link> navigation
    for (const authCase of [
      { path: '/become-a-partner', key: 'dealsathi_provider_token' },
      { path: '/', key: 'dealsathi_admin_token' },
    ]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      await page.addInitScript((k) => localStorage.setItem(k, 'mock-session-token'), authCase.key);
      const issues = [];
      page.on('pageerror', (e) => issues.push(e.message));
      page.on('console', (m) => {
        if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('401')) {
          issues.push(`[${m.type()}] ${m.text()}`);
        }
      });
      await page.goto(`${BASE_URL}${authCase.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      if (issues.length > 0) failures.push(`auth session ${authCase.path} (${authCase.key}): ${issues.join(' | ')}`);
      await context.close();
    }
    console.log('OK mocked authenticated session createRoot fallback');

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await setupBrowserMocks(page);
      const issues = attachIssueListeners(page);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.click('nav a[href="/categories"]');
      await page.waitForTimeout(250);
      const c1 = await page.locator('link[rel="canonical"]').getAttribute('href');
      await page.click('a[href="/categories/digital-professional"]');
      await page.waitForTimeout(250);
      const c2 = await page.locator('link[rel="canonical"]').getAttribute('href');
      const t2 = await page.title();
      if (c1 !== 'https://dealsathi.in/categories' || c2 !== 'https://dealsathi.in/categories/digital-professional' || t2 !== 'Digital & Professional Services — Dealsathi') {
        failures.push(`SPA navigation mismatch: c1=${c1} c2=${c2} t2=${t2}`);
      }
      if (issues.length > 0) failures.push(`SPA navigation issues: ${issues.join(' | ')}`);
      await context.close();
      console.log(`OK client-side SPA navigation -> ${c1} -> ${c2}`);
    }

    // 8. Normal vs Googlebot User-Agent comparison on simulated server
    for (const u of ['/', '/categories', '/categories/digital-professional', '/blog/how-to-choose-interior-designer']) {
      const rChrome = await (await fetch(`${BASE_URL}${u}`, { headers: { 'User-Agent': CHROME_UA } })).text();
      const rBot = await (await fetch(`${BASE_URL}${u}`, { headers: { 'User-Agent': GOOGLEBOT_UA } })).text();
      if (rChrome !== rBot) {
        failures.push(`UA mismatch on ${u}: Chrome and Googlebot received different bodies`);
      }
    }
    console.log('OK Chrome vs Googlebot UA HTTP parity');

    if (failures.length > 0) {
      console.error('\nVERIFICATION FAILURES:\n- ' + failures.join('\n- '));
      process.exitCode = 1;
    } else {
      console.log('\nALL PHASE 2A-R2 REGRESSION TESTS PASSED (ZERO FAILURES, ZERO HYDRATION WARNINGS).');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Regression test suite crashed:', err);
  process.exit(1);
});
