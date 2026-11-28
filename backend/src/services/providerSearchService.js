import mongoose from 'mongoose';
import Provider from '../models/Provider.js';
import ProviderService from '../models/ProviderService.js';
import Category from '../models/Category.js';
import categoryService, { createSlug, escapeRegex } from './categoryService.js';
import {
  PUBLIC_PROVIDER_SEARCH_PROJECTION,
  applyPublicProjection,
  toPublicProviderDto,
  toPublicProviderSuggestionDto,
} from '../utils/publicProviderDto.js';
import {
  MAX_QUERY_LENGTH,
  MAX_QUERY_TOKENS,
  LOCATION_CATALOG,
  LOCATION_ALIAS_ENTRIES,
  SERVICE_INTENT_RULES,
  normalizeText,
  stemToken,
  tokenizeRaw,
  tokenizeAndStem,
  correctTokenTypo,
} from '../config/searchDictionary.js';

const BASE_PROVIDER_GATE = {
  isDeleted: { $ne: true },
  verificationStatus: 'VERIFIED',
  publicationStatus: 'PUBLISHED',
};

const BASE_SERVICE_GATE = {
  isDeleted: { $ne: true },
  isActive: true,
  approvalStatus: 'APPROVED',
  publicationStatus: 'PUBLISHED',
};

const LOCATION_CONNECTORS = new Set(['in', 'at', 'near', 'around', 'from']);

function resolveLocationEntry(rawLoc) {
  const norm = normalizeText(rawLoc);
  if (!norm) return null;

  for (const { alias, entry } of LOCATION_ALIAS_ENTRIES) {
    if (norm === alias) {
      return { raw: rawLoc, norm, entry, corrected: false };
    }
  }

  // Try typo correction per word (e.g. "Delhii" -> "Delhi", "Haldiya" -> "Haldia")
  const words = norm.split(' ').filter(Boolean);
  let anyCorrected = false;
  const fixedWords = words.map((w) => {
    const res = correctTokenTypo(w);
    if (res.corrected) anyCorrected = true;
    return res.token;
  });
  const fixedNorm = fixedWords.join(' ');

  if (anyCorrected) {
    for (const { alias, entry } of LOCATION_ALIAS_ENTRIES) {
      if (fixedNorm === alias) {
        return { raw: rawLoc, norm: fixedNorm, entry, corrected: true };
      }
    }
  }

  return {
    raw: rawLoc,
    norm: fixedNorm,
    entry: {
      canonical: fixedNorm,
      display: rawLoc.trim(),
      aliases: [fixedNorm],
      nearbyRegion: [],
    },
    corrected: anyCorrected,
  };
}

/**
 * Extracts embedded location from combined queries like:
 * - "Event Manager Delhi" -> service: "Event Manager", location: "Delhi"
 * - "Wedding Photographer in New Delhi" -> service: "Wedding Photographer", location: "New Delhi"
 * - "Delhi" -> service: "", location: "Delhi"
 */
export function parseSearchQuery({ search = '', service = '', q = '', location = '', city = '' } = {}) {
  const rawSearch = String(search || service || q || '').trim().slice(0, MAX_QUERY_LENGTH);
  const explicitLoc = String(location || city || '').trim().slice(0, 100);

  let workingSearch = normalizeText(rawSearch);
  let extractedLocation = null;
  let correctedTokens = [];
  let anyTypoCorrected = false;

  if (workingSearch) {
    const rawWords = workingSearch.split(' ').filter(Boolean).slice(0, 12);
    const fixedWords = rawWords.map((w) => {
      if (LOCATION_CONNECTORS.has(w)) return w;
      const fix = correctTokenTypo(w);
      if (fix.corrected) anyTypoCorrected = true;
      return fix.token;
    });
    correctedTokens = fixedWords;
    workingSearch = fixedWords.join(' ');
  }

  // Extract location from query only if explicit location wasn't already given
  let serviceText = workingSearch;
  if (!explicitLoc && workingSearch) {
    for (const { alias, entry } of LOCATION_ALIAS_ENTRIES) {
      const escapedAlias = escapeRegex(alias);
      // Match trailing "(in|at|near)? <alias>" or leading "<alias>" or standalone "<alias>"
      const trailingRegex = new RegExp(`(?:\\s+(?:in|at|near|around))?\\s+${escapedAlias}$`, 'i');
      const exactRegex = new RegExp(`^${escapedAlias}$`, 'i');
      const leadingRegex = new RegExp(`^${escapedAlias}\\s+`, 'i');

      if (exactRegex.test(workingSearch)) {
        extractedLocation = entry.display;
        serviceText = '';
        break;
      }
      if (trailingRegex.test(workingSearch)) {
        extractedLocation = entry.display;
        serviceText = workingSearch.replace(trailingRegex, '').trim();
        break;
      }
      if (leadingRegex.test(workingSearch)) {
        extractedLocation = entry.display;
        serviceText = workingSearch.replace(leadingRegex, '').trim();
        break;
      }
    }
  }

  // Strip lingering trailing connector if location extracted
  if (serviceText) {
    const cleanedWords = serviceText
      .split(' ')
      .filter((w) => w && !LOCATION_CONNECTORS.has(w));
    serviceText = cleanedWords.join(' ').trim();
  }

  const finalLocationStr = explicitLoc || extractedLocation || '';
  const locationInfo = finalLocationStr ? resolveLocationEntry(finalLocationStr) : null;

  const serviceTokensRaw = tokenizeRaw(serviceText).slice(0, MAX_QUERY_TOKENS);
  const serviceStems = Array.from(new Set(serviceTokensRaw.map(stemToken).filter(Boolean)));

  const correctedQuery =
    anyTypoCorrected && correctedTokens.length > 0 ? correctedTokens.join(' ') : null;

  return {
    rawSearch,
    explicitLocation: explicitLoc,
    extractedLocation,
    locationInfo,
    serviceText,
    serviceTokensRaw,
    serviceStems,
    correctedQuery,
  };
}

