/**
 * Dealsathi Search Dictionary, Taxonomy Mapping, Stemmer & Location Aliases
 *
 * Design rules:
 * - Strictly preserves the 5 canonical main categories.
 * - Controlled related-service expansion only (never expands across unrelated siblings).
 * - Distinguishes exact city, serviceArea/locality, and nearby-region clusters without conflating them.
 * - Bounded typo correction against curated marketplace vocabulary only (no external services).
 */

export const CANONICAL_MAIN_CATEGORY_SLUGS = [
  'home-construction',
  'events-lifestyle',
  'business-property',
  'digital-professional',
  'education-career',
];

export const MAX_KEYWORDS = 15;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_QUERY_LENGTH = 120;
export const MAX_QUERY_TOKENS = 8;

const STOPWORDS = new Set([
  'in',
  'at',
  'near',
  'around',
  'for',
  'of',
  'the',
  'a',
  'an',
  'and',
  'with',
  'by',
  'on',
  'to',
  'from',
  'best',
  'top',
  'good',
  'verified',
  'find',
  'looking',
  'need',
  'hire',
]);

/**
 * Deterministic suffix/stem rules tailored for Indian marketplace service terminology.
 * Order matters: longest / most specific patterns first.
 */
const STEM_RULES = [
  [/^(photographers?|photographic|photography)$/, 'photograph'],
  [/^(videographers?|videography)$/, 'videograph'],
  [/^(cinematographers?|cinematography)$/, 'cinematograph'],
  [/^(managements?|management|managers?|manager|managing|manage)$/, 'manag'],
  [/^(planners?|planner|planning|planned|plans?)$/, 'plan'],
  [/^(decorators?|decorator|decorations?|decoration|decorating|decor)$/, 'decor'],
  [/^(designers?|designer|designing|designs?|design)$/, 'design'],
  [/^(developers?|developer|developing|development|develop)$/, 'develop'],
  [/^(renovators?|renovator|renovations?|renovation|renovating|renovate)$/, 'renovat'],
  [/^(remodeling|remodelling|remodelers?|remodel)$/, 'remodel'],
  [/^(contractors?|contractor|contracting|contracts?)$/, 'contract'],
  [/^(consultants?|consultant|consulting|consultancy)$/, 'consult'],
  [/^(advisors?|advisor|advisory|advising)$/, 'advis'],
  [/^(painters?|painter|painting|paints?)$/, 'paint'],
  [/^(plumbers?|plumber|plumbing)$/, 'plumb'],
  [/^(caterers?|caterer|catering)$/, 'cater'],
  [/^(marketers?|marketer|marketing)$/, 'market'],
  [/^(organizers?|organisers?|organizer|organiser|organizing|organising|organize|organise)$/, 'organiz'],
  [/^(coordinators?|coordinator|coordinating|coordination|coordinate)$/, 'coordinat'],
  [/^(trainers?|trainer|training|trainings?)$/, 'train'],
  [/^(mentors?|mentor|mentorship|mentoring)$/, 'mentor'],
  [/^(counsellors?|counselors?|counselling|counseling)$/, 'counsel'],
  [/^(internships?|internship|interns?)$/, 'intern'],
  [/^(accountants?|accounting)$/, 'account'],
  [/^(architects?|architectural|architecture)$/, 'architect'],
  [/^(builders?|builder|building)$/, 'build'],
  [/^(engineers?|engineer|engineering)$/, 'engin'],
  [/^(builders?|constructing|construction)$/, 'construct'],
  [/^(incorporation|incorporate)$/, 'incorporat'],
  [/^(registrations?|registration|register)$/, 'registr'],
  [/^(verification|verify)$/, 'verif'],
  [/^(weddings?|wedding)$/, 'wedding'],
  [/^(events?|event)$/, 'event'],
  [/^(interiors?|interior)$/, 'interior'],
  [/^(websites?|website)$/, 'website'],
  [/^(softwares?|software)$/, 'software'],
  [/^(properties|property)$/, 'property'],
  [/^(services|service)$/, 'servic'],
  [/^(agencies|agency)$/, 'agenc'],
  [/^(studios?|studio)$/, 'studio'],
  [/^(shoots?|shooting|shoot)$/, 'shoot'],
  [/^(bridals?|bridal)$/, 'bridal'],
  [/^(candids?|candid)$/, 'candid'],
  [/^(stylists?|styling)$/, 'styl'],
  [/^(apps?|app|applications?)$/, 'app'],
];

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stemToken(token) {
  const clean = String(token || '').toLowerCase().trim();
  if (!clean) return '';

  for (const [pattern, replacement] of STEM_RULES) {
    if (pattern.test(clean)) {
      return replacement;
    }
  }

  if (clean.length > 4 && clean.endsWith('ies')) {
    return clean.slice(0, -3) + 'y';
  }
  if (
    clean.length > 4 &&
    clean.endsWith('s') &&
    !clean.endsWith('ss') &&
    !clean.endsWith('us') &&
    !clean.endsWith('is')
  ) {
    return clean.slice(0, -1);
  }
  return clean;
}

