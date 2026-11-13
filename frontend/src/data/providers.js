// DEVELOPMENT SEED DATA ONLY
// IMPORTANT: All entries below are structured mock placeholders for interface validation.
// No real business is represented. In production, providers appear strictly after manual verification and written consent.

export const DEV_DATA_WARNING = 'DEVELOPMENT_SAMPLE_ONLY';

export const providers = [
  {
    id: 'dev-provider-001',
    slug: 'sample-interiors-studio',
    businessName: 'Studio ArchForm Design (Sample Listing)',
    contactPerson: null,
    mainService: 'Interior Design',
    categorySlug: 'home-construction',
    categoryName: 'Home & Construction',
    location: 'Mumbai, Maharashtra',
    serviceAreas: ['South Mumbai', 'Bandra', 'Andheri', 'Navi Mumbai', 'Thane'],
    description: 'This is a development placeholder profile demonstrating card hierarchy and profile layout. Real providers will be added with explicit written permission after verification.',
    experienceYears: null,
    verificationStatus: 'unverified', // 'unverified' | 'verified'
    publicationStatus: 'published', // 'draft' | 'published'
    isDevSample: true,
    rating: null, // Zero fake ratings per PRD rules
    reviewCount: 0,
    servicesOffered: ['Residential Interior Design', 'Turnkey 2BHK/3BHK Styling', 'Modular Kitchens', '3D Visual Walkthroughs'],
    portfolio: [],
    website: null,
    metaTitle: 'Studio ArchForm Design (Sample Listing) — KONNEVIA',
    metaDescription: 'Development sample provider listing on KONNEVIA for layout testing.',
  },
  {
    id: 'dev-provider-002',
    slug: 'sample-events-co',
    businessName: 'Verve Event Curators (Sample Listing)',
    contactPerson: null,
    mainService: 'Wedding Planning',
    categorySlug: 'events-lifestyle',
    categoryName: 'Events & Lifestyle',
    location: 'New Delhi, NCR',
    serviceAreas: ['Central Delhi', 'South Delhi', 'Gurugram', 'Noida'],
    description: 'This is a development placeholder profile. Real event management and wedding production partners will be published following manual KYC and verification.',
    experienceYears: null,
    verificationStatus: 'unverified',
    publicationStatus: 'published',
    isDevSample: true,
    rating: null,
    reviewCount: 0,
    servicesOffered: ['Destination Wedding Planning', 'Theme Conceptualization', 'Floral Stage Decor', 'Artist Management'],
    portfolio: [],
    website: null,
    metaTitle: 'Verve Event Curators (Sample Listing) — KONNEVIA',
    metaDescription: 'Development sample provider listing on KONNEVIA for layout testing.',
  },
  {
    id: 'dev-provider-003',
    slug: 'sample-digital-craft',
    businessName: 'Apex Pixel Labs (Sample Listing)',
    contactPerson: null,
    mainService: 'Website Development',
    categorySlug: 'digital-professional',
    categoryName: 'Digital & Professional Services',
    location: 'Bengaluru, Karnataka',
    serviceAreas: ['Bengaluru', 'Pan-India Remote'],
    description: 'Development sample listing for digital agency workflows. In production, only genuine software developers with verified portfolios are listed.',
    experienceYears: null,
    verificationStatus: 'unverified',
    publicationStatus: 'published',
    isDevSample: true,
    rating: null,
    reviewCount: 0,
    servicesOffered: ['React & Node.js Web Apps', 'Shopify E-commerce', 'Corporate Websites', 'Cloud Architecture'],
    portfolio: [],
    website: null,
    metaTitle: 'Apex Pixel Labs (Sample Listing) — KONNEVIA',
    metaDescription: 'Development sample provider listing on KONNEVIA for layout testing.',
  },
];

export const getProviderBySlug = (slug) => providers.find((p) => p.slug === slug);
export const getProvidersByCategory = (categorySlug) => providers.filter((p) => p.categorySlug === categorySlug);
export const getActiveProviders = () => providers.filter((p) => p.publicationStatus === 'published');