/**
 * Matches parsed service query against curated intent/synonym/controlled-expansion rules.
 */
export function analyzeServiceIntent(parsed) {
  const { serviceText, serviceTokensRaw, serviceStems } = parsed;
  if (!serviceText) {
    return {
      matchedRules: [],
      primarySubcategorySlugs: new Set(),
      relatedSubcategorySlugs: new Set(),
      primaryPhrases: [],
      synonymPhrases: [],
      requiredAnyStems: null,
      expansionTokens: new Set(),
    };
  }

  const matchedRules = [];
  for (const rule of SERVICE_INTENT_RULES) {
    let bestTriggerScore = 0;
    for (const trigger of rule.triggers) {
      const normTrig = normalizeText(trigger);
      if (serviceText === normTrig) {
        bestTriggerScore = Math.max(bestTriggerScore, 100 + normTrig.length);
      } else if (serviceText.includes(normTrig)) {
        bestTriggerScore = Math.max(bestTriggerScore, 70 + normTrig.length);
      } else {
        const trigStems = tokenizeAndStem(normTrig);
        const overlap = trigStems.filter((s) => serviceStems.includes(s)).length;
        if (overlap > 0 && overlap === trigStems.length) {
          bestTriggerScore = Math.max(bestTriggerScore, 55 + trigStems.length);
        }
      }
    }
    if (bestTriggerScore > 0) {
      matchedRules.push({ rule, triggerScore: bestTriggerScore });
    }
  }

  matchedRules.sort((a, b) => b.triggerScore - a.triggerScore);

  const primarySubcategorySlugs = new Set();
  const relatedSubcategorySlugs = new Set();
  const primaryPhrases = new Set();
  const synonymPhrases = new Set();
  const expansionTokens = new Set([...serviceTokensRaw, ...serviceStems]);
  let requiredAnyStems = null;

  if (matchedRules.length > 0) {
    // Use top-matching rule's strictness and controlled expansions
    const topRule = matchedRules[0].rule;
    if (Array.isArray(topRule.requiredAnyStems) && topRule.requiredAnyStems.length > 0) {
      requiredAnyStems = new Set(topRule.requiredAnyStems);
    }

    // Apply all tied/co-matching high-confidence rules
    const topScore = matchedRules[0].triggerScore;
    for (const { rule, triggerScore } of matchedRules) {
      if (triggerScore < topScore - 25) continue;
      for (const s of rule.primarySubcategorySlugs || []) primarySubcategorySlugs.add(s);
      for (const s of rule.relatedSubcategorySlugs || []) {
        if (!primarySubcategorySlugs.has(s)) relatedSubcategorySlugs.add(s);
      }
      for (const p of rule.primaryPhrases || []) {
        primaryPhrases.add(normalizeText(p));
        for (const t of tokenizeAndStem(p)) expansionTokens.add(t);
      }
      for (const p of rule.synonymPhrases || []) {
        synonymPhrases.add(normalizeText(p));
        for (const t of tokenizeAndStem(p)) expansionTokens.add(t);
      }
      for (const t of rule.boostTokens || []) expansionTokens.add(t);
    }
  }

  return {
    matchedRules: matchedRules.map((m) => m.rule),
    primarySubcategorySlugs,
    relatedSubcategorySlugs,
    primaryPhrases: Array.from(primaryPhrases),
    synonymPhrases: Array.from(synonymPhrases),
    requiredAnyStems,
    expansionTokens,
  };
}

/**
 * Evaluates how well a provider + their approved/published services match a requested location.
 * Strictly separates:
 * - exact_city (Tier 4)
 * - service_area (Tier 3)
 * - state (Tier 2)
 * - nearby_region (Tier 1 - never mixed silently with exact city/service area)
 */