export function tokenizeRaw(text) {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm.split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function tokenizeAndStem(text) {
  const raw = tokenizeRaw(text);
  const out = new Set();
  for (const tok of raw) {
    out.add(tok);
    const stemmed = stemToken(tok);
    if (stemmed && stemmed.length >= 2) {
      out.add(stemmed);
    }
  }
  return Array.from(out);
}

/**
 * Validates, deduplicates, and bounds provider/service keywords to prevent keyword stuffing.
 */
export function normalizeKeywords(rawInput, { maxCount = MAX_KEYWORDS, maxLen = MAX_KEYWORD_LENGTH } = {}) {
  let items = [];
  if (Array.isArray(rawInput)) {
    items = rawInput;
  } else if (typeof rawInput === 'string') {
    items = rawInput.split(',');
  } else {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const raw of items) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const cleaned = String(raw)
      .replace(/[<>]|[\x00-\x1F\x7F]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (cleaned.length < 2 || cleaned.length > maxLen) continue;

    // Anti-stuffing: disallow >5 words in one tag or repeated identical words ("delhi delhi delhi")
    const words = cleaned.toLowerCase().split(' ').filter(Boolean);
    if (words.length > 5) continue;
    if (words.length >= 2 && new Set(words).size === 1) continue;

    const dedupeKey = cleaned.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(cleaned);

    if (result.length >= maxCount) break;
  }

  return result;
}

/**
 * Curated Indian city catalog with strict distinction between:
 * - aliases: genuine alternate names/spellings of the same city
 * - nearbyRegion: neighboring cities in a metro cluster (never silently conflated with exact city)
 */
export const LOCATION_CATALOG = [
  {
    canonical: 'delhi',
    display: 'Delhi',
    aliases: ['delhi', 'new delhi', 'delhi ncr', 'ncr delhi', 'dilli'],
    nearbyRegion: ['ncr', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad', 'greater noida'],
  },
  {
    canonical: 'new delhi',
    display: 'New Delhi',
    aliases: ['new delhi', 'delhi'],
    nearbyRegion: ['ncr', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad'],
  },
  {
    canonical: 'ncr',
    display: 'Delhi NCR',
    aliases: ['ncr', 'delhi ncr'],
    nearbyRegion: ['delhi', 'new delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad', 'greater noida'],
  },
  {
    canonical: 'gurugram',
    display: 'Gurugram',
    aliases: ['gurugram', 'gurgaon'],
    nearbyRegion: ['delhi', 'new delhi', 'faridabad', 'noida', 'ncr'],
  },
  {
    canonical: 'noida',
    display: 'Noida',
    aliases: ['noida', 'greater noida'],
    nearbyRegion: ['delhi', 'new delhi', 'ghaziabad', 'gurugram', 'ncr'],
  },
  {
    canonical: 'ghaziabad',
    display: 'Ghaziabad',
    aliases: ['ghaziabad'],
    nearbyRegion: ['delhi', 'noida', 'ncr'],
  },
  {
    canonical: 'faridabad',
    display: 'Faridabad',
    aliases: ['faridabad'],
    nearbyRegion: ['delhi', 'gurugram', 'ncr'],
  },
  {
    canonical: 'mumbai',
    display: 'Mumbai',
    aliases: ['mumbai', 'bombay'],
    nearbyRegion: ['navi mumbai', 'thane'],
  },
  {
    canonical: 'navi mumbai',
    display: 'Navi Mumbai',
    aliases: ['navi mumbai'],
    nearbyRegion: ['mumbai', 'thane'],
  },
  {
    canonical: 'thane',
    display: 'Thane',
    aliases: ['thane'],
    nearbyRegion: ['mumbai', 'navi mumbai'],
  },
  {
    canonical: 'bengaluru',
    display: 'Bengaluru',
    aliases: ['bengaluru', 'bangalore', 'blr'],
    nearbyRegion: [],
  },
  {
    canonical: 'kolkata',
    display: 'Kolkata',
    aliases: ['kolkata', 'calcutta'],
    nearbyRegion: ['howrah', 'salt lake', 'new town', 'rajarhat'],
  },
  {
    canonical: 'howrah',
    display: 'Howrah',
    aliases: ['howrah'],
    nearbyRegion: ['kolkata'],
  },
  {
    canonical: 'haldia',
    display: 'Haldia',
    aliases: ['haldia'],
    nearbyRegion: ['purba medinipur', 'tamluk'],
  },
  {
    canonical: 'chennai',
    display: 'Chennai',
    aliases: ['chennai', 'madras'],
    nearbyRegion: [],
  },
  {
    canonical: 'hyderabad',
    display: 'Hyderabad',
    aliases: ['hyderabad', 'secunderabad'],
    nearbyRegion: ['secunderabad'],
  },
  {
    canonical: 'pune',
    display: 'Pune',
    aliases: ['pune', 'pimpri chinchwad', 'pcmc'],
    nearbyRegion: [],
  },
  { canonical: 'ahmedabad', display: 'Ahmedabad', aliases: ['ahmedabad', 'amdavad'], nearbyRegion: ['gandhinagar'] },
  { canonical: 'jaipur', display: 'Jaipur', aliases: ['jaipur'], nearbyRegion: [] },
  { canonical: 'udaipur', display: 'Udaipur', aliases: ['udaipur'], nearbyRegion: [] },
  { canonical: 'surat', display: 'Surat', aliases: ['surat'], nearbyRegion: [] },
  { canonical: 'lucknow', display: 'Lucknow', aliases: ['lucknow'], nearbyRegion: [] },
  { canonical: 'chandigarh', display: 'Chandigarh', aliases: ['chandigarh'], nearbyRegion: ['mohali', 'panchkula'] },
  { canonical: 'kochi', display: 'Kochi', aliases: ['kochi', 'cochin'], nearbyRegion: ['ernakulam'] },
  { canonical: 'indore', display: 'Indore', aliases: ['indore'], nearbyRegion: [] },
  { canonical: 'bhopal', display: 'Bhopal', aliases: ['bhopal'], nearbyRegion: [] },
  { canonical: 'patna', display: 'Patna', aliases: ['patna'], nearbyRegion: [] },
  { canonical: 'nagpur', display: 'Nagpur', aliases: ['nagpur'], nearbyRegion: [] },
  { canonical: 'vadodara', display: 'Vadodara', aliases: ['vadodara', 'baroda'], nearbyRegion: [] },
  { canonical: 'goa', display: 'Goa', aliases: ['goa', 'panaji'], nearbyRegion: [] },
  { canonical: 'visakhapatnam', display: 'Visakhapatnam', aliases: ['visakhapatnam', 'vizag'], nearbyRegion: [] },
  { canonical: 'coimbatore', display: 'Coimbatore', aliases: ['coimbatore'], nearbyRegion: [] },
  { canonical: 'guwahati', display: 'Guwahati', aliases: ['guwahati'], nearbyRegion: [] },
  { canonical: 'bhubaneswar', display: 'Bhubaneswar', aliases: ['bhubaneswar'], nearbyRegion: ['cuttack'] },
  { canonical: 'thiruvananthapuram', display: 'Thiruvananthapuram', aliases: ['thiruvananthapuram', 'trivandrum'], nearbyRegion: [] },
  { canonical: 'ranchi', display: 'Ranchi', aliases: ['ranchi'], nearbyRegion: [] },
  { canonical: 'raipur', display: 'Raipur', aliases: ['raipur'], nearbyRegion: [] },
  { canonical: 'dehradun', display: 'Dehradun', aliases: ['dehradun'], nearbyRegion: [] },
  { canonical: 'siliguri', display: 'Siliguri', aliases: ['siliguri'], nearbyRegion: [] },
  { canonical: 'durgapur', display: 'Durgapur', aliases: ['durgapur'], nearbyRegion: ['asansol'] },
  { canonical: 'asansol', display: 'Asansol', aliases: ['asansol'], nearbyRegion: ['durgapur'] },
  { canonical: 'jamshedpur', display: 'Jamshedpur', aliases: ['jamshedpur'], nearbyRegion: [] },
  { canonical: 'kanpur', display: 'Kanpur', aliases: ['kanpur'], nearbyRegion: [] },
  { canonical: 'varanasi', display: 'Varanasi', aliases: ['varanasi', 'banaras'], nearbyRegion: [] },
  { canonical: 'agra', display: 'Agra', aliases: ['agra'], nearbyRegion: [] },
  { canonical: 'nashik', display: 'Nashik', aliases: ['nashik'], nearbyRegion: [] },
  { canonical: 'rajkot', display: 'Rajkot', aliases: ['rajkot'], nearbyRegion: [] },
  { canonical: 'ludhiana', display: 'Ludhiana', aliases: ['ludhiana'], nearbyRegion: [] },
  { canonical: 'amritsar', display: 'Amritsar', aliases: ['amritsar'], nearbyRegion: [] },
  { canonical: 'jodhpur', display: 'Jodhpur', aliases: ['jodhpur'], nearbyRegion: [] },
  { canonical: 'mysuru', display: 'Mysuru', aliases: ['mysuru', 'mysore'], nearbyRegion: [] },
  { canonical: 'mangaluru', display: 'Mangaluru', aliases: ['mangaluru', 'mangalore'], nearbyRegion: [] },
  { canonical: 'vijayawada', display: 'Vijayawada', aliases: ['vijayawada'], nearbyRegion: [] },
  { canonical: 'madurai', display: 'Madurai', aliases: ['madurai'], nearbyRegion: [] },
];

// Fast alias -> entry lookup sorted longest-first for multi-word extraction ("new delhi", "navi mumbai")
export const LOCATION_ALIAS_ENTRIES = LOCATION_CATALOG.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, entry }))
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Controlled Service Intent & Taxonomy Graph
 * Maps service intents (and synonyms) to:
 * - primarySubcategorySlugs: direct subcategory matches
 * - relatedSubcategorySlugs: tightly controlled adjacent subcategories (lower weight)
 * - primaryPhrases / synonymPhrases: phrase patterns for exact vs synonym scoring
 * - requiredAnyStems: optional head-noun gate so e.g. "wedding photographer" requires photography intent
 *   and never surfaces non-photographer wedding planners.
 */
