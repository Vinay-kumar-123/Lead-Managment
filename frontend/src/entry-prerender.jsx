import React from 'react';
import { Writable } from 'stream';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';
import { SeoCollectorContext } from './hooks/usePageMeta.js';
export { siteConfig, resolveAbsoluteImageUrl } from './utils/seo.js';

/**
 * Renders a static public route to HTML string during the Vite post-build prerender step.
 * Waits for all React.lazy() route chunks via renderToPipeableStream's onAllReady hook.
 */
export async function prerenderRoute(routePath) {
  const seoCollector = { meta: null };
  const helmetContext = {};

  const appTree = (
    <React.StrictMode>
      <HelmetProvider context={helmetContext}>
        <SeoCollectorContext.Provider value={seoCollector}>
          <StaticRouter location={routePath}>
            <App />
          </StaticRouter>
        </SeoCollectorContext.Provider>
      </HelmetProvider>
    </React.StrictMode>
  );

  const html = await new Promise((resolve, reject) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });

    writable.on('finish', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    writable.on('error', reject);

    let settled = false;
    const { pipe, abort } = renderToPipeableStream(appTree, {
      onAllReady() {
        if (settled) return;
        settled = true;
        pipe(writable);
      },
      onShellError(err) {
        if (settled) return;
        settled = true;
        reject(err);
      },
      onError(err) {
        if (!settled) {
          settled = true;
          abort();
          reject(err);
        }
      },
    });
  });

  return {
    html,
    meta: seoCollector.meta,
  };
}