export function evaluateLocationMatch(provider, providerServices = [], locationInfo) {
  if (!locationInfo) {
    return { matched: true, tier: 'none', tierRank: 0, score: 0, matchedValue: null };
  }

  const { norm, entry } = locationInfo;
  const aliases = entry?.aliases || [norm];
  const nearby = entry?.nearbyRegion || [];

  const cityNorm = normalizeText(provider.city);
  const stateNorm = normalizeText(provider.state);
  const addressNorm = normalizeText(provider.address);
  const pinNorm = normalizeText(provider.pinCode);

  const areaNorms = new Set();
  for (const area of provider.serviceAreas || []) {
    const aNorm = normalizeText(area);
    if (aNorm) areaNorms.add(aNorm);
  }
  for (const svc of providerServices) {
    for (const area of svc.serviceAreas || []) {
      const aNorm = normalizeText(area);
      if (aNorm) areaNorms.add(aNorm);
    }
  }

  // 1. Exact city or city alias (e.g. "New Delhi" <-> "Delhi", "Bangalore" <-> "Bengaluru")
  if (cityNorm && (cityNorm === norm || aliases.includes(cityNorm))) {
    return { matched: true, tier: 'exact_city', tierRank: 4, score: 35, matchedValue: provider.city };
  }

  // Exact PIN code match
  if (pinNorm && pinNorm === norm) {
    return { matched: true, tier: 'exact_city', tierRank: 4, score: 35, matchedValue: provider.pinCode };
  }

  // 2. Service Area / Locality match (e.g. "South Delhi", "Delhi NCR", or city substring in serviceAreas)
  for (const area of areaNorms) {
    if (
      area === norm ||
      aliases.some((a) => area === a || area.split(' ').includes(a) || area.includes(a))
    ) {
      return { matched: true, tier: 'service_area', tierRank: 3, score: 25, matchedValue: area };
    }
  }

  // Address locality substring match
  if (addressNorm && aliases.some((a) => a.length >= 4 && addressNorm.includes(a))) {
    return { matched: true, tier: 'service_area', tierRank: 3, score: 22, matchedValue: provider.city };
  }

  // Partial city prefix/substring (e.g. "Delhi" matching "New Delhi" if not already caught)
  if (cityNorm && aliases.some((a) => a.length >= 4 && cityNorm.includes(a))) {
    return { matched: true, tier: 'exact_city', tierRank: 4, score: 32, matchedValue: provider.city };
  }

  // 3. State match
  if (stateNorm && (stateNorm === norm || aliases.includes(stateNorm))) {
    return { matched: true, tier: 'state', tierRank: 2, score: 15, matchedValue: provider.state };
  }

  // 4. Nearby-region match (strictly tracked separately, never conflated with exact city)
  if (nearby.length > 0) {
    if (cityNorm && nearby.some((n) => cityNorm === n || cityNorm.includes(n))) {
      return { matched: false, isNearby: true, tier: 'nearby_region', tierRank: 1, score: 8, matchedValue: provider.city };
    }
    for (const area of areaNorms) {
      if (nearby.some((n) => area === n || area.includes(n))) {
        return { matched: false, isNearby: true, tier: 'nearby_region', tierRank: 1, score: 8, matchedValue: area };
      }
    }
  }

  return { matched: false, isNearby: false, tier: 'mismatch', tierRank: 0, score: 0, matchedValue: null };
}

function fieldContainsPhrase(text, phrase) {
  if (!text || !phrase) return false;
  const normText = normalizeText(text);
  return normText === phrase || normText.includes(phrase);
}

function countStemMatches(text, targetStems) {
  if (!text || targetStems.length === 0) return { count: 0, matchedStems: [] };
  const docStems = new Set(tokenizeAndStem(text));
  const matchedStems = targetStems.filter((s) => docStems.has(s));
  return { count: matchedStems.length, matchedStems };
}

function hasPrefixMatch(text, rawTokens) {
  if (!text || rawTokens.length === 0) return false;
  const words = normalizeText(text).split(' ').filter(Boolean);
  return rawTokens.some((tok) => tok.length >= 3 && words.some((w) => w.startsWith(tok)));
}

/**
 * Computes weighted relevance score for a single eligible Provider + their eligible ProviderServices.
 * Returns { score, matchType, matchedServices, matchedTerms, disqualified }.
 */