export const SERVICE_INTENT_RULES = [
  {
    id: 'wedding-photography',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['wedding photographer', 'wedding photography', 'candid photographer', 'candid photography', 'pre wedding', 'pre-wedding', 'bridal photography', 'marriage photographer'],
    primarySubcategorySlugs: ['photography'],
    relatedSubcategorySlugs: [], // Never expand photography to general wedding planners
    primaryPhrases: ['wedding photography', 'wedding photographer', 'candid wedding', 'pre wedding', 'bridal shoot'],
    synonymPhrases: ['candid photography', 'event photography', 'wedding videography', 'photography'],
    requiredAnyStems: ['photograph', 'videograph', 'cinematograph', 'candid', 'camera'],
    boostTokens: ['photograph', 'wedding', 'candid', 'videograph', 'shoot'],
  },
  {
    id: 'photography',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['photographer', 'photography', 'cameraman', 'photo studio', 'event photography', 'corporate photography', 'maternity shoot'],
    primarySubcategorySlugs: ['photography'],
    relatedSubcategorySlugs: [],
    primaryPhrases: ['photography', 'photographer', 'photo shoot', 'candid shoot'],
    synonymPhrases: ['videography', 'cameraman', 'cinematography', 'photo studio'],
    requiredAnyStems: ['photograph', 'videograph', 'cinematograph', 'candid', 'camera'],
    boostTokens: ['photograph', 'videograph', 'candid', 'studio'],
  },
  {
    id: 'event-management',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['event manager', 'event management', 'event organizer', 'event organiser', 'event planner', 'event coordinator', 'corporate event', 'corporate events'],
    primarySubcategorySlugs: [], // Exact event management lives in services/keywords/description/ProviderService
    relatedSubcategorySlugs: ['wedding-planning', 'event-decoration'],
    primaryPhrases: ['event management', 'event manager', 'event planner', 'event organizer', 'event organiser', 'event coordinator', 'corporate event'],
    synonymPhrases: ['wedding planning', 'wedding planner', 'event production', 'event curation'],
    requiredAnyStems: null,
    boostTokens: ['event', 'manag', 'plan', 'organiz', 'coordinat', 'wedding'],
  },
  {
    id: 'wedding-planning',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['wedding planner', 'wedding planning', 'destination wedding', 'shaadi planner', 'marriage planner', 'bridal planner'],
    primarySubcategorySlugs: ['wedding-planning'],
    relatedSubcategorySlugs: ['event-decoration'],
    primaryPhrases: ['wedding planning', 'wedding planner', 'destination wedding', 'wedding management'],
    synonymPhrases: ['event management', 'event planner', 'event coordinator', 'marriage planner', 'shaadi planner'],
    requiredAnyStems: null,
    boostTokens: ['wedding', 'plan', 'event', 'manag'],
  },
  {
    id: 'event-decoration',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['event decoration', 'event decorator', 'wedding decor', 'stage decor', 'floral decor', 'flower decoration', 'mandap decor'],
    primarySubcategorySlugs: ['event-decoration'],
    relatedSubcategorySlugs: ['wedding-planning'],
    primaryPhrases: ['event decoration', 'event decorator', 'stage decor', 'floral decor', 'wedding decor'],
    synonymPhrases: ['theme decor', 'mandap decoration', 'lighting decoration'],
    requiredAnyStems: ['decor', 'floral', 'mandap', 'stage'],
    boostTokens: ['decor', 'event', 'stage', 'floral'],
  },
  {
    id: 'catering-entertainment',
    mainCategorySlug: 'events-lifestyle',
    triggers: ['catering', 'caterer', 'wedding catering', 'dj', 'artist management', 'event entertainment'],
    primarySubcategorySlugs: [],
    relatedSubcategorySlugs: ['wedding-planning'],
    primaryPhrases: ['catering', 'caterer', 'dj', 'artist management'],
    synonymPhrases: ['event catering', 'wedding catering', 'entertainment'],
    requiredAnyStems: ['cater', 'dj', 'entertain', 'artist', 'food'],
    boostTokens: ['cater', 'dj', 'entertain'],
  },
  {
    id: 'interior-design',
    mainCategorySlug: 'home-construction',
    triggers: ['interior designer', 'interior design', 'home interior', 'modular kitchen', 'office interior', 'interior decorator'],
    primarySubcategorySlugs: ['interior-design'],
    relatedSubcategorySlugs: ['home-renovation'],
    primaryPhrases: ['interior design', 'interior designer', 'modular kitchen', 'home interior', 'office interior'],
    synonymPhrases: ['interior architecture', 'interior decorator', 'turnkey interior', 'space planning'],
    requiredAnyStems: ['interior', 'modular', 'architect', 'decor'],
    boostTokens: ['interior', 'design', 'modular', 'kitchen'],
  },
  {
    id: 'home-renovation',
    mainCategorySlug: 'home-construction',
    triggers: ['home renovation', 'house renovation', 'remodeling', 'remodelling', 'kitchen remodeling', 'bathroom renovation', 'waterproofing'],
    primarySubcategorySlugs: ['home-renovation'],
    relatedSubcategorySlugs: ['construction', 'interior-design', 'painting'],
    primaryPhrases: ['home renovation', 'house renovation', 'remodeling', 'bathroom remodeling'],
    synonymPhrases: ['civil renovation', 'waterproofing', 'home revamp', 'repair'],
    requiredAnyStems: null,
    boostTokens: ['renovat', 'remodel', 'civil', 'waterproof'],
  },
  {
    id: 'construction',
    mainCategorySlug: 'home-construction',
    triggers: ['construction', 'building contractor', 'civil contractor', 'house construction', 'builder'],
    primarySubcategorySlugs: ['construction'],
    relatedSubcategorySlugs: ['home-renovation'],
    primaryPhrases: ['construction', 'civil construction', 'building contractor', 'civil contractor'],
    synonymPhrases: ['turnkey construction', 'structural contractor', 'builder'],
    requiredAnyStems: null,
    boostTokens: ['construct', 'civil', 'contract', 'build'],
  },
  {
    id: 'painting',
    mainCategorySlug: 'home-construction',
    triggers: ['painter', 'painting', 'house painting', 'wall painting', 'waterproof painting'],
    primarySubcategorySlugs: ['painting'],
    relatedSubcategorySlugs: [],
    primaryPhrases: ['painting', 'house painting', 'wall painting', 'painter'],
    synonymPhrases: ['texture painting', 'decorative painting', 'exterior painting'],
    requiredAnyStems: ['paint'],
    boostTokens: ['paint'],
  },
  {
    id: 'plumbing',
    mainCategorySlug: 'home-construction',
    triggers: ['plumber', 'plumbing', 'pipe repair', 'sanitary fittings'],
    primarySubcategorySlugs: ['plumbing'],
    relatedSubcategorySlugs: [],
    primaryPhrases: ['plumbing', 'plumber', 'pipeline maintenance'],
    synonymPhrases: ['sanitary fittings', 'leak repair'],
    requiredAnyStems: ['plumb', 'pipe', 'sanitary'],
    boostTokens: ['plumb'],
  },
  {
    id: 'website-development',
    mainCategorySlug: 'digital-professional',
    triggers: ['website developer', 'website development', 'web developer', 'web development', 'web design', 'ecommerce website', 'shopify developer', 'wordpress developer', 'react developer'],
    primarySubcategorySlugs: ['website-development'],
    relatedSubcategorySlugs: ['software-development'],
    primaryPhrases: ['website development', 'website developer', 'web developer', 'web development', 'web design'],
    synonymPhrases: ['ecommerce store', 'landing page', 'web portal', 'web app', 'shopify', 'react', 'wordpress'],
    requiredAnyStems: ['website', 'web', 'shopify', 'wordpress', 'ecommerce', 'frontend', 'fullstack'],
    boostTokens: ['website', 'web', 'develop', 'design'],
  },
  {
    id: 'software-development',
    mainCategorySlug: 'digital-professional',
    triggers: ['software developer', 'software development', 'app developer', 'mobile app development', 'saas development', 'custom software'],
    primarySubcategorySlugs: ['software-development'],
    relatedSubcategorySlugs: ['website-development'],
    primaryPhrases: ['software development', 'software developer', 'mobile app development', 'app developer'],
    synonymPhrases: ['saas', 'backend engineering', 'custom software', 'android app', 'ios app'],
    requiredAnyStems: ['software', 'app', 'saas', 'backend', 'mobile'],
    boostTokens: ['software', 'app', 'develop'],
  },
  {
    id: 'digital-marketing',
    mainCategorySlug: 'digital-professional',
    triggers: ['digital marketing', 'seo', 'social media marketing', 'performance marketing', 'google ads', 'meta ads', 'smm'],
    primarySubcategorySlugs: ['digital-marketing'],
    relatedSubcategorySlugs: [],
    primaryPhrases: ['digital marketing', 'seo optimization', 'performance marketing', 'social media marketing'],
    synonymPhrases: ['seo', 'google ads', 'meta ads', 'lead generation', 'brand growth'],
    requiredAnyStems: ['market', 'seo', 'ads', 'smm', 'social', 'growth'],
    boostTokens: ['market', 'seo', 'digital'],
  },
  {
    id: 'professional-services',
    mainCategorySlug: 'digital-professional',
    triggers: ['legal drafting', 'trademark', 'recruitment', 'management consulting', 'professional services'],
    primarySubcategorySlugs: ['professional-services'],
    relatedSubcategorySlugs: ['business-services'],
    primaryPhrases: ['professional services', 'legal drafting', 'trademark filing', 'recruitment'],
    synonymPhrases: ['management consulting', 'hr consulting', 'ip filing'],
    requiredAnyStems: null,
    boostTokens: ['legal', 'trademark', 'recruit', 'consult'],
  },
  {
    id: 'commercial-property',
    mainCategorySlug: 'business-property',
    triggers: ['commercial property', 'office space', 'coworking', 'co-working', 'commercial leasing', 'retail shop'],
    primarySubcategorySlugs: ['commercial-property'],
    relatedSubcategorySlugs: ['property-services'],
    primaryPhrases: ['commercial property', 'office space', 'commercial leasing', 'co-working'],
    synonymPhrases: ['retail space', 'commercial real estate', 'coworking'],
    requiredAnyStems: ['property', 'office', 'commercial', 'cowork', 'leas', 'retail'],
    boostTokens: ['commercial', 'property', 'office'],
  },
  {
    id: 'property-services',
    mainCategorySlug: 'business-property',
    triggers: ['property verification', 'property valuation', 'property advisory', 'property services', 'real estate consultant'],
    primarySubcategorySlugs: ['property-services'],
    relatedSubcategorySlugs: ['commercial-property'],
    primaryPhrases: ['property services', 'property verification', 'property valuation', 'property advisory'],
    synonymPhrases: ['real estate advisory', 'title verification', 'property documentation'],
    requiredAnyStems: ['property', 'real', 'valuation', 'title'],
    boostTokens: ['property', 'verif', 'advis'],
  },
  {
    id: 'business-services',
    mainCategorySlug: 'business-property',
    triggers: ['business services', 'company registration', 'company incorporation', 'gst', 'accounting', 'chartered accountant', 'ca', 'compliance'],
    primarySubcategorySlugs: ['business-services'],
    relatedSubcategorySlugs: ['professional-services'],
    primaryPhrases: ['business services', 'company incorporation', 'gst accounting', 'business registration'],
    synonymPhrases: ['ca', 'cs', 'compliance', 'tax advisory', 'chartered accountant'],
    requiredAnyStems: null,
    boostTokens: ['business', 'account', 'gst', 'incorporat', 'registr'],
  },
  {
    id: 'training-education',
    mainCategorySlug: 'education-career',
    triggers: ['training', 'career guidance', 'internship', 'internships', 'educational services', 'coaching', 'mentorship', 'study abroad'],
    primarySubcategorySlugs: ['training', 'career-guidance', 'internships', 'educational-services'],
    relatedSubcategorySlugs: [],
    primaryPhrases: ['career guidance', 'digital skills training', 'internship programs', 'educational services'],
    synonymPhrases: ['mentorship', 'counselling', 'coaching', 'bootcamp', 'study abroad'],
    requiredAnyStems: null,
    boostTokens: ['train', 'career', 'intern', 'educat', 'mentor', 'coach'],
  },
];

