import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import Breadcrumb from '../../components/common/Breadcrumb.jsx';
import ProviderCard from '../../components/marketplace/ProviderCard.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import providerService from '../../services/providerService.js';
import { useCategories } from '../../hooks/useCategories.js';
import { buildBreadcrumbSchema } from '../../utils/seo.js';
import {
  Search,
  MapPin,
  Filter,
  X,
  SlidersHorizontal,
  ShieldAlert,
  RotateCcw,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

export default function ProvidersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, getCategoryBySlug } = useCategories();

  // State initialized from URL query parameters
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get('service') || searchParams.get('search') || searchParams.get('q') || ''
  );
  const [locationTerm, setLocationTerm] = useState(
    searchParams.get('city') || searchParams.get('location') || ''
  );
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get('category') || ''
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState(
    searchParams.get('subcategory') || ''
  );
  const [selectedSort, setSelectedSort] = useState(
    searchParams.get('sort') || ''
  );
  const [currentPage, setCurrentPage] = useState(
    Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  );

  const [providersList, setProvidersList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchMeta, setSearchMeta] = useState(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [serviceSuggestions, setServiceSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionBoxRef = useRef(null);

  usePageMeta({
    title: 'Find Verified Service Providers — Dealsathi',
    description:
      'Search and filter vetted service providers, agencies, and professionals across India on Dealsathi.',
    canonical: 'https://dealsathi.in/providers',
    jsonLd: buildBreadcrumbSchema([{ name: 'Service Providers', path: '/providers' }]),
  });

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const onOutside = (e) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Debounced autocomplete on service input
  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 2) {
      setServiceSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await providerService.getSuggestions(q, 'service');
      setServiceSuggestions(res.services || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Query providerService when searchParams change
  useEffect(() => {
    const serviceParam =
      searchParams.get('service') || searchParams.get('search') || searchParams.get('q') || '';
    const cityParam = searchParams.get('city') || searchParams.get('location') || '';
    const catParam = searchParams.get('category') || '';
    const subParam = searchParams.get('subcategory') || '';
    const sortParam = searchParams.get('sort') || '';
    const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    setSearchTerm(serviceParam);
    setLocationTerm(cityParam);
    setSelectedCategory(catParam);
    setSelectedSubcategory(subParam);
    setSelectedSort(sortParam);
    setCurrentPage(pageParam);

    let isMounted = true;
    setIsLoading(true);
    setFetchError('');

    providerService
      .getProviders({
        categorySlug: catParam,
        subcategory: subParam,
        location: cityParam,
        search: serviceParam,
        page: pageParam,
        limit: 12,
        sort: sortParam,
      })
      .then((res) => {
        if (!isMounted) return;
        setProvidersList(res.data || []);
        setTotalCount(typeof res.total === 'number' ? res.total : (res.data || []).length);
        setTotalPages(res.totalPages || 1);
        setSearchMeta(res.meta || null);
        setIsFallbackMode(Boolean(res.isFallback));
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setProvidersList([]);
        setTotalCount(0);
        setTotalPages(1);
        setSearchMeta(null);
        setIsFallbackMode(false);
        setFetchError(
          err?.message || 'Unable to load service providers right now. Please try again shortly.'
        );
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const pushSearchParams = ({
    search = searchTerm,
    location = locationTerm,
    category = selectedCategory,
    subcategory = selectedSubcategory,
    sort = selectedSort,
    page = 1,
  } = {}) => {
    const params = new URLSearchParams();
    if (search && search.trim()) params.set('search', search.trim());
    if (location && location.trim()) params.set('city', location.trim());
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (sort) params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params);
  };

  // Synchronize form filter actions to URL
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);
    pushSearchParams({ page: 1 });
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setLocationTerm('');
    setSelectedCategory('');
    setSelectedSubcategory('');
    setSelectedSort('');
    setCurrentPage(1);
    setSearchParams(new URLSearchParams());
  };

  const handleBroadenLocation = () => {
    setLocationTerm('');
    const effectiveService = searchMeta?.parsedService || searchTerm;
    setSearchTerm(effectiveService);
    pushSearchParams({
      search: effectiveService,
      location: '',
      page: 1,
    });
  };

  const hasActiveFilters = Boolean(
    searchParams.get('service') ||
      searchParams.get('search') ||
      searchParams.get('q') ||
      searchParams.get('city') ||
      searchParams.get('location') ||
      searchParams.get('category') ||
      searchParams.get('subcategory')
  );

  const activeCategoryObj = selectedCategory ? getCategoryBySlug(selectedCategory) : null;
  const activeSubcategories = (activeCategoryObj?.subcategories || []).filter(
    (s) => s && s.isActive !== false
  );

  return (
    <div className="bg-background min-h-screen">
      {/* Top Banner & Breadcrumb */}
      <div className="bg-white border-b border-border/80">
        <div className="container-max py-3 px-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Service Providers' }]} />
        </div>
      </div>

      <div className="container-max py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="max-w-3xl mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2 block">
            Verified Partner Network
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-2">
            Service Providers Directory
          </h1>
          <p className="text-text-muted text-sm sm:text-base leading-relaxed">
            Find vetted contractors, design studios, event specialists, and agencies across India.
            Only manually verified and published providers appear in public search results.
          </p>
        </div>

        {/* Development Preview Banner (shown ONLY when explicit dev offline seed fallback is active) */}
        {isFallbackMode && (
          <div className="mb-8 p-4 bg-amber-50/90 border border-amber-200/90 rounded-xl text-xs sm:text-sm text-amber-900 flex items-start gap-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="leading-relaxed">
              <strong>Development Offline Fallback Active:</strong> Displaying sample listings
              because the backend API is unreachable and{' '}
              <code>VITE_ENABLE_DEV_SEED_FALLBACK</code> is enabled.
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-border/80 shadow-xs mb-6">
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Keyword / Service Input */}
              <div className="relative md:col-span-4" ref={suggestionBoxRef}>
                <label
                  htmlFor="search-service-input"
                  className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  Service or Keyword
                </label>
                <div className="relative flex items-center">
                  <Search
                    className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="search-service-input"
                    type="text"
                    value={searchTerm}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowSuggestions(false);
                    }}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSuggestions(true);
                    }}
                    placeholder="e.g. Event Manager Delhi, Photographer"
                    className="w-full pl-9 pr-8 py-2.5 text-sm bg-slate-50 border border-border rounded-lg text-primary focus:outline-none focus:border-accent focus:bg-white transition-colors"
                    autoComplete="off"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 text-text-muted hover:text-primary"
                      aria-label="Clear service input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showSuggestions && serviceSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-lg shadow-lg border border-border z-30 py-1">
                    {serviceSuggestions.map((s, idx) => (
                      <button
                        key={`${s.label}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSearchTerm(s.label);
                          setShowSuggestions(false);
                          pushSearchParams({ search: s.label, page: 1 });
                        }}
                        className="w-full px-3 py-2 text-xs text-left text-primary hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Search className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                        <span className="font-medium truncate">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location Input */}
              <div className="relative md:col-span-3">
                <label
                  htmlFor="search-location-input"
                  className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  City or Location
                </label>
                <div className="relative flex items-center">
                  <MapPin
                    className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="search-location-input"
                    type="text"
                    value={locationTerm}
                    onChange={(e) => setLocationTerm(e.target.value)}
                    placeholder="e.g. Delhi, Kolkata, Mumbai"
                    className="w-full pl-9 pr-8 py-2.5 text-sm bg-slate-50 border border-border rounded-lg text-primary focus:outline-none focus:border-accent focus:bg-white transition-colors"
                  />
                  {locationTerm && (
                    <button
                      type="button"
                      onClick={() => setLocationTerm('')}
                      className="absolute right-3 text-text-muted hover:text-primary"
                      aria-label="Clear location input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Dropdown */}
              <div className="md:col-span-3">
                <label
                  htmlFor="category-select"
                  className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  Category Vertical
                </label>
                <select
                  id="category-select"
                  value={selectedCategory}
                  onChange={(e) => {
                    const nextCat = e.target.value;
                    setSelectedCategory(nextCat);
                    setSelectedSubcategory('');
                  }}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-border rounded-lg text-primary focus:outline-none focus:border-accent focus:bg-white transition-colors cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="md:col-span-2">
                <label
                  htmlFor="sort-select"
                  className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  Sort By
                </label>
                <div className="relative flex items-center">
                  <ArrowUpDown
                    className="w-3.5 h-3.5 text-text-muted absolute left-3 pointer-events-none"
                    aria-hidden="true"
                  />
                  <select
                    id="sort-select"
                    value={selectedSort || (searchTerm || locationTerm ? 'relevance' : 'newest')}
                    onChange={(e) => {
                      const nextSort = e.target.value;
                      setSelectedSort(nextSort);
                      pushSearchParams({ sort: nextSort, page: 1 });
                    }}
                    className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-50 border border-border rounded-lg text-primary focus:outline-none focus:border-accent focus:bg-white transition-colors cursor-pointer"
                  >
                    <option value="relevance">Best Match</option>
                    <option value="newest">Newest</option>
                    <option value="experience">Experience</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Active Subcategory Quick Filter Chips when a Main Category is selected */}
            {selectedCategory && activeSubcategories.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted mr-1">
                  Subcategories:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubcategory('');
                    pushSearchParams({ category: selectedCategory, subcategory: '', page: 1 });
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    !selectedSubcategory
                      ? 'bg-primary text-white border-primary'
                      : 'bg-slate-50 text-text-muted border-border hover:border-primary'
                  }`}
                >
                  All {activeCategoryObj?.name}
                </button>
                {activeSubcategories.map((sub) => {
                  const isSubActive =
                    selectedSubcategory.trim().toLowerCase() === sub.slug.toLowerCase() ||
                    selectedSubcategory.trim().toLowerCase() === sub.name.toLowerCase();
                  return (
                    <button
                      key={sub.id || sub.slug}
                      type="button"
                      onClick={() => {
                        const nextSub = isSubActive ? '' : sub.slug;
                        setSelectedSubcategory(nextSub);
                        pushSearchParams({
                          category: selectedCategory,
                          subcategory: nextSub,
                          page: 1,
                        });
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                        isSubActive
                          ? 'bg-accent text-white border-accent'
                          : 'bg-slate-50 text-text-primary border-border hover:border-accent'
                      }`}
                    >
                      {sub.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Filter Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
              <div className="text-xs text-text-muted font-medium">
                {isLoading ? (
                  <span>Searching directory...</span>
                ) : (
                  <span>
                    Showing <strong className="text-primary">{providersList.length}</strong> of{' '}
                    <strong className="text-primary">{totalCount}</strong> matching provider
                    {totalCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 text-text-muted hover:text-primary"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Reset Filters</span>
                  </button>
                )}

                <button
                  type="submit"
                  className="btn-primary text-xs py-2 px-5 font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Filter className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Apply Search</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Search Context Notices (Typo Correction, Extracted Location, Location Relaxation) */}
        {!isLoading && searchMeta && (
          <div className="space-y-2.5 mb-6">
            {searchMeta.correctedQuery && (
              <div className="px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden="true" />
                <span>
                  Showing results for <strong>{searchMeta.correctedQuery}</strong>
                </span>
              </div>
            )}

            {searchMeta.extractedLocation && !locationTerm && (
              <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-border/80 text-xs text-primary flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />
                  <span>
                    Filtered by location: <strong>{searchMeta.extractedLocation}</strong>
                    {searchMeta.parsedService ? (
                      <>
                        {' '}
                        for <strong>{searchMeta.parsedService}</strong>
                      </>
                    ) : null}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleBroadenLocation}
                  className="text-accent hover:underline font-semibold flex-shrink-0"
                >
                  Search All India
                </button>
              </div>
            )}

            {searchMeta.locationRelaxed && searchMeta.locationRelaxationReason && (
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{searchMeta.locationRelaxationReason}</span>
              </div>
            )}
          </div>
        )}

        {/* Results Grid / Error / Empty State */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-text-muted">Loading providers...</p>
          </div>
        ) : fetchError ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-xl mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-lg font-bold text-primary mb-1">Unable to Load Providers</h2>
            <p className="text-xs sm:text-sm text-text-muted mb-4">{fetchError}</p>
            <button
              type="button"
              onClick={() => pushSearchParams({ page: currentPage })}
              className="btn-primary text-xs py-2 px-5"
            >
              Retry Search
            </button>
          </div>
        ) : providersList.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {providersList.map((provider) => (
                <ProviderCard key={provider._id || provider.id || provider.slug} provider={provider} />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => pushSearchParams({ page: currentPage - 1 })}
                  className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <span className="text-xs font-semibold text-primary px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => pushSearchParams({ page: currentPage + 1 })}
                  className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-border/80 p-8 sm:p-10 text-center max-w-2xl mx-auto shadow-xs">
            <SlidersHorizontal className="w-10 h-10 text-text-muted mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-lg font-bold text-primary mb-2">No Matching Providers Found</h2>
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed mb-5">
              We couldn't find any verified providers matching your exact criteria.
              {searchMeta?.recovery?.broadenedAvailableCount > 0
                ? ` However, ${searchMeta.recovery.broadenedAvailableCount} verified provider(s) offer this service in other cities.`
                : ' Try broadening your keywords, clearing the location filter, or request a custom quote.'}
            </p>

            {/* Related subcategories recovery */}
            {searchMeta?.recovery?.relatedSubcategories?.length > 0 && (
              <div className="mb-6">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
                  Explore Related Services
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {searchMeta.recovery.relatedSubcategories.map((sub) => (
                    <button
                      key={sub.slug}
                      type="button"
                      onClick={() =>
                        pushSearchParams({
                          search: '',
                          category: sub.categorySlug,
                          subcategory: sub.slug,
                          page: 1,
                        })
                      }
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-accent hover:text-white text-primary transition-colors"
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              {searchMeta?.recovery?.broadenedAvailableCount > 0 && (
                <button
                  type="button"
                  onClick={handleBroadenLocation}
                  className="btn-primary text-xs py-2.5 px-5"
                >
                  View {searchMeta.recovery.broadenedAvailableCount} Providers Across India
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="btn-secondary text-xs py-2.5 px-5"
                >
                  Clear All Filters
                </button>
              )}

              <Link
                to={`/get-quote?service=${encodeURIComponent(
                  searchMeta?.parsedService || searchTerm || ''
                )}&city=${encodeURIComponent(
                  searchMeta?.resolvedLocation || locationTerm || ''
                )}`}
                className="btn-primary text-xs py-2.5 px-5"
              >
                Request Custom Quote
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