export function scoreProviderRelevance(provider, providerServices, parsed, intent, locationEval) {
  const { serviceText, serviceTokensRaw, serviceStems } = parsed;

  // Browse mode (no service text query)
  if (!serviceText) {
    const qualityScore = (provider.shopImage?.url ? 3 : 0) + ((provider.experienceYears || 0) >= 3 ? 2 : 0);
    return {
      score: locationEval.score + qualityScore,
      matchType: 'browse',
      matchedServices: [],
      matchedTerms: [],
      disqualified: false,
    };
  }

  const allServicesText = [
    ...(Array.isArray(provider.services) ? provider.services : []),
    ...providerServices.map((s) => s.title),
  ];

  // Gather all stems present across eligible profile + eligible service packages
  const combinedTextParts = [
    provider.businessName,
    provider.providerName,
    provider.subcategory,
    provider.subcategorySlug,
    ...(provider.services || []),
    ...(provider.keywords || []),
    provider.description,
    ...providerServices.flatMap((s) => [
      s.title,
      s.subcategory,
      s.subcategorySlug,
      ...(s.deliverables || []),
      ...(s.keywords || []),
      s.shortDescription,
      s.description,
    ]),
  ];
  const combinedStems = new Set(tokenizeAndStem(combinedTextParts.filter(Boolean).join(' ')));
  if (provider.subcategorySlug) {
    for (const st of tokenizeAndStem(provider.subcategorySlug)) combinedStems.add(st);
  }

  // Head-noun precision gate (e.g. "Wedding Photographer" requires photography stem/subcategory)
  if (intent.requiredAnyStems) {
    const hasRequiredStem = Array.from(intent.requiredAnyStems).some((reqStem) =>
      combinedStems.has(reqStem)
    );
    const inPrimarySub = intent.primarySubcategorySlugs.has(
      String(provider.subcategorySlug || '').toLowerCase()
    );
    const hasServiceInPrimarySub = providerServices.some((s) =>
      intent.primarySubcategorySlugs.has(String(s.subcategorySlug || '').toLowerCase())
    );
    if (!hasRequiredStem && !inPrimarySub && !hasServiceInPrimarySub) {
      return { score: 0, matchType: 'disqualified', matchedServices: [], matchedTerms: [], disqualified: true };
    }
  }

  let serviceScore = 0;
  let matchType = 'none';
  const matchedTerms = new Set();
  const matchedServiceTitles = new Set();
  const coveredQueryStems = new Set();

  const markMatchedStems = (stems) => {
    for (const s of stems) coveredQueryStems.add(s);
  };

  // 1. Business Name
  if (fieldContainsPhrase(provider.businessName, serviceText)) {
    serviceScore += 55;
    matchType = 'exact';
    matchedTerms.add('businessName');
    serviceStems.forEach((s) => coveredQueryStems.add(s));
  } else {
    const { count, matchedStems } = countStemMatches(provider.businessName, serviceStems);
    if (count > 0) {
      serviceScore += Math.min(44, count * 22);
      markMatchedStems(matchedStems);
      matchedTerms.add('businessName');
      matchType = matchType === 'none' ? 'token' : matchType;
    } else if (hasPrefixMatch(provider.businessName, serviceTokensRaw)) {
      serviceScore += 12;
      matchedTerms.add('businessName');
      matchType = matchType === 'none' ? 'partial' : matchType;
    }
  }

  // 2. Provider Subcategory (exact or primary intent subcategory)
  const provSubSlug = String(provider.subcategorySlug || createSlug(provider.subcategory || '')).toLowerCase();
  const provSubName = normalizeText(provider.subcategory);
  if (
    (provSubName && (provSubName === serviceText || provSubName.includes(serviceText))) ||
    (provSubSlug && intent.primarySubcategorySlugs.has(provSubSlug))
  ) {
    serviceScore += 50;
    matchType = 'exact';
    matchedTerms.add('subcategory');
    if (provSubName) {
      const { matchedStems } = countStemMatches(provSubName, serviceStems);
      markMatchedStems(matchedStems);
    }
  } else if (provSubName) {
    const { count, matchedStems } = countStemMatches(provSubName, serviceStems);
    if (count > 0) {
      serviceScore += Math.min(36, count * 18);
      markMatchedStems(matchedStems);
      matchedTerms.add('subcategory');
      if (matchType === 'none') matchType = 'token';
    }
  }

  // Controlled related-service subcategory expansion (strictly lower weight than exact!)
  if (provSubSlug && intent.relatedSubcategorySlugs.has(provSubSlug)) {
    serviceScore += 18;
    matchedTerms.add('relatedSubcategory');
    if (matchType === 'none') matchType = 'related';
  }

  // 3. Provider.services[] array
  for (const svcItem of provider.services || []) {
    if (fieldContainsPhrase(svcItem, serviceText)) {
      serviceScore += 48;
      matchType = 'exact';
      matchedTerms.add('services');
      matchedServiceTitles.add(svcItem);
      serviceStems.forEach((s) => coveredQueryStems.add(s));
      break;
    }
    const { count, matchedStems } = countStemMatches(svcItem, serviceStems);
    if (count > 0) {
      const fullCoverage = count === serviceStems.length && serviceStems.length > 0;
      serviceScore += fullCoverage ? 38 : Math.min(30, count * 16);
      markMatchedStems(matchedStems);
      matchedTerms.add('services');
      matchedServiceTitles.add(svcItem);
      if (matchType !== 'exact') matchType = fullCoverage ? 'exact' : 'token';
    } else if (hasPrefixMatch(svcItem, serviceTokensRaw)) {
      serviceScore += 12;
      matchedTerms.add('services');
      matchedServiceTitles.add(svcItem);
      if (matchType === 'none') matchType = 'partial';
    }
  }

  // 4. Provider.keywords[]
  for (const kw of provider.keywords || []) {
    if (fieldContainsPhrase(kw, serviceText)) {
      serviceScore += 38;
      matchedTerms.add('keywords');
      if (matchType !== 'exact') matchType = 'exact';
      serviceStems.forEach((s) => coveredQueryStems.add(s));
      break;
    }
    const { count, matchedStems } = countStemMatches(kw, serviceStems);
    if (count > 0) {
      serviceScore += Math.min(28, count * 14);
      markMatchedStems(matchedStems);
      matchedTerms.add('keywords');
      if (matchType === 'none') matchType = 'token';
    }
  }

  // 5. Approved & Published ProviderService packages
  let bestPkgScore = 0;
  for (const pkg of providerServices) {
    let pkgScore = 0;
    const pkgSubSlug = String(pkg.subcategorySlug || createSlug(pkg.subcategory || '')).toLowerCase();

    if (fieldContainsPhrase(pkg.title, serviceText)) {
      pkgScore += 48;
      matchType = 'exact';
      serviceStems.forEach((s) => coveredQueryStems.add(s));
    } else {
      const { count, matchedStems } = countStemMatches(pkg.title, serviceStems);
      if (count > 0) {
        const fullCoverage = count === serviceStems.length && serviceStems.length > 0;
        pkgScore += fullCoverage ? 38 : Math.min(28, count * 15);
        markMatchedStems(matchedStems);
        if (matchType !== 'exact') matchType = fullCoverage ? 'exact' : 'token';
      } else if (hasPrefixMatch(pkg.title, serviceTokensRaw)) {
        pkgScore += 12;
        if (matchType === 'none') matchType = 'partial';
      }
    }

    if (pkgSubSlug && intent.primarySubcategorySlugs.has(pkgSubSlug)) {
      pkgScore += 30;
      if (matchType === 'none') matchType = 'token';
    } else if (pkgSubSlug && intent.relatedSubcategorySlugs.has(pkgSubSlug)) {
      pkgScore += 14;
      if (matchType === 'none') matchType = 'related';
    }

    const deliverablesText = (pkg.deliverables || []).join(' ');
    const { count: delivCount, matchedStems: delivStems } = countStemMatches(deliverablesText, serviceStems);
    if (delivCount > 0) {
      pkgScore += Math.min(24, delivCount * 12);
      markMatchedStems(delivStems);
      if (matchType === 'none') matchType = 'token';
    }

    const pkgKeywordsText = (pkg.keywords || []).join(' ');
    const { count: kwCount, matchedStems: kwStems } = countStemMatches(pkgKeywordsText, serviceStems);
    if (kwCount > 0) {
      pkgScore += Math.min(22, kwCount * 11);
      markMatchedStems(kwStems);
    }

    const pkgDesc = `${pkg.shortDescription || ''} ${pkg.description || ''}`;
    if (fieldContainsPhrase(pkgDesc, serviceText)) {
      pkgScore += 14;
    } else {
      const { count: pDescCount, matchedStems: pDescStems } = countStemMatches(pkgDesc, serviceStems);
      if (pDescCount > 0) {
        pkgScore += Math.min(14, pDescCount * 6);
        markMatchedStems(pDescStems);
        if (matchType === 'none') matchType = 'token';
      }
    }

    if (pkgScore > 0) {
      matchedServiceTitles.add(pkg.title);
      matchedTerms.add('providerServices');
      if (pkgScore > bestPkgScore) bestPkgScore = pkgScore;
    }
  }
  serviceScore += bestPkgScore;

  // 6. Synonym / Intent Phrase Matching (e.g. "event management" for "event manager")
  const primaryMatchTexts = [
    provider.businessName,
    provider.subcategory,
    ...allServicesText,
    ...(provider.keywords || []),
    ...providerServices.flatMap((s) => s.deliverables || []),
  ].filter(Boolean);

  let matchedPrimaryPhrase = false;
  for (const phrase of intent.primaryPhrases) {
    if (primaryMatchTexts.some((txt) => fieldContainsPhrase(txt, phrase))) {
      serviceScore += 32;
      matchedPrimaryPhrase = true;
      matchedTerms.add('intentPhrase');
      if (matchType !== 'exact') matchType = 'exact';
      break;
    }
  }

  if (!matchedPrimaryPhrase) {
    for (const phrase of intent.synonymPhrases) {
      if (primaryMatchTexts.some((txt) => fieldContainsPhrase(txt, phrase))) {
        serviceScore += 22;
        matchedTerms.add('synonym');
        if (matchType === 'none' || matchType === 'partial') matchType = 'synonym';
        break;
      }
    }
  }

  // 7. Description & Provider Name
  if (fieldContainsPhrase(provider.description, serviceText)) {
    serviceScore += 20;
    matchedTerms.add('description');
    serviceStems.forEach((s) => coveredQueryStems.add(s));
    if (matchType === 'none') matchType = 'token';
  } else {
    const { count: descCount, matchedStems: descStems } = countStemMatches(provider.description, serviceStems);
    if (descCount > 0) {
      serviceScore += Math.min(20, descCount * 7);
      markMatchedStems(descStems);
      matchedTerms.add('description');
      if (matchType === 'none') matchType = 'token';
    } else if (hasPrefixMatch(provider.description, serviceTokensRaw)) {
      serviceScore += 6;
      matchedTerms.add('description');
      if (matchType === 'none') matchType = 'partial';
    }
  }

  const { count: pNameCount, matchedStems: pNameStems } = countStemMatches(provider.providerName, serviceStems);
  if (pNameCount > 0) {
    serviceScore += Math.min(14, pNameCount * 8);
    markMatchedStems(pNameStems);
    matchedTerms.add('providerName');
    if (matchType === 'none') matchType = 'token';
  }

  // Check intent expansion tokens against description/services if still unmatched
  if (serviceScore === 0 && (intent.primaryPhrases.length > 0 || intent.synonymPhrases.length > 0)) {
    const descNorm = normalizeText(provider.description);
    for (const phrase of [...intent.primaryPhrases, ...intent.synonymPhrases]) {
      if (descNorm.includes(phrase)) {
        serviceScore += 14;
        matchedTerms.add('synonymDescription');
        matchType = 'synonym';
        break;
      }
    }
  }

  // Disqualify if NO actual service/profile/intent match occurred (prevents category-only noise)
  if (serviceScore === 0) {
    return { score: 0, matchType: 'none', matchedServices: [], matchedTerms: [], disqualified: true };
  }

  // Category bonus ONLY AFTER service relevance is already established
  const catText = `${provider.category || ''} ${provider.categorySlug || ''}`;
  const { count: catCount } = countStemMatches(catText, serviceStems);
  if (catCount > 0) {
    serviceScore += 8;
  }

  // Multi-word coverage bonus: reward providers covering ALL distinct query terms
  if (serviceStems.length >= 2) {
    const coverage = coveredQueryStems.size / serviceStems.length;
    if (coverage >= 1) {
      serviceScore += 25;
    } else if (coverage >= 0.5) {
      serviceScore += Math.round(coverage * 10);
    }
  }

  const qualityScore = (provider.shopImage?.url ? 3 : 0) + ((provider.experienceYears || 0) >= 3 ? 2 : 0);

  return {
    score: serviceScore + locationEval.score + qualityScore,
    matchType,
    matchedServices: Array.from(matchedServiceTitles).slice(0, 5),
    matchedTerms: Array.from(matchedTerms),
    disqualified: false,
  };
}

