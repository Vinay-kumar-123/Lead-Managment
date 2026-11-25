import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import {
  assertAssetRefsExist,
  prepareSpaFallback,
  validateDistSeoFiles,
  validateNeutralSpaHtml,
} from './spa-fallback.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(FRONTEND_ROOT, 'dist');
const SSR_CACHE_ROOT = path.resolve(FRONTEND_ROOT, 'node_modules', '.cache');
const LEGACY_TEMP_DIR = path.resolve(FRONTEND_ROOT, '.prerender-tmp');

export const PRERENDER_ROUTES = [
  '/',
  '/categories',
  '/categories/home-construction',
  '/categories/events-lifestyle',
  '/categories/business-property',
  '/categories/digital-professional',
  '/categories/education-career',
  '/services/interior-design',
  '/services/home-renovation',
  '/services/wedding-planning',
  '/services/website-development',
  '/providers',
  '/blog',
  '/get-quote',
  '/become-a-partner',
  '/about',
  '/contact',
  '/privacy-policy',
  '/terms',
];

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeJsonLdString(schemaObj) {
  return JSON.stringify(schemaObj).replace(/</g, '\\u003c');
}

function injectHeadAndRoot(templateHtml, routePath, renderedHtml, meta, seoHelpers) {
  const { siteConfig, resolveAbsoluteImageUrl } = seoHelpers;

  if (!meta || !meta.canonical) {
    throw new Error(`Route "${routePath}" did not emit a valid canonical URL during SSR render.`);
  }

  const formattedTitle = meta.title
    ? meta.title.toLowerCase().includes(siteConfig.name.toLowerCase())
      ? meta.title
      : `${meta.title} — ${siteConfig.name}`
    : `${siteConfig.name} — ${siteConfig.tagline}`;
  const description = meta.description || siteConfig.description;
  const canonicalUrl = meta.canonical;
  const ogType = meta.ogType || 'website';
  const absoluteImage = resolveAbsoluteImageUrl(meta.ogImage || '/dealsathi-logo.png');

  if (!canonicalUrl.startsWith(`${siteConfig.url}/`) && canonicalUrl !== siteConfig.url) {
    throw new Error(`Invalid canonical URL "${canonicalUrl}" for route "${routePath}".`);
  }

  let output = templateHtml;

  output = output.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtmlText(formattedTitle)}</title>`
  );
  output = output.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtmlAttr(description)}" />`
  );
  output = output.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${escapeHtmlAttr(ogType)}" />`
  );
  output = output.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtmlAttr(formattedTitle)}" />`
  );
  output = output.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`
  );
  output = output.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtmlAttr(absoluteImage)}" />`
  );
  output = output.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtmlAttr(formattedTitle)}" />`
  );
  output = output.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`
  );
  output = output.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtmlAttr(absoluteImage)}" />`
  );

  output = output.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  output = output.replace(/<meta\s+property="og:url"[^>]*>\s*/gi, '');
  output = output.replace(
    /<script\s+type="application\/ld\+json"\s+data-schema="dynamic-jsonld">[\s\S]*?<\/script>\s*/gi,
    ''
  );

  const headAdditions = [
    `    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
    `    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
  ];

  if (meta.robots) {
    headAdditions.push(`    <meta name="robots" content="${escapeHtmlAttr(meta.robots)}" />`);
  }

  if (meta.jsonLd) {
    const schemaList = (Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd]).filter(Boolean);
    for (const schemaObj of schemaList) {
      headAdditions.push(
        `    <script type="application/ld+json" data-schema="dynamic-jsonld">${safeJsonLdString(schemaObj)}</script>`
      );
    }
  }

  output = output.replace('</head>', `${headAdditions.join('\n')}\n  </head>`);

  const rootTarget = '<div id="root"></div>';
  if (!output.includes(rootTarget)) {
    throw new Error('Built template HTML does not contain <div id="root"></div>.');
  }

  output = output.replace(
    rootTarget,
    `<div id="root" data-prerender-route="${escapeHtmlAttr(routePath)}">${renderedHtml}</div>`
  );

  return output;
}

