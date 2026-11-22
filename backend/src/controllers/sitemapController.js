import mongoose from 'mongoose';
import Blog from '../models/Blog.js';
import Provider from '../models/Provider.js';
import Category from '../models/Category.js';
import { defaultBlogs } from '../controllers/blogController.js';
import { CANONICAL_MAIN_CATEGORIES } from '../services/categoryService.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// Google sitemaps.org protocol limits a single sitemap to 50,000 URLs / 50 MB uncompressed.
// Once combined URL volume approaches this threshold, introduce a sitemap index splitting
// categories, blogs, and providers into dedicated paginated sitemap files.
const MAX_SITEMAP_URLS = 50000;
const MAX_DB_DOCS_PER_TYPE = 10000;

// Static public pages that belong in the sitemap (excludes /admin, /provider, /api, /render)
const STATIC_ROUTES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/categories', changefreq: 'weekly', priority: '0.9' },
  { loc: '/providers', changefreq: 'weekly', priority: '0.8' },
  { loc: '/get-quote', changefreq: 'monthly', priority: '0.9' },
  { loc: '/become-a-partner', changefreq: 'monthly', priority: '0.8' },
  { loc: '/blog', changefreq: 'daily', priority: '0.8' },
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.6' },
  { loc: '/privacy-policy', changefreq: 'yearly', priority: '0.4' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.4' },
];

// Curated public /services/:slug landing pages backed by ServiceDetailPage & frontend/src/data/services.js
const PUBLIC_SERVICE_SLUGS = [
  'interior-design',
  'home-renovation',
  'wedding-planning',
  'website-development',
];

const CANONICAL_CATEGORY_SLUGS = new Set(CANONICAL_MAIN_CATEGORIES.map((c) => c.slug));

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatLastmod(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

function normalizeSlug(rawSlug) {
  const clean = String(rawSlug || '').trim().toLowerCase();
  if (!clean || /\s/.test(clean)) return '';
  return clean;
}

export const sitemapController = {
  /**
   * GET /sitemap.xml
   * Dynamically generates an XML sitemap of public static pages, canonical categories,
   * active curated service pages, published blog articles, and verified+published providers.
   */
  async getSitemap(req, res, next) {
    try {
      const siteUrl = env.siteUrl;
      const isDbConnected = mongoose.connection.readyState === 1;
      let categories = [];
      let articles = [];
      let providers = [];
      let dbQueryFailed = false;

      if (isDbConnected) {
        try {
          // Strictly active canonical categories, published non-deleted blogs, and verified+published non-dev providers
          [categories, articles, providers] = await Promise.all([
            Category.find({ isMain: true, isActive: true, isDeleted: { $ne: true } })
              .select('slug updatedAt')
              .sort({ displayOrder: 1 })
              .limit(20)
              .lean(),
            Blog.find({ status: 'published', isDeleted: { $ne: true } })
              .select('slug publishedAt updatedAt')
              .sort({ publishedAt: -1 })
              .limit(MAX_DB_DOCS_PER_TYPE)
              .lean(),
            Provider.find({
              isDeleted: { $ne: true },
              verificationStatus: 'VERIFIED',
              publicationStatus: 'PUBLISHED',
              isDevSample: { $ne: true },
            })
              .select('slug publishedAt updatedAt')
              .sort({ publishedAt: -1 })
              .limit(MAX_DB_DOCS_PER_TYPE)
              .lean(),
          ]);
        } catch (dbErr) {
          dbQueryFailed = true;
          logger.warn('Failed querying published records for sitemap, falling back to safe defaults', {
            error: dbErr.message,
          });
        }
      }

      // If DB is disconnected or query failed, fall back to canonical static categories & published defaultBlogs
      if (!isDbConnected || dbQueryFailed) {
        if (categories.length === 0) {
          categories = CANONICAL_MAIN_CATEGORIES.map((c) => ({ slug: c.slug }));
        }
        if (articles.length === 0) {
          articles = defaultBlogs.filter((b) => b.status === 'published');
        }
      }

      const entries = [];
      const seenUrls = new Set();

      const addEntry = ({ path, lastmod = null, changefreq = 'weekly', priority = '0.7' }) => {
        if (entries.length >= MAX_SITEMAP_URLS) return;
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const fullUrl = `${siteUrl}${normalizedPath}`;
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);
        entries.push({ loc: fullUrl, lastmod: formatLastmod(lastmod), changefreq, priority });
      };

      // 1. Static Public Routes
      for (const route of STATIC_ROUTES) {
        addEntry({ path: route.loc, changefreq: route.changefreq, priority: route.priority });
      }

      // 2. Canonical Category Landing Pages (/categories/:slug)
      const activeCanonicalCategories = categories.filter((c) => CANONICAL_CATEGORY_SLUGS.has(normalizeSlug(c.slug)));
      const categoriesForSitemap =
        activeCanonicalCategories.length > 0
          ? activeCanonicalCategories
          : !isDbConnected || dbQueryFailed
          ? CANONICAL_MAIN_CATEGORIES
          : [];
      for (const category of categoriesForSitemap) {
        const cleanSlug = normalizeSlug(category.slug);
        if (!cleanSlug) continue;
        addEntry({
          path: `/categories/${cleanSlug}`,
          lastmod: category.updatedAt,
          changefreq: 'weekly',
          priority: '0.85',
        });
      }

      // 3. Curated Public Service Landing Pages (/services/:slug)
      for (const serviceSlug of PUBLIC_SERVICE_SLUGS) {
        const cleanSlug = normalizeSlug(serviceSlug);
        if (!cleanSlug) continue;
        addEntry({
          path: `/services/${cleanSlug}`,
          changefreq: 'monthly',
          priority: '0.8',
        });
      }

      // 4. Published Blog Articles (no drafts, no archived, no duplicates)
      for (const article of articles) {
        const cleanSlug = normalizeSlug(article.slug);
        if (!cleanSlug) continue;
        addEntry({
          path: `/blog/${cleanSlug}`,
          lastmod: article.updatedAt || article.publishedAt,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }

      // 5. Verified & Published Provider Profiles
      for (const provider of providers) {
        const cleanSlug = normalizeSlug(provider.slug);
        if (!cleanSlug) continue;
        addEntry({
          path: `/providers/${cleanSlug}`,
          lastmod: provider.updatedAt || provider.publishedAt,
          changefreq: 'weekly',
          priority: '0.8',
        });
      }

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      for (const entry of entries) {
        xml += '  <url>\n';
        xml += `    <loc>${escapeXml(entry.loc)}</loc>\n`;
        if (entry.lastmod) {
          xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
        }
        xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
        xml += `    <priority>${entry.priority}</priority>\n`;
        xml += '  </url>\n';
      }
      xml += '</urlset>';

      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');
      return res.status(200).send(xml);
    } catch (err) {
      logger.error('Error generating dynamic sitemap', { error: err.message });
      next(err);
    }
  },
};

export default sitemapController;