/**
 * Queries eligible Provider & ProviderService records (works with both MongoDB and mocked models).
 */
async function fetchCandidateProviders({ categorySlug, subcategorySlug, parsed, intent }) {
  const baseQuery = { ...BASE_PROVIDER_GATE };
  if (categorySlug) {
    baseQuery.categorySlug = categorySlug;
  }

  // Find eligible ProviderService matches first when searching or filtering by subcategory
  let serviceMatchedProviderIds = [];
  let eligibleServicesByProvider = new Map();

  const shouldQueryServices =
    Boolean(parsed.serviceText) || Boolean(subcategorySlug) || Boolean(categorySlug);

  if (shouldQueryServices) {
    const svcQuery = { ...BASE_SERVICE_GATE };
    if (categorySlug) svcQuery.categorySlug = categorySlug;

    const svcOrClauses = [];
    if (subcategorySlug) {
      const subClean = escapeRegex(subcategorySlug.replace(/-/g, ' '));
      svcOrClauses.push(
        { subcategorySlug },
        { subcategory: { $regex: subClean, $options: 'i' } },
        { title: { $regex: subClean, $options: 'i' } }
      );
    }

    if (parsed.serviceText) {
      const expTokens = Array.from(intent.expansionTokens);
      if (expTokens.length > 0) {
        svcOrClauses.push({ searchTokens: { $in: expTokens } });
      }
      for (const tok of parsed.serviceTokensRaw.slice(0, 4)) {
        const cleanTok = escapeRegex(tok);
        svcOrClauses.push(
          { title: { $regex: cleanTok, $options: 'i' } },
          { subcategory: { $regex: cleanTok, $options: 'i' } },
          { deliverables: { $regex: cleanTok, $options: 'i' } },
          { description: { $regex: cleanTok, $options: 'i' } }
        );
      }
      for (const relSub of intent.relatedSubcategorySlugs) {
        svcOrClauses.push({ subcategorySlug: relSub });
      }
    }

    if (svcOrClauses.length > 0) {
      svcQuery.$or = svcOrClauses;
    }

    const matchedServices = await ProviderService.find(svcQuery).limit(600).lean();
    for (const svc of matchedServices) {
      const pid = String(svc.providerId);
      if (!eligibleServicesByProvider.has(pid)) {
        eligibleServicesByProvider.set(pid, []);
      }
      eligibleServicesByProvider.get(pid).push(svc);
    }
    serviceMatchedProviderIds = Array.from(eligibleServicesByProvider.keys());
  }

  // Build candidate provider filter (supporting both searchTokens-indexed docs & legacy docs)
  const providerOr = [];
  if (serviceMatchedProviderIds.length > 0) {
    providerOr.push({ _id: { $in: serviceMatchedProviderIds } });
  }

  if (subcategorySlug) {
    const subClean = escapeRegex(subcategorySlug.replace(/-/g, ' '));
    providerOr.push(
      { subcategorySlug },
      { subcategory: { $regex: subClean, $options: 'i' } },
      { services: { $regex: subClean, $options: 'i' } },
      { description: { $regex: subClean, $options: 'i' } }
    );
  }

  if (parsed.serviceText) {
    const expTokens = Array.from(intent.expansionTokens);
    if (expTokens.length > 0) {
      providerOr.push({ searchTokens: { $in: expTokens } });
    }
    for (const sub of intent.primarySubcategorySlugs) {
      providerOr.push({ subcategorySlug: sub });
    }
    for (const relSub of intent.relatedSubcategorySlugs) {
      providerOr.push({ subcategorySlug: relSub });
    }
    for (const tok of parsed.serviceTokensRaw.slice(0, 4)) {
      const cleanTok = escapeRegex(tok);
      providerOr.push(
        { businessName: { $regex: cleanTok, $options: 'i' } },
        { providerName: { $regex: cleanTok, $options: 'i' } },
        { subcategory: { $regex: cleanTok, $options: 'i' } },
        { services: { $regex: cleanTok, $options: 'i' } },
        { keywords: { $regex: cleanTok, $options: 'i' } },
        { description: { $regex: cleanTok, $options: 'i' } }
      );
    }
  }

  const providerQuery = { ...baseQuery };
  if (providerOr.length > 0) {
    providerQuery.$or = providerOr;
  }

  const candidateQuery = Provider.find(providerQuery)
    .sort({ publishedAt: -1 })
    .limit(500);
  applyPublicProjection(candidateQuery, PUBLIC_PROVIDER_SEARCH_PROJECTION);
  const candidateProviders = await candidateQuery.lean();

  // For candidates whose services weren't yet fetched, load all their eligible ProviderService items
  const candidateIds = candidateProviders.map((p) => p._id);
  const missingIds = candidateIds.filter((id) => !eligibleServicesByProvider.has(String(id)));
  if (missingIds.length > 0) {
    const extraServices = await ProviderService.find({
      ...BASE_SERVICE_GATE,
      providerId: { $in: missingIds },
    }).lean();
    for (const svc of extraServices) {
      const pid = String(svc.providerId);
      if (!eligibleServicesByProvider.has(pid)) {
        eligibleServicesByProvider.set(pid, []);
      }
      eligibleServicesByProvider.get(pid).push(svc);
    }
  }

  return { candidateProviders, eligibleServicesByProvider };
}

