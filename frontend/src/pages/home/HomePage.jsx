import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  BookOpen,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { useCategories } from '../../hooks/useCategories.js';
import { services } from '../../data/services.js';
import { providers } from '../../data/providers.js';
import blogService from '../../services/blogService.js';

// Subcomponents
import HeroSearch from '../../components/marketplace/HeroSearch.jsx';
import CategoryCard from '../../components/marketplace/CategoryCard.jsx';
import ServiceCard from '../../components/marketplace/ServiceCard.jsx';
import ProviderCard from '../../components/marketplace/ProviderCard.jsx';
import { HowItWorksSection, TrustSection } from '../../components/marketplace/HowItWorks.jsx';
import SectionHeading from '../../components/common/SectionHeading.jsx';
import Button from '../../components/common/Button.jsx';
import Badge from '../../components/common/Badge.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';

export default function HomePage() {
  const { categories } = useCategories();

  usePageMeta({
    title: 'Find the Right Professionals for Your Needs',
    description:
      'Dealsathi connects customers looking for services with verified professionals across Home & Construction, Events, Business, Digital, and Education.',
    canonical: 'https://dealsathi.in/',
  });

  // State for Blog Section (API fetch with graceful offline/dev fallback)
  const [blogs, setBlogs] = useState([]);
  const [blogStatus, setBlogStatus] = useState('loading'); // 'loading' | 'success' | 'empty' | 'fallback'

  useEffect(() => {
    let isMounted = true;

    async function loadBlogs() {
      try {
        const response = await blogService.getBlogs({ page: 1, limit: 3 });
        if (!isMounted) return;

        if (response && response.data && response.data.length > 0) {
          setBlogs(response.data);
          setBlogStatus('success');
        } else {
          setBlogStatus('fallback');
        }
      } catch (err) {
        if (!isMounted) return;
        // Expected during Phase 2 before Express server deployment
        setBlogStatus('fallback');
      }
    }

    loadBlogs();

    return () => {
      isMounted = false;
    };
  }, []);

  // Popular search suggestions
  const popularSearches = [
    { label: 'Interior Design', query: 'Interior Design' },
    { label: 'Home Renovation', query: 'Home Renovation' },
    { label: 'Wedding Planning', query: 'Wedding Planning' },
    { label: 'Website Development', query: 'Website Development' },
    { label: 'Commercial Property', query: 'Commercial Property' },
  ];

  // Development sample blog preview articles
  const fallbackArticles = [
    {
      id: 'art-01',
      slug: 'interior-design-cost-guide-india',
      title: 'How Much Does Interior Design Actually Cost in India? (2026 Breakdown)',
      excerpt:
        'A transparent guide to turnkey residential interior design rates across Mumbai, Delhi, Bengaluru, and Pune.',
      category: 'Home & Construction',
      readingTime: '5 min read',
      publishedAt: 'November 2026',
    },
    {
      id: 'art-02',
      slug: 'questions-to-ask-wedding-planner',
      title: '10 Crucial Questions Every Couple Must Ask Before Hiring a Wedding Planner',
      excerpt:
        'Avoid surprise line-item fees, vendor conflicts, and day-of delays with this essential hiring checklist.',
      category: 'Events & Lifestyle',
      readingTime: '4 min read',
      publishedAt: 'November 2026',
    },
    {
      id: 'art-03',
      slug: 'hiring-web-development-agency-checklist',
      title: 'Building Your First Business Website: Scope, Ownership & Milestones',
      excerpt:
        'Why code ownership, Core Web Vitals, and milestone-based payments matter before hiring a software developer.',
      category: 'Digital & Professional Services',
      readingTime: '6 min read',
      publishedAt: 'November 2026',
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* =========================================================================
          SECTION 2: SEARCH-FIRST HERO
         ========================================================================= */}
      <section
        className="relative bg-gradient-to-b from-primary-900 via-primary-700 to-primary-800 text-white pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
        aria-labelledby="hero-headline"
      >
        {/* Subtle geometric background overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#FF6A03 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            backgroundPosition: '0 0, 16px 16px',
          }}
          aria-hidden="true"
        />

        <div className="container-max relative z-10 text-center max-w-4xl mx-auto">
          {/* Working Brand Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-blue-100 text-xs sm:text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4 text-accent-400" aria-hidden="true" />
            <span>Dealsathi • Pan-India Service Discovery & Verified Advisory</span>
          </div>

          {/* Hero Headline */}
          <h1
            id="hero-headline"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mb-5 sm:mb-6"
          >
            Find the Right Professionals for Your Needs
          </h1>

          {/* Supporting Text */}
          <p className="text-base sm:text-lg md:text-xl text-blue-100/90 max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-10 font-normal">
            Discover services, explore providers and connect with the right professionals for your next project.
          </p>

          {/* Functional Search Control Form */}
          <HeroSearch />

          {/* =========================================================================
              SECTION 3: POPULAR SEARCH SUGGESTIONS
             ========================================================================= */}
          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
            <span className="text-blue-200/80 font-medium mr-1">Popular searches:</span>
            {popularSearches.map((item, idx) => (
              <Link
                key={idx}
                to={`/providers?service=${encodeURIComponent(item.query)}`}
                className="bg-white/10 hover:bg-accent/20 text-white/90 hover:text-accent-200 px-3 py-1 rounded-full border border-white/15 hover:border-accent/40 transition-all duration-150"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: FIVE MARKETPLACE CATEGORY CARDS
         ========================================================================= */}
      <section className="section-padding bg-background" aria-labelledby="categories-heading">
        <div className="container-max">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2 block">
                Directory
              </span>
              <h2
                id="categories-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-primary tracking-tight"
              >
                Explore Marketplace Categories
              </h2>
            </div>
            <Link
              to="/categories"
              className="text-sm font-semibold text-accent hover:text-accent-600 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <span>View All 5 Categories</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          {/* 5 Spacious Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 sm:gap-6">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: POPULAR SERVICES
         ========================================================================= */}
      <section className="section-padding bg-white border-t border-border/60" aria-labelledby="services-heading">
        <div className="container-max">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2 block">
                Trending Offerings
              </span>
              <h2
                id="services-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-primary tracking-tight"
              >
                Popular Services
              </h2>
            </div>
            <Link
              to="/categories"
              className="text-sm font-semibold text-accent hover:text-accent-600 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <span>Explore All Services</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: FEATURED PROVIDERS
         ========================================================================= */}
      <section className="section-padding bg-slate-50/70 border-t border-border/60" aria-labelledby="providers-heading">
        <div className="container-max">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent">
                  Verified Network
                </span>
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300/80">
                  Development Preview
                </span>
              </div>
              <h2
                id="providers-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-primary tracking-tight"
              >
                Featured Service Providers
              </h2>
            </div>
            <Link
              to="/providers"
              className="text-sm font-semibold text-accent hover:text-accent-600 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <span>Browse All Providers</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Development Notice Banner */}
          <div className="mb-8 p-4 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Provider Onboarding Transparency Notice</p>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                The listings below represent structured development placeholder profiles. In production, providers are published strictly after manual KYC verification, credentials check, and written consent. Zero fake reviews or ratings are generated.
              </p>
            </div>
          </div>

          {/* Providers Grid */}
          {providers && providers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Building}
              title="No providers published yet"
              description="We are currently onboarding verified local contractors and specialists. Submit an enquiry and our team will match you directly."
              actionLabel="Submit an Enquiry"
              actionHref="/get-quote"
            />
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 7: HOW IT WORKS
         ========================================================================= */}
      <HowItWorksSection />

      {/* =========================================================================
          SECTION 8: TRUST AND TRANSPARENCY
         ========================================================================= */}
      <TrustSection />

      {/* =========================================================================
          SECTION 9: LATEST BLOG ARTICLES
         ========================================================================= */}
      <section className="section-padding bg-slate-50/70 border-t border-border/60" aria-labelledby="blog-heading">
        <div className="container-max">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2 block">
                Resources & Insights
              </span>
              <h2
                id="blog-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-primary tracking-tight"
              >
                Latest Guides & Hiring Advice
              </h2>
            </div>
            <Link
              to="/blog"
              className="text-sm font-semibold text-accent hover:text-accent-600 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <span>Explore All Articles</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Conditional Blog Rendering */}
          {blogStatus === 'loading' && (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="md" label="Checking for marketplace guides..." />
            </div>
          )}

          {blogStatus === 'success' && blogs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-7">
              {blogs.map((article) => (
                <article
                  key={article._id || article.slug}
                  className="card-hover bg-white p-6 flex flex-col justify-between border-border/80"
                >
                  <div>
                    <Badge variant="teal" className="mb-3">
                      {article.category}
                    </Badge>
                    <h3 className="text-lg font-bold text-primary mb-2.5 line-clamp-2">
                      <Link to={`/blog/${article.slug}`} className="hover:text-accent transition-colors">
                        {article.title}
                      </Link>
                    </h3>
                    <p className="text-text-muted text-xs sm:text-sm leading-relaxed mb-4 line-clamp-3">
                      {article.excerpt}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs text-text-muted">
                    <span>{article.author?.name || article.author || 'Dealsathi Advisory'}</span>
                    <Link
                      to={`/blog/${article.slug}`}
                      className="font-semibold text-accent hover:underline flex items-center gap-1"
                    >
                      Read Guide <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {blogStatus === 'fallback' && (
            <div>
              <div className="mb-6 p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between">
                <span>
                  💡 <strong>Development Preview:</strong> Displaying static editorial guides pending MongoDB Express API launch (Sprint 3).
                </span>
                <Link to="/blog" className="underline font-semibold hover:text-accent">
                  View archive
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-7">
                {fallbackArticles.map((article) => (
                  <article
                    key={article.id}
                    className="card-hover bg-white p-6 flex flex-col justify-between border-border/80"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <Badge variant="teal">{article.category}</Badge>
                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3 text-text-muted" aria-hidden="true" />
                          <span>{article.readingTime}</span>
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-primary mb-2 line-clamp-2">
                        <Link to={`/blog/${article.slug}`} className="hover:text-accent transition-colors">
                          {article.title}
                        </Link>
                      </h3>
                      <p className="text-text-muted text-xs sm:text-sm leading-relaxed mb-4 line-clamp-3">
                        {article.excerpt}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        <span>{article.publishedAt}</span>
                      </span>
                      <Link
                        to={`/blog/${article.slug}`}
                        className="font-semibold text-accent hover:underline flex items-center gap-1"
                      >
                        Read Article <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 10: BECOME A PARTNER CTA
         ========================================================================= */}
      <section
        className="section-padding bg-primary-900 text-white border-t border-primary-700/60 relative overflow-hidden"
        aria-labelledby="partner-cta-heading"
      >
        <div className="container-max text-center max-w-3xl mx-auto relative z-10">
          <span className="inline-block text-xs font-bold tracking-wider text-accent-400 uppercase mb-3">
            Service Provider Partnership
          </span>
          <h2
            id="partner-cta-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4"
          >
            Are You a Service Provider?
          </h2>
          <p className="text-blue-100/90 text-sm sm:text-base md:text-lg leading-relaxed mb-8 max-w-2xl mx-auto font-normal">
            Grow your business with Dealsathi. Connect with high-intent customer enquiries and verified project introductions across India.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link to="/become-a-partner" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full sm:w-auto">
                <span>Become a Partner</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/contact" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto bg-transparent text-white border-white hover:bg-white hover:text-primary">
                <span>Talk to Partnerships Desk</span>
              </Button>
            </Link>
          </div>
          <p className="text-[11px] text-blue-200/70 mt-6">
            Zero upfront onboarding fees • Commission on completed deals only under written provider terms
          </p>
        </div>
      </section>
    </div>
  );
}