/**
 * Curated vocabulary for bounded typo correction (Damerau-Levenshtein)
 */
const VOCAB_WORDS = new Set([
  // Service words
  'event', 'events', 'manager', 'managers', 'management', 'planner', 'planners', 'planning',
  'organizer', 'organiser', 'coordinator', 'wedding', 'weddings', 'photographer', 'photographers',
  'photography', 'candid', 'videographer', 'videography', 'prewedding', 'bridal', 'decoration',
  'decorator', 'decor', 'catering', 'caterer', 'lifestyle', 'interior', 'interiors', 'designer',
  'designers', 'design', 'modular', 'kitchen', 'renovation', 'remodeling', 'construction',
  'contractor', 'painting', 'painter', 'plumbing', 'plumber', 'commercial', 'property',
  'office', 'coworking', 'business', 'accounting', 'incorporation', 'compliance', 'website',
  'websites', 'developer', 'developers', 'development', 'software', 'mobile', 'digital',
  'marketing', 'seo', 'performance', 'legal', 'trademark', 'recruitment', 'consulting',
  'training', 'internship', 'internships', 'career', 'guidance', 'mentorship', 'coaching',
  'education', 'educational', 'studio', 'corporate', 'destination', 'architecture', 'architect',
  // City names & aliases
  ...LOCATION_CATALOG.flatMap((c) => c.aliases.flatMap((a) => a.split(' '))),
]);