/**
 * Checks whether a provider satisfies explicit `subcategory` filter.
 */
function matchesExplicitSubcategory(provider, providerServices, subcategoryParam) {
  if (!subcategoryParam) return true;
  const cleanParam = String(subcategoryParam).trim();
  const targetSlug = createSlug(cleanParam);
  const targetNorm = normalizeText(cleanParam);
  const targetStems = tokenizeAndStem(cleanParam);

  const provSubSlug = String(provider.subcategorySlug || createSlug(provider.subcategory || '')).toLowerCase();
  if (provSubSlug && provSubSlug === targetSlug) return true;
  if (normalizeText(provider.subcategory) === targetNorm) return true;

  const inServicesArr = (provider.services || []).some((s) => {
    const sNorm = normalizeText(s);
    return sNorm === targetNorm || sNorm.includes(targetNorm) || createSlug(s) === targetSlug;
  });
  if (inServicesArr) return true;

  const inProviderServices = providerServices.some((svc) => {
    const svcSubSlug = String(svc.subcategorySlug || createSlug(svc.subcategory || '')).toLowerCase();
    if (svcSubSlug === targetSlug) return true;
    const tNorm = normalizeText(svc.title);
    return tNorm === targetNorm || tNorm.includes(targetNorm);
  });
  if (inProviderServices) return true;

  // Fallback token match in description only if all subcategory stems appear
  if (targetStems.length > 0 && provider.description) {
    const { count } = countStemMatches(provider.description, targetStems);
    if (count === targetStems.length) return true;
  }

  return false;
}

