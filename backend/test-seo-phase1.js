import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import app from './src/app.js';
import env from './src/config/env.js';
import Blog from './src/models/Blog.js';
import Provider from './src/models/Provider.js';
import Category from './src/models/Category.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

async function assertTest(label, fn) {
  try {
    const res = await fn();
    if (res === true) {
      passed++;
      console.log(`  PASS: ${label}`);
    } else {
      failed++;
      console.error(`  FAIL: ${label} — ${res}`);
    }
  } catch (err) {
    failed++;
    console.error(`  ERROR: ${label} — ${err.message}`);
  }
}

function makeRequest(baseUrl, reqPath, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function mockQueryChain(records) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => (typeof records === 'function' ? records() : records),
  };
  return chain;
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  DEALSATHI — SEO Remediation Phase 1 Isolated Test Suite');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const origReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const origCategoryFind = Category.find;
  const origBlogFind = Blog.find;
  const origBlogFindOne = Blog.findOne;
  const origProviderFind = Provider.find;

  const setDbConnected = (connected) => {
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => (connected ? 1 : 0),
    });
  };

  try {
    // ── 1. Centralized SITE_URL config ────────────────────────────────────
    await assertTest('env.siteUrl defaults to https://dealsathi.in without trailing slash', async () => {
      if (env.siteUrl !== 'https://dealsathi.in') {
        return `Expected https://dealsathi.in, got ${env.siteUrl}`;
      }
      return true;
    });

    // ── 2. Dynamic Sitemap with Connected Mock DB ─────────────────────────
    setDbConnected(true);
    const mockCategories = [
      { slug: 'home-construction', updatedAt: new Date('2026-11-22T00:00:00Z') },
      { slug: 'events-lifestyle', updatedAt: new Date('2026-11-22T00:00:00Z') },
      { slug: 'business-property', updatedAt: new Date('2026-11-22T00:00:00Z') },
      { slug: 'digital-professional', updatedAt: new Date('2026-11-22T00:00:00Z') },
      { slug: 'education-career', updatedAt: new Date('2026-11-22T00:00:00Z') },
      { slug: 'non-canonical-junk', updatedAt: new Date('2026-11-22T00:00:00Z') },
    ];
    const mockBlogs = [
      {
        slug: 'how-to-choose-interior-designer',
        publishedAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-11-12T07:46:40Z'),
      },
      {
        slug: 'how-to-choose-interior-designer', // duplicate slug guard check
        publishedAt: new Date('2026-01-15T10:00:00Z'),
      },
    ];
    const mockProviders = [
      {
        slug: 'verified-studio-mumbai',
        publishedAt: new Date('2026-11-20T09:00:00Z'),
        updatedAt: new Date('2026-11-21T09:00:00Z'),
      },
    ];

    let capturedProviderQuery = null;
    let capturedBlogQuery = null;

    Category.find = () => mockQueryChain(mockCategories);
    Blog.find = (q) => {
      capturedBlogQuery = q;
      return mockQueryChain(mockBlogs);
    };
    Provider.find = (q) => {
      capturedProviderQuery = q;
      return mockQueryChain(mockProviders);
    };

    const sitemapRes = await makeRequest(baseUrl, '/sitemap.xml');

    await assertTest('GET /sitemap.xml returns 200 and application/xml; charset=utf-8', async () => {
      if (sitemapRes.status !== 200) return `Got ${sitemapRes.status}`;
      if (!String(sitemapRes.headers['content-type']).includes('application/xml')) {
        return `Wrong content-type: ${sitemapRes.headers['content-type']}`;
      }
      return true;
    });

    await assertTest('Sitemap XML is well-formed and contains zero konnevia.in references', async () => {
      if (!sitemapRes.data.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) return 'Missing XML header';
      if (!sitemapRes.data.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) return 'Missing urlset';
      if (!sitemapRes.data.endsWith('</urlset>')) return 'Missing closing urlset';
      if (sitemapRes.data.toLowerCase().includes('konnevia')) return 'Found legacy konnevia reference in sitemap';
      return true;
    });

    await assertTest('Sitemap includes static pages, 5 canonical categories, curated services, blogs, and providers', async () => {
      const requiredUrls = [
        'https://dealsathi.in/',
        'https://dealsathi.in/categories',
        'https://dealsathi.in/categories/home-construction',
        'https://dealsathi.in/categories/events-lifestyle',
        'https://dealsathi.in/categories/business-property',
        'https://dealsathi.in/categories/digital-professional',
        'https://dealsathi.in/categories/education-career',
        'https://dealsathi.in/services/interior-design',
        'https://dealsathi.in/services/home-renovation',
        'https://dealsathi.in/services/wedding-planning',
        'https://dealsathi.in/services/website-development',
        'https://dealsathi.in/providers',
        'https://dealsathi.in/blog',
        'https://dealsathi.in/blog/how-to-choose-interior-designer',
        'https://dealsathi.in/providers/verified-studio-mumbai',
      ];
      for (const u of requiredUrls) {
        if (!sitemapRes.data.includes(`<loc>${u}</loc>`)) return `Missing URL: ${u}`;
      }
      if (sitemapRes.data.includes('non-canonical-junk')) return 'Non-canonical category leaked into sitemap';
      return true;
    });

    await assertTest('Sitemap excludes duplicate URLs and private /admin or /provider routes', async () => {
      const locs = [...sitemapRes.data.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      const uniqueLocs = new Set(locs);
      if (locs.length !== uniqueLocs.size) return `Duplicate URLs detected (${locs.length} vs ${uniqueLocs.size})`;
      for (const loc of locs) {
        if (/\/(admin|provider|api|render)(\/|$)/.test(new URL(loc).pathname)) {
          return `Private route leaked into sitemap: ${loc}`;
        }
      }
      return true;
    });

    await assertTest('Sitemap DB queries enforce published/verified/non-deleted/non-devSample gates', async () => {
      if (capturedBlogQuery?.status !== 'published' || !capturedBlogQuery?.isDeleted) {
        return `Unexpected Blog query: ${JSON.stringify(capturedBlogQuery)}`;
      }
      if (
        capturedProviderQuery?.verificationStatus !== 'VERIFIED' ||
        capturedProviderQuery?.publicationStatus !== 'PUBLISHED' ||
        !capturedProviderQuery?.isDeleted ||
        !capturedProviderQuery?.isDevSample
      ) {
        return `Unexpected Provider query: ${JSON.stringify(capturedProviderQuery)}`;
      }
      return true;
    });

    // ── 3. DB Failure Fallback ────────────────────────────────────────────
    Blog.find = () => mockQueryChain(() => Promise.reject(new Error('Simulated DB timeout')));
    Provider.find = () => mockQueryChain(() => Promise.reject(new Error('Simulated DB timeout')));
    Category.find = () => mockQueryChain(() => Promise.reject(new Error('Simulated DB timeout')));

    const fallbackRes = await makeRequest(baseUrl, '/sitemap.xml');
    await assertTest('Sitemap handles DB query failure gracefully with 200 XML and fallback Dealsathi URLs', async () => {
      if (fallbackRes.status !== 200) return `Expected 200, got ${fallbackRes.status}`;
      if (!fallbackRes.data.includes('<loc>https://dealsathi.in/</loc>')) return 'Missing homepage fallback';
      if (!fallbackRes.data.includes('<loc>https://dealsathi.in/categories/home-construction</loc>')) {
        return 'Missing canonical category fallback';
      }
      if (!fallbackRes.data.includes('<loc>https://dealsathi.in/blog/how-to-choose-interior-designer</loc>')) {
        return 'Missing defaultBlogs fallback';
      }
      if (fallbackRes.data.toLowerCase().includes('konnevia')) return 'Legacy domain in fallback XML';
      return true;
    });

    // ── 4. Crawler Blog Rendering (/render/blog/:slug & Googlebot) ────────
    setDbConnected(true);
    Blog.findOne = () =>
      mockQueryChain({
        title: 'How to Choose the Right Home Interior Designer in India',
        slug: 'how-to-choose-interior-designer',
        excerpt: 'Key scoping questions before commissioning home interiors.',
        content: '### Step 1\n\nDefine your scope.',
        category: 'Home & Construction',
        tags: ['Interior Design', 'Budgeting'],
        coverImage: '/assets/blog/interior-guide.jpg',
        status: 'published',
        publishedAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-11-12T07:46:40Z'),
        metaTitle: 'How to Choose the Right Home Interior Designer — KONNEVIA Editorial',
        metaDescription: 'Essential steps across India.',
        author: { name: 'KONNEVIA Editorial Staff', role: 'Design Lead' },
      });

    const renderRes = await makeRequest(baseUrl, '/render/blog/how-to-choose-interior-designer');
    await assertTest('Crawler render uses https://dealsathi.in for canonical, OG, Twitter, and JSON-LD', async () => {
      if (renderRes.status !== 200) return `Got ${renderRes.status}`;
      const html = renderRes.data;
      if (html.includes('konnevia.in')) return 'Legacy konnevia.in found in rendered HTML';
      if (html.includes('/assets/blog/interior-guide.jpg')) return 'Broken /assets/blog/*.jpg image URL was not fallen back';
      if (!html.includes('<link rel="canonical" href="https://dealsathi.in/blog/how-to-choose-interior-designer" />')) {
        return 'Missing Dealsathi canonical';
      }
      if (!html.includes('property="og:url" content="https://dealsathi.in/blog/how-to-choose-interior-designer"')) {
        return 'Missing Dealsathi og:url';
      }
      if (!html.includes('property="og:image" content="https://dealsathi.in/dealsathi-logo.png"')) {
        return 'Missing Dealsathi og:image fallback';
      }
      if (!html.includes('name="twitter:image" content="https://dealsathi.in/dealsathi-logo.png"')) {
        return 'Missing Dealsathi twitter:image fallback';
      }
      const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!ldMatch) return 'Missing JSON-LD script';
      const ld = JSON.parse(ldMatch[1]);
      if (ld.mainEntityOfPage?.['@id'] !== 'https://dealsathi.in/blog/how-to-choose-interior-designer') {
        return `Wrong JSON-LD mainEntityOfPage: ${ld.mainEntityOfPage?.['@id']}`;
      }
      if (ld.publisher?.url !== 'https://dealsathi.in' || ld.publisher?.logo?.url !== 'https://dealsathi.in/dealsathi-logo.png') {
        return `Wrong JSON-LD publisher: ${JSON.stringify(ld.publisher)}`;
      }
      return true;
    });

    const botRes = await makeRequest(baseUrl, '/blog/how-to-choose-interior-designer', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    });
    await assertTest('Direct /blog/:slug with Googlebot UA returns Dealsathi prerendered HTML', async () => {
      if (botRes.status !== 200) return `Got ${botRes.status}`;
      if (!botRes.data.includes('<link rel="canonical" href="https://dealsathi.in/blog/how-to-choose-interior-designer" />')) {
        return 'Googlebot did not receive Dealsathi canonical';
      }
      return true;
    });

    Blog.findOne = () => mockQueryChain(null);
    const missingBlogRes = await makeRequest(baseUrl, '/render/blog/missing-post-xyz');
    await assertTest('Missing blog returns 404 with noindex, nofollow and Dealsathi blog link', async () => {
      if (missingBlogRes.status !== 404) return `Expected 404, got ${missingBlogRes.status}`;
      if (!missingBlogRes.data.includes('noindex, nofollow')) return 'Missing noindex, nofollow';
      if (!missingBlogRes.data.includes('https://dealsathi.in/blog')) return 'Missing Dealsathi blog link';
      return true;
    });

    // ── 5. Frontend Public Files (robots.txt & fallback sitemap.xml) ──────
    const robotsTxt = fs.readFileSync(path.resolve(__dirname, '..', 'frontend', 'public', 'robots.txt'), 'utf8');
    await assertTest('frontend/public/robots.txt declares Sitemap: https://dealsathi.in/sitemap.xml', async () => {
      if (!robotsTxt.includes('Sitemap: https://dealsathi.in/sitemap.xml')) return 'Missing Dealsathi sitemap directive';
      if (robotsTxt.toLowerCase().includes('konnevia')) return 'Legacy konnevia found in robots.txt';
      return true;
    });

    const staticSitemap = fs.readFileSync(path.resolve(__dirname, '..', 'frontend', 'public', 'sitemap.xml'), 'utf8');
    await assertTest('frontend/public/sitemap.xml fallback has only https://dealsathi.in URLs', async () => {
      if (staticSitemap.toLowerCase().includes('konnevia')) return 'Legacy konnevia found in static sitemap fallback';
      if (!staticSitemap.includes('<loc>https://dealsathi.in/</loc>')) return 'Missing root Dealsathi URL';
      if (!staticSitemap.includes('<loc>https://dealsathi.in/categories/home-construction</loc>')) {
        return 'Missing canonical category URL';
      }
      return true;
    });

    // ── 6. Frontend SEO Utilities & Schema Builders ───────────────────────
    const seoUtilsUrl = pathToFileURL(path.resolve(__dirname, '..', 'frontend', 'src', 'utils', 'seo.js')).href;
    const seoUtils = await import(seoUtilsUrl);

    await assertTest('Frontend SEO schema builders emit valid Organization, WebSite, BreadcrumbList, and LocalBusiness', async () => {
      const org = seoUtils.buildOrganizationSchema();
      const web = seoUtils.buildWebSiteSchema();
      const bc = seoUtils.buildBreadcrumbSchema([{ name: 'Categories', path: '/categories' }]);
      if (org['@type'] !== 'Organization' || org.url !== 'https://dealsathi.in') return 'Invalid Organization schema';
      if (web['@type'] !== 'WebSite' || !web.potentialAction?.target?.startsWith('https://dealsathi.in/providers')) {
        return 'Invalid WebSite schema';
      }
      if (bc['@type'] !== 'BreadcrumbList' || bc.itemListElement.length !== 2) return 'Invalid BreadcrumbList';

      // Dev sample or unverified provider must NOT produce LocalBusiness schema
      if (seoUtils.buildLocalBusinessSchema({ businessName: 'Sample', slug: 'sample', city: 'Mumbai', isDevSample: true, verificationStatus: 'VERIFIED' }) !== null) {
        return 'Dev sample emitted LocalBusiness';
      }
      if (seoUtils.buildLocalBusinessSchema({ businessName: 'Unverified', slug: 'u', city: 'Mumbai', verificationStatus: 'UNVERIFIED' }) !== null) {
        return 'Unverified provider emitted LocalBusiness';
      }
      const lb = seoUtils.buildLocalBusinessSchema({
        businessName: 'Verified Co',
        slug: 'verified-co',
        city: 'Pune',
        state: 'Maharashtra',
        verificationStatus: 'VERIFIED',
        consentToDisplayPhone: false,
        contactNumber: '9820000000',
      });
      if (!lb || lb['@type'] !== 'LocalBusiness' || lb.telephone || lb.aggregateRating) {
        return `Invalid LocalBusiness output: ${JSON.stringify(lb)}`;
      }
      if (seoUtils.resolveAbsoluteImageUrl('/assets/blog/interior-guide.jpg') !== 'https://dealsathi.in/dealsathi-logo.png') {
        return 'resolveAbsoluteImageUrl failed to fall back for broken blog path';
      }
      return true;
    });
  } finally {
    if (origReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', origReadyStateDescriptor);
    }
    Category.find = origCategoryFind;
    Blog.find = origBlogFind;
    Blog.findOne = origBlogFindOne;
    Provider.find = origProviderFind;
    server.close();
  }

  console.log('\n============================================================');
  console.log(`  Results: ${passed} PASSED, ${failed} FAILED / ${passed + failed} total`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
