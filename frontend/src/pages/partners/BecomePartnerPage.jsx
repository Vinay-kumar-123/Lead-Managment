import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { useCategories } from '../../hooks/useCategories.js';
import { useProviderAuth } from '../../context/ProviderAuthContext.jsx';
import providerPortalService from '../../services/providerPortalService.js';
import Breadcrumb from '../../components/common/Breadcrumb.jsx';
import BrandLogo from '../../components/common/BrandLogo.jsx';
import Alert from '../../components/common/Alert.jsx';
import GoogleSignInButton from '../../components/provider/GoogleSignInButton.jsx';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  ArrowRight,
  Building2,
  Lock,
  Sparkles,
  FileCheck2,
  Upload,
  X,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  Save,
  Layers,
  MapPin,
  UserCheck,
} from 'lucide-react';

export default function BecomePartnerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { categories, getCategoryBySlug } = useCategories();
  const {
    account,
    provider,
    isAuthenticated,
    onboardingCompleted,
    isLoading: authLoading,
    updateProviderContext,
    logoutProvider,
  } = useProviderAuth();

  const [authError, setAuthError] = useState('');
  const [draftSavedNotice, setDraftSavedNotice] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [formData, setFormData] = useState({
    businessName: '',
    contactPerson: '',
    phone: '',
    category: '',
    subcategory: '',
    servicesOffered: '',
    city: '',
    state: '',
    address: '',
    pinCode: '',
    serviceAreas: '',
    website: '',
    experienceYears: '',
    businessDescription: '',
    consentToContact: true,
    consentToDisplayPhone: true,
  });

  const [shopImageFile, setShopImageFile] = useState(null);
  const [shopImagePreview, setShopImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  usePageMeta({
    title: 'Become a Partner — Provider Onboarding & Google Sign-In — Dealsathi',
    description:
      'Sign in with Google to onboard your business on Dealsathi. Manage your service packages, listings, and customer enquiries from a unified Provider Dashboard.',
    canonical: 'https://dealsathi.in/become-a-partner',
  });

  // Redirect returning providers who already completed onboarding directly to their Provider Dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated && onboardingCompleted && provider) {
      navigate('/provider/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, onboardingCompleted, provider, navigate]);

  // Hydrate form from authenticated Google account and any saved onboardingDraft
  useEffect(() => {
    if (account && !onboardingCompleted) {
      const draft = account.onboardingDraft || {};
      setFormData((prev) => ({
        ...prev,
        businessName: draft.businessName || prev.businessName || '',
        contactPerson: draft.contactPerson || prev.contactPerson || account.name || '',
        phone: draft.phone || prev.phone || '',
        category: draft.category || prev.category || '',
        subcategory: draft.subcategory || prev.subcategory || '',
        servicesOffered: draft.servicesOffered || prev.servicesOffered || '',
        city: draft.city || prev.city || '',
        state: draft.state || prev.state || '',
        address: draft.address || prev.address || '',
        pinCode: draft.pinCode || prev.pinCode || '',
        serviceAreas: draft.serviceAreas || prev.serviceAreas || '',
        website: draft.website || prev.website || '',
        experienceYears:
          draft.experienceYears !== undefined ? String(draft.experienceYears) : prev.experienceYears,
        businessDescription: draft.businessDescription || prev.businessDescription || '',
        consentToDisplayPhone:
          draft.consentToDisplayPhone !== undefined
            ? Boolean(draft.consentToDisplayPhone)
            : prev.consentToDisplayPhone,
      }));
    }
  }, [account, onboardingCompleted]);

  const handleGoogleSuccess = (result) => {
    setAuthError('');
    if (result?.onboardingCompleted && result?.provider) {
      navigate('/provider/dashboard', { replace: true });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };
      // Reset subcategory when main category changes
      if (name === 'category' && value !== prev.category) {
        next.subcategory = '';
      }
      return next;
    });

    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (draftSavedNotice) setDraftSavedNotice('');
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        shopImage: 'Please upload a valid image file (JPEG, PNG, or WebP).',
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        shopImage: 'Image size exceeds 5MB. Please choose a smaller photo.',
      }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next.shopImage;
      return next;
    });

    setShopImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setShopImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setShopImageFile(null);
    setShopImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft) return;
    setIsSavingDraft(true);
    setDraftSavedNotice('');
    try {
      await providerPortalService.saveOnboardingDraft(formData);
      setDraftSavedNotice('Onboarding progress saved to your Google account.');
    } catch (err) {
      setSubmitError(err.message || 'Could not save draft progress.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const validateForm = () => {
    const errs = {};

    if (!formData.businessName.trim() || formData.businessName.trim().length < 2) {
      errs.businessName = 'Business or enterprise name is required (at least 2 characters)';
    }

    if (!formData.contactPerson.trim()) {
      errs.contactPerson = 'Authorized contact person name is required';
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.phone = 'Valid 10-digit Indian mobile number is required';
    }

    if (!formData.category.trim()) {
      errs.category = 'Please select one of the 5 established main categories';
    }

    if (!formData.subcategory.trim()) {
      errs.subcategory = 'Please select your primary subcategory specialization';
    }

    if (!formData.servicesOffered.trim()) {
      errs.servicesOffered = 'Please list or select at least one service you provide';
    }

    if (!formData.city.trim()) {
      errs.city = 'Operating headquarters city is required';
    }

    if (!formData.businessDescription.trim() || formData.businessDescription.trim().length < 15) {
      errs.businessDescription = 'Please provide a business overview (at least 15 characters)';
    }

    if (formData.pinCode && !/^\d{6}$/.test(formData.pinCode.trim())) {
      errs.pinCode = 'PIN code must be exactly 6 digits';
    }

    if (!formData.consentToContact) {
      errs.consentToContact = 'You must authorize our onboarding team to verify your profile';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('businessName', formData.businessName.trim());
      payload.append('contactPerson', formData.contactPerson.trim());
      payload.append('phone', formData.phone.replace(/\D/g, ''));
      payload.append('category', formData.category.trim());
      payload.append('subcategory', formData.subcategory.trim());
      payload.append('servicesOffered', formData.servicesOffered.trim());
      payload.append('city', formData.city.trim());
      payload.append('state', formData.state.trim());
      payload.append('address', formData.address.trim());
      payload.append('pinCode', formData.pinCode.trim());
      payload.append('serviceAreas', formData.serviceAreas.trim());
      payload.append('website', formData.website.trim());
      if (formData.experienceYears !== '') {
        payload.append('experienceYears', String(formData.experienceYears).trim());
      }
      payload.append('businessDescription', formData.businessDescription.trim());
      payload.append('consentToContact', formData.consentToContact ? 'true' : 'false');
      payload.append('consentToDisplayPhone', formData.consentToDisplayPhone ? 'true' : 'false');

      if (shopImageFile) {
        payload.append('shopImage', shopImageFile);
      }

      const response = await providerPortalService.completeOnboarding(payload);

      if (response && response.success && response.data) {
        updateProviderContext({
          account: response.data.account,
          provider: response.data.provider,
        });
        navigate('/provider/dashboard', { replace: true });
      } else {
        setSubmitError(
          response?.message || 'We could not create your business profile. Please try again.'
        );
      }
    } catch (err) {
      // If profile already exists (409), sync session and redirect to dashboard
      if (err.status === 409) {
        navigate('/provider/dashboard', { replace: true });
        return;
      }
      setSubmitError(
        err.message || 'Unable to complete business profile creation. Please verify your fields.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMainCategory = formData.category ? getCategoryBySlug(formData.category) : null;
  const activeSubcategories = (selectedMainCategory?.subcategories || []).filter(
    (s) => s && s.isActive !== false
  );

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Become a Partner', href: null },
  ];

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-text-muted">
          Checking provider session...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen pb-16">
      {/* Top Hero Banner */}
      <section className="bg-gradient-to-r from-primary-900 via-primary to-primary-800 text-white py-10 md:py-14 border-b border-primary-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb items={breadcrumbItems} className="mb-5 text-blue-200" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-accent/20 text-accent-300 mb-3 border border-accent/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Dealsathi Verified Provider Ecosystem</span>
              </span>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white mb-3">
                {!isAuthenticated
                  ? 'Partner with Dealsathi & Grow Your Business'
                  : 'Complete Your Dealsathi Business Profile'}
              </h1>
              <p className="text-sm sm:text-base text-blue-100/90 leading-relaxed">
                {!isAuthenticated
                  ? 'Sign in with your Google account to create your business profile, publish service packages, and manage verified customer enquiries from your dedicated Provider Dashboard.'
                  : 'You are signed in with Google. Complete your business profile below to unlock your Dealsathi Provider Dashboard.'}
              </p>
            </div>

            {/* Step Progress Indicator */}
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center ${
                    !isAuthenticated
                      ? 'bg-accent text-white ring-4 ring-accent/30'
                      : 'bg-emerald-500 text-white'
                  }`}
                >
                  {isAuthenticated ? '✓' : '1'}
                </span>
                <div className="text-xs">
                  <span className="font-bold text-white block">Google Sign-In</span>
                  <span className="text-[10px] text-blue-200">
                    {isAuthenticated ? 'Verified' : 'Current Step'}
                  </span>
                </div>
              </div>

              <div className="w-6 h-px bg-white/25" />

              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center ${
                    isAuthenticated && !onboardingCompleted
                      ? 'bg-accent text-white ring-4 ring-accent/30'
                      : onboardingCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/15 text-blue-200'
                  }`}
                >
                  2
                </span>
                <div className="text-xs">
                  <span className="font-bold text-white block">Business Profile</span>
                  <span className="text-[10px] text-blue-200">
                    {isAuthenticated ? 'In Progress' : 'Next'}
                  </span>
                </div>
              </div>

              <div className="w-6 h-px bg-white/25 hidden sm:block" />

              <div className="hidden sm:flex items-center gap-2">
                <span className="w-7 h-7 rounded-full text-xs font-extrabold bg-white/15 text-blue-200 flex items-center justify-center">
                  3
                </span>
                <div className="text-xs">
                  <span className="font-bold text-white block">Dashboard</span>
                  <span className="text-[10px] text-blue-200">Manage Listings</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {!isAuthenticated ? (
          /* =========================================================================
             STEP 1 & 2: PROVIDER AUTHENTICATION GATE ("CONTINUE WITH GOOGLE")
             ========================================================================= */
          <div
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            data-testid="provider-auth-step"
          >
            {/* Left / Center Authentication Card (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-border shadow-card p-6 sm:p-10">
              <div className="max-w-md mx-auto text-center">
                <div className="inline-flex items-center justify-center mb-5">
                  <BrandLogo variant="header" showWordmark={true} showTagline={false} />
                </div>

                <span className="text-xs font-extrabold uppercase tracking-widest text-accent block mb-1.5">
                  Provider Portal Access
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-primary tracking-tight mb-2.5">
                  Sign in or Register as a Partner
                </h2>
                <p className="text-xs sm:text-sm text-text-muted leading-relaxed mb-8">
                  Continue with your verified Google account. New partners will be guided to set up their business profile; returning partners go straight to their Provider Dashboard.
                </p>

                {authError && (
                  <div className="mb-6 text-left">
                    <Alert type="error" title="Authentication Error" message={authError} />
                  </div>
                )}

                {/* Continue with Google Button */}
                <GoogleSignInButton
                  buttonText="Continue with Google"
                  onSuccess={handleGoogleSuccess}
                  onError={(msg) => setAuthError(msg)}
                />

                <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-3 gap-3 text-left">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <ShieldCheck className="w-4 h-4 text-primary mb-1" />
                    <span className="text-[11px] font-bold text-primary block">
                      One-Click Sign In
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Verified via Google Identity
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <Layers className="w-4 h-4 text-accent mb-1" />
                    <span className="text-[11px] font-bold text-primary block">
                      5 Core Verticals
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Pan-India service taxonomy
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <LayoutDashboard className="w-4 h-4 text-emerald-600 mb-1" />
                    <span className="text-[11px] font-bold text-primary block">
                      SaaS Dashboard
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Manage services & leads
                    </span>
                  </div>
                </div>

                <p className="mt-6 text-[11px] text-text-muted leading-relaxed">
                  By continuing with Google, you agree to Dealsathi&apos;s{' '}
                  <Link to="/terms" className="text-primary font-semibold underline">
                    Partner Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy-policy" className="text-primary font-semibold underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* Right Column: How Dealsathi Partner Onboarding Works (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white rounded-2xl p-6 sm:p-7 border border-border shadow-card">
                <h3 className="text-base font-extrabold text-primary mb-4 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-accent" />
                  <span>Your Dealsathi Provider Journey</span>
                </h3>

                <ol className="space-y-4 text-xs">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-white font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <strong className="font-bold text-primary block">
                        Continue with Google
                      </strong>
                      <span className="text-text-muted leading-relaxed">
                        Authenticate securely with your Google account. Returning providers are automatically signed in to their existing dashboard.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent text-white font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <strong className="font-bold text-primary block">
                        Create Your Business Profile
                      </strong>
                      <span className="text-text-muted leading-relaxed">
                        Select your primary Dealsathi vertical and subcategory, add your operating city, and upload your establishment photo.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <strong className="font-bold text-primary block">
                        Manage Services & Enquiries in Dashboard
                      </strong>
                      <span className="text-text-muted leading-relaxed">
                        Publish service packages, track approval status, and respond to verified customer enquiries from your Provider Dashboard.
                      </span>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="bg-primary-900 text-white rounded-2xl p-6 border border-primary-800">
                <div className="flex items-center gap-2 text-accent-300 text-xs font-bold uppercase tracking-wider mb-2">
                  <FileCheck2 className="w-4 h-4" />
                  <span>5 Canonical Marketplace Categories</span>
                </div>
                <p className="text-xs text-blue-100/90 leading-relaxed mb-3">
                  Dealsathi connects verified service providers with customers across:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <span
                      key={cat.slug}
                      className="text-[11px] font-semibold bg-white/10 text-white px-2.5 py-1 rounded-lg border border-white/15"
                    >
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             STEP 3: AUTHENTICATED BUSINESS PROFILE CREATION FORM
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" data-testid="business-profile-step">
            <div className="lg:col-span-8">
              {/* Authenticated Google Identity Bar */}
              <div className="mb-6 bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                    {(account?.name || account?.email || 'P')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-primary">
                        {account?.name || 'Verified Google Account'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Google Verified
                      </span>
                    </div>
                    <span className="text-xs text-text-muted font-mono block">
                      {account?.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSavingDraft || isSubmitting}
                    data-testid="save-onboarding-draft-btn"
                    className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-primary text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingDraft ? 'Saving...' : 'Save Progress'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={logoutProvider}
                    disabled={isSubmitting}
                    className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {draftSavedNotice && (
                <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{draftSavedNotice}</span>
                </div>
              )}

              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-border shadow-card">
                {submitError && (
                  <Alert
                    type="error"
                    title="Profile Creation Notice"
                    message={submitError}
                    className="mb-6"
                  />
                )}

                <form onSubmit={handleSubmit} className="space-y-8" noValidate>
                  {/* 1. Business Identity & Category Taxonomy */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-primary mb-4 pb-2 border-b border-border/60 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accent-50 text-accent text-xs font-extrabold flex items-center justify-center">
                        1
                      </span>
                      <span>Business Identity & Service Category</span>
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {/* Business Name */}
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="partner-businessName"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Enterprise or Firm Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="partner-businessName"
                          name="businessName"
                          type="text"
                          value={formData.businessName}
                          onChange={handleChange}
                          placeholder="e.g. Skyline Architecture & Turnkey Interiors LLP"
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white transition-colors ${
                            errors.businessName
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        {errors.businessName && (
                          <p className="mt-1 text-xs text-red-600">{errors.businessName}</p>
                        )}
                      </div>

                      {/* Primary Category (5 Established Main Categories) */}
                      <div>
                        <label
                          htmlFor="partner-category"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Main Marketplace Category <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="partner-category"
                          name="category"
                          value={formData.category}
                          onChange={handleChange}
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white transition-colors cursor-pointer ${
                            errors.category
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        >
                          <option value="">Select main category (5 verticals)</option>
                          {categories.map((c) => (
                            <option key={c.id || c.slug} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {errors.category && (
                          <p className="mt-1 text-xs text-red-600">{errors.category}</p>
                        )}
                      </div>

                      {/* Dynamic Subcategory Selector */}
                      <div>
                        <label
                          htmlFor="partner-subcategory"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Primary Subcategory <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="partner-subcategory"
                          name="subcategory"
                          value={formData.subcategory}
                          onChange={(e) => {
                            const chosenSub = e.target.value;
                            handleChange(e);
                            // Also auto-add chosen subcategory to servicesOffered if empty
                            if (chosenSub && !formData.servicesOffered.trim()) {
                              setFormData((prev) => ({
                                ...prev,
                                subcategory: chosenSub,
                                servicesOffered: chosenSub,
                              }));
                            }
                          }}
                          disabled={!formData.category}
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white transition-colors cursor-pointer disabled:opacity-60 ${
                            errors.subcategory
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        >
                          <option value="">
                            {formData.category
                              ? `Select ${selectedMainCategory?.name || ''} subcategory`
                              : 'Select main category first'}
                          </option>
                          {activeSubcategories.map((sub) => (
                            <option key={sub.id || sub.slug} value={sub.name}>
                              {sub.name}
                            </option>
                          ))}
                        </select>
                        {errors.subcategory && (
                          <p className="mt-1 text-xs text-red-600">{errors.subcategory}</p>
                        )}
                      </div>

                      {/* Specific Services Offered */}
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="partner-servicesOffered"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Services & Packages Offered <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="partner-servicesOffered"
                          name="servicesOffered"
                          type="text"
                          value={formData.servicesOffered}
                          onChange={handleChange}
                          placeholder="e.g. Modular Kitchens, Turnkey 2BHK/3BHK Interiors, 3D Space Planning"
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white transition-colors ${
                            errors.servicesOffered
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        {errors.servicesOffered && (
                          <p className="mt-1 text-xs text-red-600">{errors.servicesOffered}</p>
                        )}
                      </div>

                      {/* Subcategory Quick-Select Pills */}
                      {formData.category && activeSubcategories.length > 0 && (
                        <div className="sm:col-span-2 bg-slate-50/80 p-3.5 rounded-xl border border-border/80">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block mb-2">
                            Click to include subcategories under {selectedMainCategory?.name}:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {activeSubcategories.map((sub) => {
                              const currentServices = formData.servicesOffered
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean);
                              const isSelected = currentServices.some(
                                (item) => item.toLowerCase() === sub.name.toLowerCase()
                              );

                              return (
                                <button
                                  key={sub.id || sub.slug}
                                  type="button"
                                  onClick={() => {
                                    const nextServices = isSelected
                                      ? currentServices.filter(
                                          (item) => item.toLowerCase() !== sub.name.toLowerCase()
                                        )
                                      : [...currentServices, sub.name];
                                    setFormData((prev) => ({
                                      ...prev,
                                      subcategory: prev.subcategory || sub.name,
                                      servicesOffered: nextServices.join(', '),
                                    }));
                                    if (errors.servicesOffered) {
                                      setErrors((prev) => {
                                        const next = { ...prev };
                                        delete next.servicesOffered;
                                        return next;
                                      });
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-primary text-white border-primary'
                                      : 'bg-white text-text-primary border-border hover:border-accent'
                                  }`}
                                >
                                  {isSelected ? `✓ ${sub.name}` : `+ ${sub.name}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Shop / Business Establishment Image */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-primary mb-2 pb-2 border-b border-border/60 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accent-50 text-accent text-xs font-extrabold flex items-center justify-center">
                        2
                      </span>
                      <span>Business / Establishment Photo</span>
                    </h2>
                    <p className="text-xs text-text-muted mb-4">
                      Upload a photo of your office, studio, shop facade, or work showcase (JPEG, PNG, WebP — Max 5MB).
                    </p>

                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center relative">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        id="partner-shop-image-input"
                      />

                      {shopImagePreview ? (
                        <div className="flex flex-col sm:flex-row items-center gap-5 justify-center">
                          <div className="relative">
                            <img
                              src={shopImagePreview}
                              alt="Shop Preview"
                              className="w-36 h-28 object-cover rounded-lg border border-border shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveImage}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow"
                              title="Remove photo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-left text-xs space-y-1">
                            <p className="font-semibold text-primary truncate max-w-xs">
                              {shopImageFile?.name}
                            </p>
                            <p className="text-text-muted">
                              Size: {(shopImageFile?.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs text-accent hover:underline font-semibold"
                            >
                              Replace photo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="cursor-pointer space-y-2"
                        >
                          <div className="w-11 h-11 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-accent hover:underline">
                              Click to choose establishment photo
                            </span>
                            <span className="text-xs text-text-muted block mt-0.5">
                              JPG, PNG, or WebP up to 5MB
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    {errors.shopImage && (
                      <p className="mt-1.5 text-xs text-red-600">{errors.shopImage}</p>
                    )}
                  </div>

                  {/* 3. Contact & Experience */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-primary mb-4 pb-2 border-b border-border/60 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accent-50 text-accent text-xs font-extrabold flex items-center justify-center">
                        3
                      </span>
                      <span>Contact Person & Credentials</span>
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <label
                          htmlFor="partner-contactPerson"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Contact Person <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="partner-contactPerson"
                          name="contactPerson"
                          type="text"
                          value={formData.contactPerson}
                          onChange={handleChange}
                          placeholder="e.g. Anand Kulkarni"
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white ${
                            errors.contactPerson
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        {errors.contactPerson && (
                          <p className="mt-1 text-xs text-red-600">{errors.contactPerson}</p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="partner-phone"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Direct Mobile Number <span className="text-red-500">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-xs text-text-muted font-medium pointer-events-none">
                            +91
                          </span>
                          <input
                            id="partner-phone"
                            name="phone"
                            type="tel"
                            maxLength={10}
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="98XXXXXXXX"
                            className={`w-full pl-11 pr-3 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white ${
                              errors.phone
                                ? 'border-red-500 bg-red-50/20'
                                : 'border-border focus:border-primary'
                            }`}
                          />
                        </div>
                        {errors.phone && (
                          <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="partner-experienceYears"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Years in Business
                        </label>
                        <input
                          id="partner-experienceYears"
                          name="experienceYears"
                          type="number"
                          min={0}
                          max={100}
                          value={formData.experienceYears}
                          onChange={handleChange}
                          placeholder="e.g. 8"
                          className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-border rounded-xl text-primary focus:outline-none focus:border-primary focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Location & Operating Scope */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-primary mb-4 pb-2 border-b border-border/60 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accent-50 text-accent text-xs font-extrabold flex items-center justify-center">
                        4
                      </span>
                      <span>Location & Coverage Areas</span>
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <label
                          htmlFor="partner-city"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          City <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="partner-city"
                          name="city"
                          type="text"
                          value={formData.city}
                          onChange={handleChange}
                          placeholder="e.g. Pune, Mumbai, Bengaluru"
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white ${
                            errors.city
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
                      </div>

                      <div>
                        <label
                          htmlFor="partner-state"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          State
                        </label>
                        <input
                          id="partner-state"
                          name="state"
                          type="text"
                          value={formData.state}
                          onChange={handleChange}
                          placeholder="e.g. Maharashtra"
                          className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-border rounded-xl text-primary focus:outline-none focus:border-primary focus:bg-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="partner-pinCode"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          PIN Code
                        </label>
                        <input
                          id="partner-pinCode"
                          name="pinCode"
                          type="text"
                          maxLength={6}
                          value={formData.pinCode}
                          onChange={handleChange}
                          placeholder="e.g. 411045"
                          className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white ${
                            errors.pinCode
                              ? 'border-red-500 bg-red-50/20'
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        {errors.pinCode && (
                          <p className="mt-1 text-xs text-red-600">{errors.pinCode}</p>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="partner-address"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Business / Office Address
                        </label>
                        <input
                          id="partner-address"
                          name="address"
                          type="text"
                          value={formData.address}
                          onChange={handleChange}
                          placeholder="Office 402, Commercial Chambers, Main Road"
                          className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-border rounded-xl text-primary focus:outline-none focus:border-primary focus:bg-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="partner-serviceAreas"
                          className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                        >
                          Service Localities
                        </label>
                        <input
                          id="partner-serviceAreas"
                          name="serviceAreas"
                          type="text"
                          value={formData.serviceAreas}
                          onChange={handleChange}
                          placeholder="Baner, Kothrud, Wakad"
                          className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-border rounded-xl text-primary focus:outline-none focus:border-primary focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5. Business Description */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-primary mb-4 pb-2 border-b border-border/60 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accent-50 text-accent text-xs font-extrabold flex items-center justify-center">
                        5
                      </span>
                      <span>Business Description & Specializations</span>
                    </h2>

                    <div>
                      <label
                        htmlFor="partner-businessDescription"
                        className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5"
                      >
                        Company Profile & Experience <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="partner-businessDescription"
                        name="businessDescription"
                        rows={4}
                        value={formData.businessDescription}
                        onChange={handleChange}
                        placeholder="Describe your company specialization, team expertise, past projects, and quality standards (at least 15 characters)..."
                        className={`w-full p-3.5 text-sm bg-slate-50 border rounded-xl text-primary focus:outline-none focus:bg-white ${
                          errors.businessDescription
                            ? 'border-red-500 bg-red-50/20'
                            : 'border-border focus:border-primary'
                        }`}
                      />
                      {errors.businessDescription && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.businessDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 6. Consents */}
                  <div className="bg-slate-50/70 p-5 rounded-xl border border-border/80 space-y-3">
                    <div className="flex items-start gap-3">
                      <input
                        id="partner-consentToDisplayPhone"
                        name="consentToDisplayPhone"
                        type="checkbox"
                        checked={formData.consentToDisplayPhone}
                        onChange={handleChange}
                        className="w-4 h-4 text-accent border-border rounded mt-0.5 cursor-pointer"
                      />
                      <label
                        htmlFor="partner-consentToDisplayPhone"
                        className="text-xs text-text-primary leading-relaxed cursor-pointer"
                      >
                        <strong>Public Phone Visibility:</strong> Display my business phone number on my public profile once verified and published.
                      </label>
                    </div>

                    <div className="flex items-start gap-3">
                      <input
                        id="partner-consentToContact"
                        name="consentToContact"
                        type="checkbox"
                        checked={formData.consentToContact}
                        onChange={handleChange}
                        className="w-4 h-4 text-accent border-border rounded mt-0.5 cursor-pointer"
                      />
                      <label
                        htmlFor="partner-consentToContact"
                        className="text-xs text-text-primary leading-relaxed cursor-pointer"
                      >
                        <strong>Verification Authorization:</strong> I confirm that the business details above are accurate and authorize Dealsathi to review my profile. <span className="text-red-500">*</span>
                      </label>
                    </div>
                    {errors.consentToContact && (
                      <p className="text-xs text-red-600 pl-7">{errors.consentToContact}</p>
                    )}
                  </div>

                  {/* Submit Action */}
                  <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border/80">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      data-testid="complete-onboarding-submit-btn"
                      className="btn-primary w-full sm:w-auto py-3.5 px-8 text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Creating Business Profile...</span>
                        </>
                      ) : (
                        <>
                          <span>Complete Profile & Launch Dashboard</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Sidebar Info (4 cols) */}
            <div className="lg:col-span-4 space-y-5">
              <div className="bg-white rounded-2xl p-6 border border-border shadow-card">
                <h3 className="text-sm font-extrabold text-primary uppercase tracking-wider mb-3">
                  What Happens After Profile Creation?
                </h3>
                <ul className="space-y-3 text-xs text-text-muted leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Instant Dashboard Access:</strong> You are immediately redirected to your Dealsathi Provider Dashboard.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Service & Package Management:</strong> Add and customize your service offerings, pricing models, and deliverables.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Quality Verification:</strong> Our operations team verifies your business credentials to activate your public badge.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