/**
 * Main Public Search Entry Point
 */
export async function searchPublicProviders(params = {}) {
  const {
    category = '',
    subcategory = '',
    location = '',
    city = '',
    search = '',
    service = '',
    q = '',
    page = 1,
    limit = 12,
    sort = '',
    strictLocation = false,
  } = params;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const categorySlug = category ? String(category).toLowerCase().trim() : '';
  const subcategoryRaw = subcategory ? String(subcategory).trim() : '';

  const parsed = parseSearchQuery({ search, service, q, location, city });
  const intent = analyzeServiceIntent(parsed);

  const effectiveSort =
    sort && ['relevance', 'newest', 'experience'].includes(sort)
      ? sort
      : parsed.serviceText || parsed.locationInfo
      ? 'relevance'
      : 'newest';

  const { candidateProviders, eligibleServicesByProvider } = await fetchCandidateProviders({
    categorySlug,
    subcategorySlug: subcategoryRaw ? createSlug(subcategoryRaw) : '',
    parsed,
    intent,
  });

  const primaryMatches = [];
  const nearbyMatches = [];
  const allIndiaServiceMatches = [];

  for (const provider of candidateProviders) {
    // Double-enforce public gate defensively
    if (
      provider.isDeleted === true ||
      provider.verificationStatus !== 'VERIFIED' ||
      provider.publicationStatus !== 'PUBLISHED'
    ) {
      continue;
    }

    const pServices = eligibleServicesByProvider.get(String(provider._id)) || [];

    if (subcategoryRaw && !matchesExplicitSubcategory(provider, pServices, subcategoryRaw)) {
      continue;
    }

    const locEval = evaluateLocationMatch(provider, pServices, parsed.locationInfo);
    const relEval = scoreProviderRelevance(provider, pServices, parsed, intent, locEval);

    if (relEval.disqualified) continue;

    if (parsed.locationInfo) {
      if (locEval.matched) {
        primaryMatches.push({ provider, relEval, locEval });
      } else if (locEval.isNearby) {
        nearbyMatches.push({ provider, relEval, locEval });
      } else {
        allIndiaServiceMatches.push({ provider, relEval, locEval });
      }
    } else {
      primaryMatches.push({ provider, relEval, locEval });
    }
  }

  let selectedResults = primaryMatches;
  let locationRelaxed = false;
  let locationRelaxationReason = null;

  // Strictly only consider nearby-region fallback when 0 exact/serviceArea/state matches exist and strictLocation is false
  const strictLocBool = strictLocation === true || strictLocation === 'true';
  if (
    parsed.locationInfo &&
    primaryMatches.length === 0 &&
    nearbyMatches.length > 0 &&
    !strictLocBool
  ) {
    selectedResults = nearbyMatches;
    locationRelaxed = true;
    const nearbyCityNames = Array.from(
      new Set(nearbyMatches.map((m) => m.provider.city).filter(Boolean))
    );
    locationRelaxationReason = `No exact matches found in ${parsed.locationInfo.entry.display}. Showing verified providers in nearby areas (${nearbyCityNames.join(', ')}).`;
  }

  // Sort BEFORE pagination (Requirement 2)
  selectedResults.sort((a, b) => {
    if (effectiveSort === 'newest') {
      const dateDiff = new Date(b.provider.publishedAt || 0) - new Date(a.provider.publishedAt || 0);
      if (dateDiff !== 0) return dateDiff;
      return b.relEval.score - a.relEval.score;
    }
    if (effectiveSort === 'experience') {
      const expDiff = (b.provider.experienceYears || 0) - (a.provider.experienceYears || 0);
      if (expDiff !== 0) return expDiff;
      return b.relEval.score - a.relEval.score;
    }
    // Default: 'relevance'
    if (b.relEval.score !== a.relEval.score) {
      return b.relEval.score - a.relEval.score;
    }
    if (b.locEval.tierRank !== a.locEval.tierRank) {
      return b.locEval.tierRank - a.locEval.tierRank;
    }
    return new Date(b.provider.publishedAt || 0) - new Date(a.provider.publishedAt || 0);
  });

  // Compute lightweight facets from full ranked set before pagination
  const cityCounts = new Map();
  const subcategoryCounts = new Map();
  for (const item of selectedResults) {
    if (item.provider.city) {
      cityCounts.set(item.provider.city, (cityCounts.get(item.provider.city) || 0) + 1);
    }
    if (item.provider.subcategory) {
      const key = item.provider.subcategorySlug || createSlug(item.provider.subcategory);
      const existing = subcategoryCounts.get(key) || {
        slug: key,
        name: item.provider.subcategory,
        count: 0,
      };
      existing.count++;
      subcategoryCounts.set(key, existing);
    }
  }

  const total = selectedResults.length;
  const totalPages = Math.max(1, Math.ceil(total / parsedLimit));
  const safePage = Math.min(parsedPage, totalPages);
  const startIdx = (safePage - 1) * parsedLimit;
  const pagedItems = selectedResults.slice(startIdx, startIdx + parsedLimit);

  // Format providers via strict public DTO allowlist (enforcing phone consent masking
  // and stripping auth, account, moderation, deletion, email, address, and token fields)
  const providers = pagedItems.map(({ provider, relEval, locEval }) =>
    toPublicProviderDto(provider, {
      searchMeta: {
        relevanceScore: relEval.score,
        matchType: relEval.matchType,
        locationTier: locEval.tier,
        matchedServices: relEval.matchedServices,
      },
    })
  );

  // Build zero-result recovery info when total === 0
  let recovery = null;
  if (total === 0) {
    const activeCats = await categoryService.getPublicCategories().catch(() => []);
    const relatedSubcategories = [];
    if (intent.matchedRules.length > 0) {
      const mainSlug = intent.matchedRules[0].mainCategorySlug;
      const mainCat = activeCats.find((c) => c.slug === mainSlug);
      if (mainCat?.subcategories) {
        for (const sub of mainCat.subcategories.slice(0, 4)) {
          relatedSubcategories.push({
            name: sub.name,
            slug: sub.slug,
            categorySlug: mainCat.slug,
          });
        }
      }
    }
    recovery = {
      broadenedAvailableCount: allIndiaServiceMatches.length,
      nearbyAvailableCount: nearbyMatches.length,
      relatedSubcategories,
      didYouMean: parsed.correctedQuery,
    };
  }

  return {
    providers,
    total,
    page: safePage,
    limit: parsedLimit,
    totalPages,
    sort: effectiveSort,
    meta: {
      parsedService: parsed.serviceText,
      extractedLocation: parsed.extractedLocation,
      resolvedLocation: parsed.locationInfo?.entry?.display || null,
      correctedQuery: parsed.correctedQuery,
      locationRelaxed,
      locationRelaxationReason,
      facets: {
        cities: Array.from(cityCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12),
        subcategories: Array.from(subcategoryCounts.values()).sort((a, b) => b.count - a.count),
      },
      recovery,
    },
  };
}

