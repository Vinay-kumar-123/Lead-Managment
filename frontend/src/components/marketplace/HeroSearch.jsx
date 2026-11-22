import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ArrowRight, Layers, Building2 } from 'lucide-react';
import providerService from '../../services/providerService.js';

export default function HeroSearch({ onSearch }) {
  const [serviceQuery, setServiceQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [validationError, setValidationError] = useState('');
  const [serviceSuggestions, setServiceSuggestions] = useState({ services: [], providers: [] });
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'service' | 'city' | null
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced service & provider suggestions
  useEffect(() => {
    const q = serviceQuery.trim();
    if (q.length < 2) {
      setServiceSuggestions({ services: [], providers: [] });
      return;
    }

    const timer = setTimeout(async () => {
      const data = await providerService.getSuggestions(q, 'service');
      setServiceSuggestions({
        services: data.services || [],
        providers: data.providers || [],
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [serviceQuery]);

  // Debounced city suggestions
  useEffect(() => {
    const q = cityQuery.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const data = await providerService.getSuggestions(q, 'location');
      setCitySuggestions(data.cities || []);
    }, 200);

    return () => clearTimeout(timer);
  }, [cityQuery]);

  const executeSearch = (svcVal, cityVal) => {
    const trimmedService = (svcVal ?? serviceQuery).trim();
    const trimmedCity = (cityVal ?? cityQuery).trim();

    if (!trimmedService && !trimmedCity) {
      setValidationError('Please enter a service, category, or city to search.');
      return;
    }

    setValidationError('');
    setActiveDropdown(null);

    const params = new URLSearchParams();
    if (trimmedService) params.append('service', trimmedService);
    if (trimmedCity) params.append('city', trimmedCity);

    if (onSearch) {
      onSearch({ service: trimmedService, city: trimmedCity });
    }

    navigate(`/providers?${params.toString()}`);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    executeSearch(serviceQuery, cityQuery);
  };

  const hasServiceDropdownItems =
    serviceSuggestions.services.length > 0 || serviceSuggestions.providers.length > 0;

  return (
    <div ref={containerRef} className="w-full max-w-4xl mx-auto relative">
      <form
        onSubmit={handleSearch}
        className="bg-white rounded-lg sm:rounded-xl shadow-lg border border-border/80 p-2 sm:p-3 transition-all duration-200 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent"
        role="search"
        aria-label="Find service providers"
      >
        <div className="flex flex-col md:flex-row items-stretch gap-2">
          {/* Service / Category Input */}
          <div className="relative flex-1 flex items-center gap-3 px-3.5 py-2.5 sm:py-3 bg-slate-50/70 md:bg-transparent rounded-md border md:border-none border-border/60">
            <Search className="w-5 h-5 text-accent flex-shrink-0" aria-hidden="true" />
            <div className="w-full text-left">
              <label htmlFor="hero-service-input" className="sr-only">
                Service or Category
              </label>
              <input
                id="hero-service-input"
                type="text"
                value={serviceQuery}
                onFocus={() => setActiveDropdown('service')}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setActiveDropdown(null);
                }}
                onChange={(e) => {
                  setServiceQuery(e.target.value);
                  setActiveDropdown('service');
                  if (validationError) setValidationError('');
                }}
                placeholder="What service do you need? (e.g. Wedding Planning, Event Manager)"
                className="w-full bg-transparent text-text-primary text-sm sm:text-base placeholder-text-muted outline-none font-medium"
                autoComplete="off"
              />
            </div>

            {/* Service Autocomplete Dropdown */}
            {activeDropdown === 'service' && hasServiceDropdownItems && (
              <div
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-border z-50 text-left overflow-hidden"
                role="listbox"
                aria-label="Service suggestions"
              >
                {serviceSuggestions.services.length > 0 && (
                  <div className="py-1.5">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Services & Categories
                    </div>
                    {serviceSuggestions.services.map((item, idx) => (
                      <button
                        key={`${item.label}-${idx}`}
                        type="button"
                        onClick={() => {
                          setServiceQuery(item.label);
                          setActiveDropdown(null);
                          executeSearch(item.label, cityQuery);
                        }}
                        className="w-full px-3.5 py-2 text-sm text-primary hover:bg-slate-50 flex items-center gap-2.5 text-left transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
                        <span className="font-medium truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {serviceSuggestions.providers.length > 0 && (
                  <div className="py-1.5 border-t border-border/60">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Verified Providers
                    </div>
                    {serviceSuggestions.providers.map((prov) => (
                      <button
                        key={prov.slug}
                        type="button"
                        onClick={() => {
                          setActiveDropdown(null);
                          navigate(`/providers/${prov.slug}`);
                        }}
                        className="w-full px-3.5 py-2 text-sm text-primary hover:bg-slate-50 flex items-center justify-between gap-2 text-left transition-colors"
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
                          <span className="font-medium truncate">{prov.businessName}</span>
                        </span>
                        <span className="text-xs text-text-muted flex-shrink-0">{prov.city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider on desktop */}
          <div className="hidden md:block w-px bg-border/80 my-2" aria-hidden="true" />

          {/* City / Location Input */}
          <div className="relative flex-1 flex items-center gap-3 px-3.5 py-2.5 sm:py-3 bg-slate-50/70 md:bg-transparent rounded-md border md:border-none border-border/60">
            <MapPin className="w-5 h-5 text-accent flex-shrink-0" aria-hidden="true" />
            <div className="w-full text-left">
              <label htmlFor="hero-city-input" className="sr-only">
                City or Location
              </label>
              <input
                id="hero-city-input"
                type="text"
                value={cityQuery}
                onFocus={() => setActiveDropdown('city')}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setActiveDropdown(null);
                }}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setActiveDropdown('city');
                  if (validationError) setValidationError('');
                }}
                placeholder="City or locality (e.g. Delhi, Mumbai, Kolkata)"
                className="w-full bg-transparent text-text-primary text-sm sm:text-base placeholder-text-muted outline-none font-medium"
                autoComplete="off"
              />
            </div>

            {/* City Autocomplete Dropdown */}
            {activeDropdown === 'city' && citySuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-border z-50 text-left overflow-hidden py-1.5"
                role="listbox"
                aria-label="City suggestions"
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Cities
                </div>
                {citySuggestions.map((cityName) => (
                  <button
                    key={cityName}
                    type="button"
                    onClick={() => {
                      setCityQuery(cityName);
                      setActiveDropdown(null);
                    }}
                    className="w-full px-3.5 py-2 text-sm text-primary hover:bg-slate-50 flex items-center gap-2.5 text-left transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
                    <span className="font-medium">{cityName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            className="btn-primary py-3 px-6 sm:px-8 text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 flex-shrink-0"
          >
            <span>Search Services</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Validation Message */}
      {validationError && (
        <p className="mt-2.5 text-xs sm:text-sm text-amber-200 bg-amber-950/40 border border-amber-500/30 rounded-md py-1.5 px-3.5 text-center font-medium animate-fadeIn">
          {validationError}
        </p>
      )}
    </div>
  );
}