export const SEARCH_VOCABULARY = Array.from(VOCAB_WORDS).filter((w) => w.length >= 3);

/**
 * Compute optimal string alignment (restricted Damerau-Levenshtein) distance
 * with early exit when exceeding maxDist.
 */
export function damerauLevenshtein(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (a === b) return 0;

  const d = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) d[i][0] = i;
  for (let j = 0; j <= lenB; j++) d[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d[i - 2][j - 2] + cost);
      }
      d[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }

  return d[lenA][lenB];
}

/**
 * Finds closest dictionary correction for a single misspelled token.
 */
export function correctTokenTypo(token) {
  const clean = String(token || '').toLowerCase().trim();
  if (clean.length < 4 || VOCAB_WORDS.has(clean)) {
    return { token: clean, corrected: false };
  }

  const maxDist = clean.length >= 7 ? 2 : 1;
  let bestWord = clean;
  let bestDist = maxDist + 1;

  for (const candidate of SEARCH_VOCABULARY) {
    if (Math.abs(candidate.length - clean.length) > maxDist) continue;
    // Require first character match for short tokens to prevent false positives
    if (clean.length <= 5 && candidate[0] !== clean[0]) continue;

    const dist = damerauLevenshtein(clean, candidate, maxDist);
    if (dist < bestDist) {
      bestDist = dist;
      bestWord = candidate;
      if (bestDist === 1 && clean.length <= 5) break;
    }
  }

  return {
    token: bestWord,
    corrected: bestWord !== clean,
  };
}

