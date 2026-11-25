import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIST_DIR = path.resolve(FRONTEND_ROOT, 'dist');

/**
 * Extracts local /assets/*.js and /assets/*.css references from an HTML shell
 * and verifies every referenced file exists in dist/.
 */
export function assertAssetRefsExist(html, distDir, fileLabel) {
  const refs = new Set();
  for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/gi)) {
    refs.add(match[1]);
  }
  if (refs.size === 0) {
    throw new Error(`${fileLabel} does not reference any /assets/* JS or CSS bundles.`);
  }
  for (const ref of refs) {
    const absPath = path.join(distDir, ref.replace(/^\//, ''));
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      throw new Error(`${fileLabel} references missing production asset: ${ref}`);
    }
  }
}

/**
 * Enforces mandatory neutrality invariants on an un-prerendered CSR SPA shell.
 */
export function validateNeutralSpaHtml(html, fileLabel, distDir) {
  if (!html || !html.trim()) {
    throw new Error(`${fileLabel} is missing or empty.`);
  }
  if (/<link\s+rel=["']canonical["']/i.test(html)) {
    throw new Error(`${fileLabel} must not contain any <link rel="canonical"> tag.`);
  }
  if (/<meta\s+property=["']og:url["']/i.test(html)) {
    throw new Error(`${fileLabel} must not contain homepage or route-specific og:url.`);
  }
  if (/<script[^>]+type=["']application\/ld\+json["']/i.test(html)) {
    throw new Error(`${fileLabel} must not contain route-specific JSON-LD scripts.`);
  }
  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) {
    throw new Error(`${fileLabel} must not contain a global noindex directive.`);
  }
  if (/data-prerender-route/i.test(html)) {
    throw new Error(`${fileLabel} must not contain a data-prerender-route marker.`);
  }
  if (!html.includes('<div id="root"></div>')) {
    throw new Error(`${fileLabel} must contain an empty <div id="root"></div> mount node for createRoot.`);
  }
  if (/<main[\s>]|<h1[\s>]|Loading page resources\.\.\./i.test(html)) {
    throw new Error(`${fileLabel} appears to contain prerendered page or Suspense markup.`);
  }
  if (/https?:\/\/konnevia\.in/i.test(html)) {
    throw new Error(`${fileLabel} contains legacy konnevia.in reference.`);
  }
  if (/dealsathi_admin_token|dealsathi_provider_token|JWT_SECRET|MONGODB_URI/i.test(html)) {
    throw new Error(`${fileLabel} contains unexpected private token or environment identifiers.`);
  }

  assertAssetRefsExist(html, distDir, fileLabel);
}

/**
 * Verifies shared static sitemap/robots dist invariants.
 */
export function validateDistSeoFiles(distDir) {
  if (fs.existsSync(path.join(distDir, 'sitemap.xml'))) {
    throw new Error('dist/sitemap.xml must not exist (Render rewrite requires no static sitemap.xml).');
  }
  const robotsPath = path.join(distDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    throw new Error('dist/robots.txt is missing after build.');
  }
  const robotsContent = fs.readFileSync(robotsPath, 'utf8');
  if (!robotsContent.includes('Sitemap: https://dealsathi.in/sitemap.xml')) {
    throw new Error('dist/robots.txt does not declare Sitemap: https://dealsathi.in/sitemap.xml.');
  }
}

/**
 * Generates dist/_spa.html from the unmodified Vite-generated dist/index.html shell
 * before any homepage prerendering overwrites dist/index.html.
 */
export function prepareSpaFallback(distDir = DEFAULT_DIST_DIR) {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('dist/index.html not found. Run "vite build" first.');
  }

  const templateHtml = fs.readFileSync(indexPath, 'utf8');
  validateNeutralSpaHtml(templateHtml, 'dist/index.html (pre-prerender template)', distDir);

  const spaPath = path.join(distDir, '_spa.html');
  fs.writeFileSync(spaPath, templateHtml, 'utf8');

  const writtenSpa = fs.readFileSync(spaPath, 'utf8');
  validateNeutralSpaHtml(writtenSpa, 'dist/_spa.html', distDir);
  return { templateHtml, spaPath };
}

// Standalone CLI execution for Release Unit A (neutral CSR + _spa.html only)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { spaPath } = prepareSpaFallback(DEFAULT_DIST_DIR);
  const indexHtml = fs.readFileSync(path.join(DEFAULT_DIST_DIR, 'index.html'), 'utf8');
  validateNeutralSpaHtml(indexHtml, 'dist/index.html', DEFAULT_DIST_DIR);
  validateDistSeoFiles(DEFAULT_DIST_DIR);
  console.log(`Release Unit A verified cleanly: ${path.relative(FRONTEND_ROOT, spaPath)} and dist/index.html are neutral CSR shells.`);
}