function validateGeneratedHtml(routePath, html, expectedCanonical, distDir) {
  const canonicalMatches = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/gi)];
  if (canonicalMatches.length !== 1) {
    throw new Error(`Expected exactly 1 canonical tag on "${routePath}", found ${canonicalMatches.length}.`);
  }
  if (canonicalMatches[0][1] !== expectedCanonical) {
    throw new Error(
      `Canonical mismatch on "${routePath}": expected "${expectedCanonical}", got "${canonicalMatches[0][1]}".`
    );
  }

  const titleMatches = [...html.matchAll(/<title>[\s\S]*?<\/title>/gi)];
  if (titleMatches.length !== 1) {
    throw new Error(`Expected exactly 1 <title> tag on "${routePath}", found ${titleMatches.length}.`);
  }

  const descMatches = [...html.matchAll(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/gi)];
  if (descMatches.length !== 1 || !descMatches[0][1].trim()) {
    throw new Error(`Expected non-empty <meta name="description"> on "${routePath}".`);
  }

  const ogUrlMatches = [...html.matchAll(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?>/gi)];
  if (ogUrlMatches.length !== 1 || ogUrlMatches[0][1] !== expectedCanonical) {
    throw new Error(`Expected exactly 1 matching og:url on "${routePath}".`);
  }

  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) {
    throw new Error(`Route "${routePath}" must not contain noindex directive.`);
  }

  if (html.includes('Loading page resources...')) {
    throw new Error(`Route "${routePath}" rendered Suspense fallback instead of page content.`);
  }

  if (!html.includes('<main') || !html.includes('<h1')) {
    throw new Error(`Route "${routePath}" is missing semantic <main> or <h1> in prerendered HTML.`);
  }

  if (/https?:\/\/konnevia\.in/i.test(html)) {
    throw new Error(`Route "${routePath}" contains legacy konnevia.in reference.`);
  }

  if (/dealsathi_admin_token|dealsathi_provider_token|JWT_SECRET|MONGODB_URI/i.test(html)) {
    throw new Error(`Route "${routePath}" contains unexpected private or environment identifiers.`);
  }

  assertAssetRefsExist(html, distDir, routePath);
}

async function runPrerender() {
  // Step 1: Capture and validate neutral dist/_spa.html BEFORE overwriting dist/index.html
  const { templateHtml, spaPath } = prepareSpaFallback(DIST_DIR);
  console.log(`  [spa-fallback] Generated neutral CSR fallback -> ${path.relative(FRONTEND_ROOT, spaPath)}`);

  // Clean up any stale legacy root-level temp dir if present
  fs.rmSync(LEGACY_TEMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(SSR_CACHE_ROOT, { recursive: true });
  const ssrTempDir = fs.mkdtempSync(path.join(SSR_CACHE_ROOT, 'dealsathi-prerender-'));

  try {
    await build({
      root: FRONTEND_ROOT,
      configFile: false,
      publicDir: false,
      plugins: [react()],
      logLevel: 'silent',
      build: {
        ssr: 'src/entry-prerender.jsx',
        outDir: ssrTempDir,
        emptyOutDir: true,
        copyPublicDir: false,
        ssrEmitAssets: false,
        rollupOptions: {
          output: {
            format: 'cjs',
            inlineDynamicImports: true,
            entryFileNames: 'entry-prerender.cjs',
          },
        },
      },
    });

    const require = createRequire(import.meta.url);
    const { prerenderRoute, siteConfig, resolveAbsoluteImageUrl } = require(
      path.join(ssrTempDir, 'entry-prerender.cjs')
    );
    const seoHelpers = { siteConfig, resolveAbsoluteImageUrl };

    let count = 0;
    for (const routePath of PRERENDER_ROUTES) {
      const { html: renderedHtml, meta } = await prerenderRoute(routePath);
      const expectedCanonical =
        routePath === '/' ? `${seoHelpers.siteConfig.url}/` : `${seoHelpers.siteConfig.url}${routePath}`;

      const finalHtml = injectHeadAndRoot(templateHtml, routePath, renderedHtml, meta, seoHelpers);
      validateGeneratedHtml(routePath, finalHtml, expectedCanonical, DIST_DIR);

      const targetFile =
        routePath === '/'
          ? path.join(DIST_DIR, 'index.html')
          : path.join(DIST_DIR, routePath.replace(/^\//, ''), 'index.html');

      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, finalHtml, 'utf8');
      count++;
      console.log(`  [prerender] ${routePath} -> ${path.relative(FRONTEND_ROOT, targetFile)} (${expectedCanonical})`);
    }

    // Re-validate neutral _spa.html invariants after dist/index.html is overwritten
    const finalSpaHtml = fs.readFileSync(spaPath, 'utf8');
    validateNeutralSpaHtml(finalSpaHtml, 'dist/_spa.html (post-prerender check)', DIST_DIR);
    validateDistSeoFiles(DIST_DIR);

    console.log(`\nPrerendered ${count}/${PRERENDER_ROUTES.length} static routes cleanly + verified dist/_spa.html.`);
  } finally {
    fs.rmSync(ssrTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runPrerender().catch((err) => {
    console.error('Prerender failed:', err);
    process.exit(1);
  });
}