/**
 * Builds precomputed searchTokens array for a Provider document.
 */
export function buildProviderSearchTokens(doc = {}) {
  const parts = [
    doc.businessName,
    doc.providerName,
    doc.category,
    doc.categorySlug,
    doc.subcategory,
    doc.subcategorySlug,
    ...(Array.isArray(doc.services) ? doc.services : []),
    ...(Array.isArray(doc.keywords) ? doc.keywords : []),
    doc.description,
    doc.metaTitle,
    doc.metaDescription,
  ];
  const tokens = new Set();
  for (const part of parts) {
    if (!part) continue;
    for (const tok of tokenizeAndStem(part)) {
      tokens.add(tok);
    }
  }
  return Array.from(tokens).slice(0, 120);
}

/**
 * Builds precomputed locationTokens array for a Provider document.
 */
export function buildProviderLocationTokens(doc = {}) {
  const tokens = new Set();
  const rawFields = [
    doc.city,
    doc.state,
    doc.pinCode,
    ...(Array.isArray(doc.serviceAreas) ? doc.serviceAreas : []),
  ];

  for (const val of rawFields) {
    if (!val) continue;
    const norm = normalizeText(val);
    if (!norm) continue;
    tokens.add(norm);
    for (const part of norm.split(' ')) {
      if (part.length >= 2) tokens.add(part);
    }
    // Also index canonical alias if this city matches a known alias
    for (const { alias, entry } of LOCATION_ALIAS_ENTRIES) {
      if (norm === alias || norm.includes(alias)) {
        tokens.add(entry.canonical);
      }
    }
  }

  return Array.from(tokens).slice(0, 60);
}

