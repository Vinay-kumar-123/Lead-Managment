import { createContext, useContext, useEffect } from 'react';
import { siteConfig, resolveAbsoluteImageUrl } from '../utils/seo.js';

export const SeoCollectorContext = createContext(null);

const ARTICLE_META_PROPERTIES = [
  'article:published_time',
  'article:modified_time',
  'article:author',
  'article:section',
  'article:tag',
];

function removeDynamicJsonLdScripts() {
  document.querySelectorAll('script[data-schema="dynamic-jsonld"]').forEach((el) => el.remove());
}

function removeArticleMetaTags() {
  ARTICLE_META_PROPERTIES.forEach((prop) => {
    document.querySelectorAll(`meta[property="${prop}"]`).forEach((el) => el.remove());
  });
}

/**
 * Custom hook to manage document title, core meta tags, robots directives,
 * canonical URL, Open Graph, Twitter Cards, and JSON-LD structured data in client SPA.
 */
export function usePageMeta({
  title,
  description,
  canonical,
  robots = null,
  ogType = 'website',
  ogImage = '/dealsathi-logo.png',
  article = null,
  jsonLd = null,
}) {
  const seoCollector = useContext(SeoCollectorContext);
  if (seoCollector) {
    seoCollector.meta = {
      title,
      description,
      canonical,
      robots,
      ogType,
      ogImage,
      article,
      jsonLd,
    };
  }

  const serializedJsonLd = jsonLd ? JSON.stringify(jsonLd) : null;
  const serializedArticle = article
    ? JSON.stringify({
        publishedAt: article.publishedAt || null,
        updatedAt: article.updatedAt || null,
        authorName: article.author?.name || null,
        category: article.category || null,
        tags: Array.isArray(article.tags) ? article.tags : [],
      })
    : null;

  useEffect(() => {
    // 1. Update Title
    const formattedTitle = title
      ? title.toLowerCase().includes(siteConfig.name.toLowerCase())
        ? title
        : `${title} — ${siteConfig.name}`
      : `${siteConfig.name} — ${siteConfig.tagline}`;
    document.title = formattedTitle;

    const setMetaTag = (attr, key, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // 2. Standard Meta Description
    const metaDescContent = description || siteConfig.description;
    setMetaTag('name', 'description', metaDescContent);

    // 3. Robots Directive (explicit noindex for private/error views; clean up on public views)
    if (robots) {
      setMetaTag('name', 'robots', robots);
    } else {
      document.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
    }

    // 4. Canonical URL (suppressed when canonical === null for error/private routes)
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    let canonicalHref = null;
    if (canonical === null) {
      if (existingCanonical) existingCanonical.remove();
      document.querySelectorAll('meta[property="og:url"]').forEach((el) => el.remove());
    } else {
      canonicalHref =
        canonical ||
        (typeof window !== 'undefined'
          ? `${siteConfig.url}${window.location.pathname}`
          : siteConfig.url);
      let linkCanonical = existingCanonical;
      if (!linkCanonical) {
        linkCanonical = document.createElement('link');
        linkCanonical.rel = 'canonical';
        document.head.appendChild(linkCanonical);
      }
      linkCanonical.href = canonicalHref;
      setMetaTag('property', 'og:url', canonicalHref);
    }

    // 5. Open Graph Tags
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('property', 'og:description', metaDescContent);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:site_name', siteConfig.name);

    const absoluteOgImage = resolveAbsoluteImageUrl(ogImage);
    setMetaTag('property', 'og:image', absoluteOgImage);

    // 6. Twitter Card Tags
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('name', 'twitter:description', metaDescContent);
    setMetaTag('name', 'twitter:image', absoluteOgImage);

    // 7. Article Specific OG Metadata
    removeArticleMetaTags();
    if (serializedArticle) {
      const parsedArticle = JSON.parse(serializedArticle);
      if (parsedArticle.publishedAt) {
        setMetaTag('property', 'article:published_time', new Date(parsedArticle.publishedAt).toISOString());
      }
      if (parsedArticle.updatedAt) {
        setMetaTag('property', 'article:modified_time', new Date(parsedArticle.updatedAt).toISOString());
      }
      if (parsedArticle.authorName) {
        setMetaTag('property', 'article:author', parsedArticle.authorName);
      }
      if (parsedArticle.category) {
        setMetaTag('property', 'article:section', parsedArticle.category);
      }
      parsedArticle.tags.forEach((tag) => {
        if (!tag) return;
        const tagMeta = document.createElement('meta');
        tagMeta.setAttribute('property', 'article:tag');
        tagMeta.setAttribute('content', tag);
        document.head.appendChild(tagMeta);
      });
    }

    // 8. JSON-LD Structured Data (supports single schema object or array of schemas)
    removeDynamicJsonLdScripts();
    if (serializedJsonLd) {
      const parsedSchemas = JSON.parse(serializedJsonLd);
      const schemaList = (Array.isArray(parsedSchemas) ? parsedSchemas : [parsedSchemas]).filter(Boolean);
      schemaList.forEach((schemaObj) => {
        const scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.setAttribute('data-schema', 'dynamic-jsonld');
        scriptEl.textContent = JSON.stringify(schemaObj);
        document.head.appendChild(scriptEl);
      });
    }

    return () => {
      removeDynamicJsonLdScripts();
      removeArticleMetaTags();
      if (robots) {
        document.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
      }
    };
  }, [title, description, canonical, robots, ogType, ogImage, serializedArticle, serializedJsonLd]);
}
