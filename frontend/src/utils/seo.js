export const siteConfig = {
  name: 'Dealsathi',
  tagline: 'Discover. Connect. Get Things Done.',
  url: 'https://dealsathi.in',
  logoUrl: 'https://dealsathi.in/dealsathi-logo.png',
  description: 'Dealsathi is a Pan-India service marketplace connecting customers with verified professionals across Home & Construction, Events & Lifestyle, Business & Property, Digital & Professional, and Education & Career services.',
  supportEmail: 'hello@dealsathi.in',
};

export function buildPageTitle(pageTitle) {
  if (!pageTitle) return `${siteConfig.name} — ${siteConfig.tagline}`;
  return `${pageTitle} — ${siteConfig.name}`;
}

export function buildCanonical(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${siteConfig.url}${cleanPath}`;
}

export function resolveAbsoluteImageUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || /^\/assets\/blog\//i.test(trimmed)) {
    return siteConfig.logoUrl;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `${siteConfig.url}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: siteConfig.logoUrl,
    description: siteConfig.description,
    email: siteConfig.supportEmail,
  };
}

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteConfig.url}/providers?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildBreadcrumbSchema(items = []) {
  const listItems = [{ name: 'Home', path: '/' }, ...items].filter((item) => item && item.name);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: listItems.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      ...(item.path ? { item: buildCanonical(item.path) } : {}),
    })),
  };
}

export function buildLocalBusinessSchema(provider) {
  if (!provider || provider.isDevSample) return null;
  const isVerified =
    provider.verificationStatus === 'VERIFIED' || provider.verificationStatus === 'verified';
  if (!isVerified || !provider.businessName || !provider.slug || !provider.city) {
    return null;
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: provider.businessName,
    url: buildCanonical(`/providers/${provider.slug}`),
    address: {
      '@type': 'PostalAddress',
      addressLocality: provider.city,
      ...(provider.state ? { addressRegion: provider.state } : {}),
      ...(provider.address ? { streetAddress: provider.address } : {}),
      ...(provider.pinCode ? { postalCode: provider.pinCode } : {}),
      addressCountry: 'IN',
    },
  };

  if (provider.description) {
    schema.description = provider.description;
  }
  if (provider.contactNumber && provider.consentToDisplayPhone !== false) {
    schema.telephone = provider.contactNumber;
  }
  if (Array.isArray(provider.serviceAreas) && provider.serviceAreas.length > 0) {
    schema.areaServed = provider.serviceAreas;
  }
  if (provider.website && /^https?:\/\//i.test(provider.website.trim())) {
    schema.sameAs = [provider.website.trim()];
  }

  return schema;
}