/**
 * Lightweight autocomplete suggestions for services, subcategories, cities, and verified providers.
 */
export async function getSearchSuggestions(query = '', { type = 'all' } = {}) {
  const cleanQ = normalizeText(String(query || '').slice(0, 80));
  if (!cleanQ || cleanQ.length < 2) {
    return { services: [], cities: [], providers: [] };
  }

  const fixResult = correctTokenTypo(cleanQ);
  const searchTerms = Array.from(new Set([cleanQ, ...(fixResult.corrected ? [fixResult.token] : [])]));

  const suggestions = {
    services: [],
    cities: [],
    providers: [],
  };

  // 1. Canonical subcategories & popular service intents
  if (type === 'all' || type === 'service') {
    const seenSvc = new Set();
    const categories = await categoryService.getPublicCategories().catch(() => []);

    for (const cat of categories) {
      for (const sub of cat.subcategories || []) {
        if (sub.isActive === false) continue;
        const subNorm = normalizeText(sub.name);
        if (searchTerms.some((t) => subNorm.includes(t) || t.includes(subNorm))) {
          if (!seenSvc.has(sub.name.toLowerCase())) {
            seenSvc.add(sub.name.toLowerCase());
            suggestions.services.push({
              label: sub.name,
              categorySlug: cat.slug,
              subcategorySlug: sub.slug,
              type: 'subcategory',
            });
          }
        }
      }
    }

    for (const rule of SERVICE_INTENT_RULES) {
      for (const phrase of [...rule.primaryPhrases, ...rule.synonymPhrases]) {
        const pNorm = normalizeText(phrase);
        if (searchTerms.some((t) => pNorm.includes(t))) {
          const titleCased = phrase.replace(/\b\w/g, (c) => c.toUpperCase());
          if (!seenSvc.has(titleCased.toLowerCase())) {
            seenSvc.add(titleCased.toLowerCase());
            suggestions.services.push({
              label: titleCased,
              categorySlug: rule.mainCategorySlug,
              subcategorySlug: rule.primarySubcategorySlugs[0] || '',
              type: 'service_intent',
            });
          }
        }
      }
    }

    suggestions.services = suggestions.services.slice(0, 6);
  }

  // 2. Cities from catalog & active verified providers
  if (type === 'all' || type === 'location') {
    const seenCities = new Set();
    for (const loc of LOCATION_CATALOG) {
      if (loc.aliases.some((a) => searchTerms.some((t) => a.includes(t) || t.includes(a)))) {
        if (!seenCities.has(loc.display.toLowerCase())) {
          seenCities.add(loc.display.toLowerCase());
          suggestions.cities.push(loc.display);
        }
      }
    }

    const rx = new RegExp(escapeRegex(searchTerms[0]), 'i');
    const dbCities =
      typeof Provider.distinct === 'function'
        ? await Provider.distinct('city', {
            ...BASE_PROVIDER_GATE,
            city: { $regex: rx },
          }).catch(() => [])
        : [];
    for (const c of dbCities || []) {
      if (c && !seenCities.has(c.toLowerCase())) {
        seenCities.add(c.toLowerCase());
        suggestions.cities.push(c);
      }
    }
    suggestions.cities = suggestions.cities.slice(0, 6);
  }

  // 3. Verified & published providers matching prefix/query
  if (type === 'all' || type === 'service') {
    const rx = new RegExp(escapeRegex(searchTerms[0]), 'i');
    const matchedProviders = await Provider.find({
      ...BASE_PROVIDER_GATE,
      $or: [{ businessName: { $regex: rx } }, { services: { $regex: rx } }],
    })
      .select('businessName slug city category subcategory')
      .limit(5)
      .lean()
      .catch(() => []);

    suggestions.providers = matchedProviders
      .map((p) => toPublicProviderSuggestionDto(p))
      .filter(Boolean);
  }

  return suggestions;
}

export default {
  parseSearchQuery,
  analyzeServiceIntent,
  evaluateLocationMatch,
  scoreProviderRelevance,
  searchPublicProviders,
  getSearchSuggestions,
};