/**
 * Builds precomputed searchTokens array for a ProviderService document.
 */
export function buildServiceSearchTokens(doc = {}) {
  const parts = [
    doc.title,
    doc.category,
    doc.categorySlug,
    doc.subcategory,
    doc.subcategorySlug,
    ...(Array.isArray(doc.deliverables) ? doc.deliverables : []),
    ...(Array.isArray(doc.keywords) ? doc.keywords : []),
    doc.shortDescription,
    doc.description,
  ];
  const tokens = new Set();
  for (const part of parts) {
    if (!part) continue;
    for (const tok of tokenizeAndStem(part)) {
      tokens.add(tok);
    }
  }
  return Array.from(tokens).slice(0, 100);
}

export default {
  CANONICAL_MAIN_CATEGORY_SLUGS,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_QUERY_TOKENS,
  LOCATION_CATALOG,
  LOCATION_ALIAS_ENTRIES,
  SERVICE_INTENT_RULES,
  SEARCH_VOCABULARY,
  normalizeText,
  stemToken,
  tokenizeRaw,
  tokenizeAndStem,
  normalizeKeywords,
  damerauLevenshtein,
  correctTokenTypo,
  buildProviderSearchTokens,
  buildProviderLocationTokens,
  buildServiceSearchTokens,
};
