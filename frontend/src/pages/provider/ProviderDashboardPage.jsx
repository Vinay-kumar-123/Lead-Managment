import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { useCategories } from '../../hooks/useCategories.js';
import { useProviderAuth } from '../../context/ProviderAuthContext.jsx';
import providerPortalService from '../../services/providerPortalService.js';
import BrandLogo from '../../components/common/BrandLogo.jsx';
import {
  LayoutDashboard,
  Building2,
  Package,
  ListFilter,
  MessageSquareText,
  Settings,
  LogOut,
  Plus,
  Search,
  Edit3,
  Eye,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Menu,
  X,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Sparkles,
  Upload,
  Save,
  RefreshCw,
  Layers,
  Tag,
  IndianRupee,
  Calendar,
} from 'lucide-react';

const PRICING_MODELS = [
  { value: 'custom_quote', label: 'Custom Quote (Scope Based)' },
  { value: 'starting_from', label: 'Starting From (Base Rate)' },
  { value: 'fixed_package', label: 'Fixed Package Price' },
  { value: 'hourly', label: 'Hourly Consultation Rate' },
  { value: 'per_sqft', label: 'Per Sq.Ft. Rate' },
];

export default function ProviderDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const { categories, getCategoryBySlug } = useCategories();
  const {
    account,
    provider,
    updateProviderContext,
    logoutProvider,
  } = useProviderAuth();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: '' }

  // Dashboard state from real backend DB queries
  const [stats, setStats] = useState({
    totalServices: 0,
    activeServices: 0,
    pendingApproval: 0,
    approvedServices: 0,
    rejectedServices: 0,
    draftServices: 0,
    totalEnquiries: 0,
  });
  const [services, setServices] = useState([]);
  const [enquiries, setEnquiries] = useState([]);

  // Service filtering states
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');

  // Service Create / Edit / View Modal states
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceModalMode, setServiceModalMode] = useState('create'); // 'create' | 'edit'
  const [editingService, setEditingService] = useState(null);
  const [viewingService, setViewingService] = useState(null);
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  const [serviceFormError, setServiceFormError] = useState('');
  const [serviceFieldErrors, setServiceFieldErrors] = useState({});
  const [deletingServiceId, setDeletingServiceId] = useState(null);

  const [serviceForm, setServiceForm] = useState({
    title: '',
    categorySlug: '',
    subcategory: '',
    pricingModel: 'custom_quote',
    priceLabel: 'Custom Quote',
    priceAmount: '',
    estimatedDuration: '',
    deliverables: '',
    serviceAreas: '',
    description: '',
  });

  // Business Profile Edit Form state
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    providerName: '',
    contactNumber: '',
    categorySlug: '',
    subcategory: '',
    services: '',
    city: '',
    state: '',
    address: '',
    pinCode: '',
    serviceAreas: '',
    website: '',
    experienceYears: '',
    description: '',
    consentToDisplayPhone: true,
  });
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const profileFileInputRef = useRef(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});

  usePageMeta({
    title: `${provider?.businessName || 'Provider'} — Partner Dashboard — Dealsathi`,
    description:
      'Manage your Dealsathi business profile, service packages, listings, and customer enquiries.',
  });

  const hydrateProfileForm = useCallback((prov) => {
    if (!prov) return;
    setProfileForm({
      businessName: prov.businessName || '',
      providerName: prov.providerName || '',
      contactNumber: prov.contactNumber || '',
      categorySlug: prov.categorySlug || '',
      subcategory: prov.subcategory || '',
      services: Array.isArray(prov.services) ? prov.services.join(', ') : '',
      city: prov.city || '',
      state: prov.state || '',
      address: prov.address || '',
      pinCode: prov.pinCode || '',
      serviceAreas: Array.isArray(prov.serviceAreas) ? prov.serviceAreas.join(', ') : '',
      website: prov.website || '',
      experienceYears:
        typeof prov.experienceYears === 'number' ? String(prov.experienceYears) : '',
      description: prov.description || '',
      consentToDisplayPhone: prov.consentToDisplayPhone !== false,
    });
  }, []);

  const fetchDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setIsLoading(true);
      setDashboardError('');

      try {
        const [dashRes, svcRes, enqRes] = await Promise.all([
          providerPortalService.getDashboard(),
          providerPortalService.getServices(),
          providerPortalService.getEnquiries(),
        ]);

        if (dashRes?.success && dashRes?.data) {
          const d = dashRes.data;
          if (d.stats) setStats(d.stats);
          if (d.provider) {
            updateProviderContext({
              account: d.account,
              provider: d.provider,
            });
            hydrateProfileForm(d.provider);
          }
        }

        if (svcRes?.success && Array.isArray(svcRes?.data?.services)) {
          setServices(svcRes.data.services);
        } else if (dashRes?.data?.recentServices) {
          setServices(dashRes.data.recentServices);
        }

        if (enqRes?.success && Array.isArray(enqRes?.data?.enquiries)) {
          setEnquiries(enqRes.data.enquiries);
        } else if (dashRes?.data?.recentEnquiries) {
          setEnquiries(dashRes.data.recentEnquiries);
        }
      } catch (err) {
        setDashboardError(err.message || 'Unable to load dashboard data.');
      } finally {
        setIsLoading(false);
      }
    },
    [updateProviderContext, hydrateProfileForm]
  );

  useEffect(() => {
    if (provider) {
      hydrateProfileForm(provider);
    }
    fetchDashboardData();
  }, [fetchDashboardData]);

  const setTab = (tabName) => {
    setMobileSidebarOpen(false);
    setSearchParams({ tab: tabName });
  };

  const handleLogout = async () => {
    await logoutProvider();
    navigate('/become-a-partner', { replace: true });
  };

  // Filtered services for Services & Manage Listings views
  const filteredServices = useMemo(() => {
    return services.filter((svc) => {
      if (serviceStatusFilter !== 'all') {
        const f = serviceStatusFilter.toUpperCase();
        if (['PENDING', 'APPROVED', 'REJECTED'].includes(f) && svc.approvalStatus !== f) {
          return false;
        }
        if (['PUBLISHED', 'DRAFT'].includes(f) && svc.publicationStatus !== f) {
          return false;
        }
      }
      if (serviceSearch.trim()) {
        const q = serviceSearch.trim().toLowerCase();
        const matchTitle = String(svc.title || '').toLowerCase().includes(q);
        const matchCat = String(svc.category || '').toLowerCase().includes(q);
        const matchSub = String(svc.subcategory || '').toLowerCase().includes(q);
        const matchDesc = String(svc.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchCat && !matchSub && !matchDesc) {
          return false;
        }
      }
      return true;
    });
  }, [services, serviceStatusFilter, serviceSearch]);

  // Open Create Service Modal
  const handleOpenCreateServiceModal = () => {
    const defaultCategorySlug =
      provider?.categorySlug || categories[0]?.slug || 'home-construction';
    const mainCat = getCategoryBySlug(defaultCategorySlug);
    const defaultSub =
      provider?.subcategory || mainCat?.subcategories?.[0]?.name || '';

    setServiceModalMode('create');
    setEditingService(null);
    setServiceForm({
      title: '',
      categorySlug: defaultCategorySlug,
      subcategory: defaultSub,
      pricingModel: 'custom_quote',
      priceLabel: 'Custom Quote',
      priceAmount: '',
      estimatedDuration: '',
      deliverables: '',
      serviceAreas: Array.isArray(provider?.serviceAreas)
        ? provider.serviceAreas.join(', ')
        : provider?.city || '',
      description: '',
    });
    setServiceFieldErrors({});
    setServiceFormError('');
    setServiceModalOpen(true);
  };

  // Open Edit Service Modal
  const handleOpenEditServiceModal = (svc) => {
    setServiceModalMode('edit');
    setEditingService(svc);
    setServiceForm({
      title: svc.title || '',
      categorySlug: svc.categorySlug || provider?.categorySlug || '',
      subcategory: svc.subcategory || '',
      pricingModel: svc.pricingModel || 'custom_quote',
      priceLabel: svc.priceLabel || 'Custom Quote',
      priceAmount: svc.priceAmount !== null && svc.priceAmount !== undefined ? String(svc.priceAmount) : '',
      estimatedDuration: svc.estimatedDuration || '',
      deliverables: Array.isArray(svc.deliverables) ? svc.deliverables.join(', ') : '',
      serviceAreas: Array.isArray(svc.serviceAreas) ? svc.serviceAreas.join(', ') : '',
      description: svc.description || '',
    });
    setServiceFieldErrors({});
    setServiceFormError('');
    setViewingService(null);
    setServiceModalOpen(true);
  };

  const handleServiceFormChange = (e) => {
    const { name, value } = e.target;
    setServiceForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'categorySlug' && value !== prev.categorySlug) {
        const nextCat = getCategoryBySlug(value);
        next.subcategory = nextCat?.subcategories?.[0]?.name || '';
      }
      return next;
    });

    if (serviceFieldErrors[name]) {
      setServiceFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (serviceFormError) setServiceFormError('');
  };

  const validateServiceForm = () => {
    const errs = {};
    if (!serviceForm.title.trim() || serviceForm.title.trim().length < 2) {
      errs.title = 'Service or package title is required (at least 2 characters)';
    }
    if (!serviceForm.categorySlug) {
      errs.categorySlug = 'Please select one of the 5 main categories';
    }
    if (!serviceForm.subcategory.trim()) {
      errs.subcategory = 'Please select a subcategory';
    }
    if (!serviceForm.description.trim() || serviceForm.description.trim().length < 10) {
      errs.description = 'Please describe the service scope (at least 10 characters)';
    }
    if (serviceForm.priceAmount !== '' && Number(serviceForm.priceAmount) < 0) {
      errs.priceAmount = 'Price amount cannot be negative';
    }
    setServiceFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleServiceSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingService) return;
    setServiceFormError('');

    if (!validateServiceForm()) return;

    setIsSubmittingService(true);
    try {
      const payload = {
        title: serviceForm.title.trim(),
        categorySlug: serviceForm.categorySlug,
        subcategory: serviceForm.subcategory.trim(),
        pricingModel: serviceForm.pricingModel,
        priceLabel:
          serviceForm.priceAmount !== ''
            ? `₹${Number(serviceForm.priceAmount).toLocaleString('en-IN')}`
            : serviceForm.priceLabel.trim() || 'Custom Quote',
        priceAmount:
          serviceForm.priceAmount !== '' ? Number(serviceForm.priceAmount) : null,
        estimatedDuration: serviceForm.estimatedDuration.trim(),
        deliverables: serviceForm.deliverables
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        serviceAreas: serviceForm.serviceAreas
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        description: serviceForm.description.trim(),
      };

      if (serviceModalMode === 'create') {
        const res = await providerPortalService.createService(payload);
        if (res?.success) {
          setFeedback({
            type: 'success',
            message: `Service "${res.data?.title || payload.title}" created successfully.`,
          });
          setServiceModalOpen(false);
          await fetchDashboardData({ silent: true });
        } else {
          setServiceFormError(res?.message || 'Failed to create service');
        }
      } else if (editingService) {
        const res = await providerPortalService.updateService(editingService._id, payload);
        if (res?.success) {
          setFeedback({
            type: 'success',
            message: `Service "${res.data?.title || payload.title}" updated successfully.`,
          });
          setServiceModalOpen(false);
          await fetchDashboardData({ silent: true });
        } else {
          setServiceFormError(res?.message || 'Failed to update service');
        }
      }
    } catch (err) {
      setServiceFormError(err.message || 'Error saving service.');
    } finally {
      setIsSubmittingService(false);
    }
  };

  const handleDeleteService = async (svc) => {
    if (deletingServiceId === svc._id) return;
    setDeletingServiceId(svc._id);
    setFeedback(null);
    try {
      const res = await providerPortalService.deleteService(svc._id);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Service "${svc.title}" removed from your listings.`,
        });
        await fetchDashboardData({ silent: true });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Could not remove service.',
      });
    } finally {
      setDeletingServiceId(null);
    }
  };

  // Business Profile Update Handlers
  const handleProfileChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfileForm((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };
      if (name === 'categorySlug' && value !== prev.categorySlug) {
        const cat = getCategoryBySlug(value);
        next.subcategory = cat?.subcategories?.[0]?.name || '';
      }
      return next;
    });
    if (profileErrors[name]) {
      setProfileErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleProfileImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileErrors((prev) => ({
        ...prev,
        shopImage: 'Please select a JPEG, PNG, or WebP image.',
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileErrors((prev) => ({
        ...prev,
        shopImage: 'Image exceeds 5MB limit.',
      }));
      return;
    }
    setProfileImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setProfileImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (isSavingProfile) return;

    const errs = {};
    if (!profileForm.businessName.trim() || profileForm.businessName.trim().length < 2) {
      errs.businessName = 'Business name is required';
    }
    if (!profileForm.providerName.trim()) {
      errs.providerName = 'Contact person name is required';
    }
    const cleanPhone = profileForm.contactNumber.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.contactNumber = 'Valid 10-digit Indian mobile number is required';
    }
    if (!profileForm.categorySlug) {
      errs.categorySlug = 'Main category is required';
    }
    if (!profileForm.city.trim()) {
      errs.city = 'Operating city is required';
    }
    if (!profileForm.description.trim() || profileForm.description.trim().length < 15) {
      errs.description = 'Description must be at least 15 characters';
    }

    if (Object.keys(errs).length > 0) {
      setProfileErrors(errs);
      return;
    }

    setIsSavingProfile(true);
    setFeedback(null);
    try {
      const payload = new FormData();
      payload.append('businessName', profileForm.businessName.trim());
      payload.append('providerName', profileForm.providerName.trim());
      payload.append('contactNumber', cleanPhone);
      payload.append('category', profileForm.categorySlug);
      payload.append('subcategory', profileForm.subcategory.trim());
      payload.append('services', profileForm.services.trim());
      payload.append('city', profileForm.city.trim());
      payload.append('state', profileForm.state.trim());
      payload.append('address', profileForm.address.trim());
      payload.append('pinCode', profileForm.pinCode.trim());
      payload.append('serviceAreas', profileForm.serviceAreas.trim());
      payload.append('website', profileForm.website.trim());
      if (profileForm.experienceYears !== '') {
        payload.append('experienceYears', String(profileForm.experienceYears).trim());
      }
      payload.append('description', profileForm.description.trim());
      payload.append(
        'consentToDisplayPhone',
        profileForm.consentToDisplayPhone ? 'true' : 'false'
      );

      if (profileImageFile) {
        payload.append('shopImage', profileImageFile);
      }

      const res = await providerPortalService.updateProfile(payload);
      if (res?.success && res?.data) {
        updateProviderContext({ provider: res.data });
        setProfileImageFile(null);
        setFeedback({
          type: 'success',
          message: 'Your business profile has been updated.',
        });
        await fetchDashboardData({ silent: true });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update business profile.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'Business Profile', icon: Building2 },
    { id: 'services', label: 'My Services / Packages', icon: Package, badge: stats.totalServices },
    { id: 'listings', label: 'Manage Listings', icon: ListFilter },
    { id: 'enquiries', label: 'Enquiries / Leads', icon: MessageSquareText, badge: stats.totalEnquiries },
    { id: 'settings', label: 'Account Settings', icon: Settings },
  ];

  const serviceModalCategory = serviceForm.categorySlug
    ? getCategoryBySlug(serviceForm.categorySlug)
    : null;
  const serviceModalSubcategories = (serviceModalCategory?.subcategories || []).filter(
    (s) => s.isActive !== false
  );

  const profileCategoryObj = profileForm.categorySlug
    ? getCategoryBySlug(profileForm.categorySlug)
    : null;
  const profileSubcategories = (profileCategoryObj?.subcategories || []).filter(
    (s) => s.isActive !== false
  );

  const completionPercentage = provider?.profileCompletion?.percentage ?? 80;

  return (
    <div
      className="min-h-screen bg-background flex flex-col lg:flex-row font-sans text-text-primary overflow-x-hidden"
      data-testid="provider-dashboard-page"
    >
      {/* Mobile Top Bar */}
      <header className="lg:hidden bg-primary-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-primary-800 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <BrandLogo variant="sidebar" showWordmark={true} showTagline={false} />
          <span className="text-[10px] uppercase font-bold text-accent-400 tracking-widest px-1.5 py-0.5 rounded bg-accent/20">
            Partner
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="p-2 text-slate-300 hover:text-white rounded-lg"
          aria-label={mobileSidebarOpen ? 'Close navigation' : 'Open navigation'}
        >
          {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Left Sidebar Navigation */}
      <aside
        className={`w-full lg:w-64 bg-primary-900 text-slate-200 flex flex-col justify-between shrink-0 z-20 ${
          mobileSidebarOpen ? 'block' : 'hidden lg:flex'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-primary-800/80 hidden lg:flex items-center justify-between">
            <Link to="/" className="group">
              <BrandLogo
                variant="sidebar"
                showWordmark={true}
                showTagline={true}
                subtitle="Provider Portal"
              />
            </Link>
          </div>

          {/* Business Identity Summary in Sidebar */}
          <div className="p-4 border-b border-primary-800/80">
            <div className="p-3.5 rounded-xl bg-primary-800/70 border border-primary-700/60">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-accent text-white font-black text-sm flex items-center justify-center shrink-0">
                  {(provider?.businessName || account?.name || 'D')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-white truncate">
                    {provider?.businessName || 'Dealsathi Partner'}
                  </div>
                  <div className="text-[11px] text-blue-200/80 truncate">
                    {provider?.category || 'Verified Account'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-2 border-t border-primary-700/60">
                <span className="text-blue-200/70 font-medium">Verification:</span>
                <span
                  className={`font-extrabold px-2 py-0.5 rounded-full ${
                    provider?.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : provider?.verificationStatus === 'REVOKED'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  }`}
                >
                  {provider?.verificationStatus === 'VERIFIED'
                    ? 'VERIFIED'
                    : provider?.verificationStatus === 'REVOKED'
                    ? 'ACTION NEEDED'
                    : 'PENDING REVIEW'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3.5 space-y-1" aria-label="Provider Dashboard Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  data-testid={`provider-nav-${item.id}`}
                  className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-primary-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-primary-800 text-blue-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Account & Logout */}
        <div className="p-4 border-t border-primary-800/80 space-y-3">
          <div className="px-3 py-2 bg-primary-800/40 rounded-xl text-xs border border-primary-700/40">
            <span className="text-[10px] text-blue-200/70 uppercase font-bold block">
              Google Account
            </span>
            <span className="font-semibold text-white truncate block">{account?.email}</span>
          </div>

          <div className="flex items-center justify-between px-1">
            <Link
              to="/"
              className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1 font-medium"
            >
              <span>Marketplace</span>
              <ExternalLink className="w-3 h-3" />
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              data-testid="provider-logout-btn"
              className="text-xs text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Top Workspace Header */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-lg sm:text-2xl font-black text-primary tracking-tight truncate">
                {provider?.businessName || 'Provider Dashboard'}
              </h1>
              {provider?.category && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 text-primary border border-primary-100">
                  {provider.category}
                </span>
              )}
              {provider?.subcategory && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-accent-50 text-accent-700 border border-accent-200">
                  {provider.subcategory}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              {provider?.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-accent" />
                  <span>
                    {provider.city}
                    {provider.state ? `, ${provider.state}` : ''}
                  </span>
                </span>
              )}
              {provider?.sourceReferenceId && (
                <span className="font-mono text-[11px] text-slate-400">
                  ID: {provider.sourceReferenceId}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              disabled={isLoading}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-primary text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Refresh dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateServiceModal}
              data-testid="create-new-service-btn"
              className="py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-600 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create New Service</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
          {/* Feedback Notification */}
          {feedback && (
            <div
              role="status"
              className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="p-1 rounded-lg hover:bg-black/5"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {dashboardError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {dashboardError}
            </div>
          )}

          {/* Approval & Publishing Lifecycle Status Banner */}
          {provider?.verificationStatus === 'UNVERIFIED' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-extrabold text-amber-950 block mb-0.5">
                    Profile & Services Under Verification Review
                  </strong>
                  <span>
                    Your business profile and service packages have been logged with Dealsathi Operations. Once verified by our team, your profile and approved services can be published live to the marketplace directory.
                  </span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-amber-200/70 text-amber-900 whitespace-nowrap self-start sm:self-center">
                PENDING VERIFICATION
              </span>
            </div>
          )}

          {provider?.verificationStatus === 'REVOKED' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-extrabold text-rose-950 block mb-0.5">
                    Verification Action Required
                  </strong>
                  <span>
                    {provider.rejectionReason
                      ? `Admin Review Note: "${provider.rejectionReason}". Please update your business profile details accordingly.`
                      : 'Your profile requires updates before it can be published. Please review your business profile details.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab('profile')}
                className="py-1.5 px-3 rounded-xl bg-rose-600 text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                Update Profile
              </button>
            </div>
          )}

          {/* =====================================================================
              TAB 1: DASHBOARD OVERVIEW
             ===================================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-8" data-testid="dashboard-overview-section">
              {/* 6 Real Database-Backed Statistics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Total Services
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary flex items-center justify-center">
                      <Package className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-primary"
                    data-testid="stat-total-services"
                  >
                    {stats.totalServices}
                  </div>
                  <span className="text-[11px] text-text-muted">Packages & offerings</span>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Active / Live
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-emerald-600"
                    data-testid="stat-active-services"
                  >
                    {stats.activeServices}
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Published listings
                  </span>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Pending Review
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-amber-600"
                    data-testid="stat-pending-approval"
                  >
                    {stats.pendingApproval}
                  </div>
                  <span className="text-[11px] text-text-muted">Awaiting verification</span>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Approved
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-primary"
                    data-testid="stat-approved-services"
                  >
                    {stats.approvedServices}
                  </div>
                  <span className="text-[11px] text-text-muted">Verified by Admin</span>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Rejected
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-rose-600"
                    data-testid="stat-rejected-services"
                  >
                    {stats.rejectedServices}
                  </div>
                  <span className="text-[11px] text-text-muted">Needs revision</span>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Enquiries
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-accent-50 text-accent flex items-center justify-center">
                      <MessageSquareText className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-accent"
                    data-testid="stat-total-enquiries"
                  >
                    {stats.totalEnquiries}
                  </div>
                  <span className="text-[11px] text-text-muted">Assigned customer leads</span>
                </div>
              </div>

              {/* Business Profile Summary & Profile Completion Card */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                      <h2 className="text-sm font-extrabold text-primary uppercase tracking-wider">
                        Business Profile Summary
                      </h2>
                      <button
                        type="button"
                        onClick={() => setTab('profile')}
                        className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Business Profile</span>
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start gap-5">
                      {provider?.shopImage?.url ? (
                        <img
                          src={provider.shopImage.url}
                          alt={provider.businessName}
                          className="w-28 h-24 object-cover rounded-xl border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-2xl bg-primary-50 text-primary flex items-center justify-center font-black text-2xl shrink-0 border border-primary-100">
                          {(provider?.businessName || 'D')[0]}
                        </div>
                      )}

                      <div className="space-y-2 text-xs min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-extrabold text-primary">
                            {provider?.businessName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              provider?.publicationStatus === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {provider?.publicationStatus || 'DRAFT'}
                          </span>
                        </div>

                        <p className="text-text-muted leading-relaxed line-clamp-2">
                          {provider?.description}
                        </p>

                        <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-slate-600">
                          <span>
                            <strong className="text-primary">Contact:</strong>{' '}
                            {provider?.providerName} ({provider?.contactNumber})
                          </span>
                          <span>
                            <strong className="text-primary">Category:</strong>{' '}
                            {provider?.category}
                            {provider?.subcategory ? ` → ${provider.subcategory}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profile Completion Meter (4 cols) */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
                        Profile Completion
                      </span>
                      <span className="text-lg font-black text-accent">
                        {completionPercentage}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-300"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>

                    {provider?.profileCompletion?.missingFields?.length > 0 ? (
                      <div className="text-xs text-text-muted space-y-1">
                        <span className="font-semibold text-primary block">
                          Add these to reach 100%:
                        </span>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {provider.profileCompletion.missingFields.slice(0, 4).map((field) => (
                            <span
                              key={field}
                              className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md"
                            >
                              + {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700 font-semibold">
                        ✓ Your business profile is 100% complete!
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setTab('profile')}
                    className="mt-4 w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-primary font-bold text-xs transition-colors cursor-pointer"
                  >
                    Manage Business Details
                  </button>
                </div>
              </div>

              {/* Recent Services / Packages Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-primary">
                      Recent Services & Packages
                    </h2>
                    <p className="text-xs text-text-muted">
                      Your service offerings and their current verification and publishing status
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTab('services')}
                      className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-primary text-xs font-bold cursor-pointer"
                    >
                      View All ({services.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreateServiceModal}
                      className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Service</span>
                    </button>
                  </div>
                </div>

                {services.length === 0 ? (
                  <div className="py-14 px-4 text-center">
                    <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <h3 className="text-sm font-extrabold text-primary mb-1">
                      No Services or Packages Created Yet
                    </h3>
                    <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
                      Add your specialized services and packages so Dealsathi can match your business with relevant customer enquiries.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreateServiceModal}
                      className="py-2.5 px-5 rounded-xl bg-accent hover:bg-accent-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create First Service</span>
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs" data-testid="recent-services-table">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3.5 px-5">Service / Package Name</th>
                          <th className="py-3.5 px-4">Category & Subcategory</th>
                          <th className="py-3.5 px-4">Pricing</th>
                          <th className="py-3.5 px-4">Created</th>
                          <th className="py-3.5 px-4">Approval Status</th>
                          <th className="py-3.5 px-4">Publishing</th>
                          <th className="py-3.5 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {services.slice(0, 8).map((svc) => (
                          <tr key={svc._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-5">
                              <div className="font-extrabold text-primary text-xs sm:text-sm">
                                {svc.title}
                              </div>
                              <div className="text-[11px] text-text-muted line-clamp-1 max-w-xs">
                                {svc.shortDescription || svc.description}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-slate-800 block">
                                {svc.category}
                              </span>
                              {svc.subcategory && (
                                <span className="text-[11px] text-accent font-semibold">
                                  {svc.subcategory}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-bold text-primary">
                              {svc.priceLabel || 'Custom Quote'}
                            </td>
                            <td className="py-4 px-4 text-slate-500">
                              {svc.createdAt
                                ? new Date(svc.createdAt).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  svc.approvalStatus === 'APPROVED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : svc.approvalStatus === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {svc.approvalStatus}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  svc.publicationStatus === 'PUBLISHED'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {svc.publicationStatus}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingService(svc)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 cursor-pointer"
                                  title="View details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditServiceModal(svc)}
                                  className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-primary font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2 & 3: MY SERVICES / PACKAGES & MANAGE LISTINGS
             ===================================================================== */}
          {(activeTab === 'services' || activeTab === 'listings') && (
            <div className="space-y-6" data-testid="provider-services-section">
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-primary">
                    {activeTab === 'services'
                      ? 'My Services & Packages'
                      : 'Manage Service Listings'}
                  </h2>
                  <p className="text-xs text-text-muted">
                    Create, update, and track approval and publication status for all your service offerings.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 sm:w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder="Search your services..."
                      className="w-full pl-8 pr-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {serviceSearch && (
                      <button
                        type="button"
                        onClick={() => setServiceSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenCreateServiceModal}
                    className="py-2 px-4 rounded-xl bg-accent hover:bg-accent-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Service</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { label: `All (${services.length})`, value: 'all' },
                  { label: `Approved (${stats.approvedServices})`, value: 'APPROVED' },
                  { label: `Pending Review (${stats.pendingApproval})`, value: 'PENDING' },
                  { label: `Published (${stats.activeServices})`, value: 'PUBLISHED' },
                  { label: `Drafts (${stats.draftServices})`, value: 'DRAFT' },
                  { label: `Rejected (${stats.rejectedServices})`, value: 'REJECTED' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setServiceStatusFilter(tab.value)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      serviceStatusFilter === tab.value
                        ? 'bg-primary text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Services Listing Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                {filteredServices.length === 0 ? (
                  <div className="py-16 px-4 text-center">
                    <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <h3 className="text-sm font-extrabold text-primary mb-1">
                      No Matching Services Found
                    </h3>
                    <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
                      {serviceSearch || serviceStatusFilter !== 'all'
                        ? 'No services match your active filter. Try resetting filters or adding a new service.'
                        : 'Start by adding your first service or package offering.'}
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreateServiceModal}
                      className="py-2 px-4 rounded-xl bg-primary text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Service</span>
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3.5 px-5">Service / Package</th>
                          <th className="py-3.5 px-4">Category & Subcategory</th>
                          <th className="py-3.5 px-4">Pricing</th>
                          <th className="py-3.5 px-4">Approval</th>
                          <th className="py-3.5 px-4">Publishing</th>
                          <th className="py-3.5 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredServices.map((svc) => (
                          <tr key={svc._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-5">
                              <div className="font-extrabold text-primary text-xs sm:text-sm">
                                {svc.title}
                              </div>
                              <div className="text-[11px] text-text-muted line-clamp-1 max-w-sm">
                                {svc.description}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-slate-800 block">
                                {svc.category}
                              </span>
                              {svc.subcategory && (
                                <span className="text-[11px] text-accent font-semibold">
                                  {svc.subcategory}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-bold text-primary">
                              {svc.priceLabel || 'Custom Quote'}
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  svc.approvalStatus === 'APPROVED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : svc.approvalStatus === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {svc.approvalStatus}
                              </span>
                              {svc.rejectionReason && (
                                <span className="block text-[10px] text-rose-600 mt-0.5">
                                  Note: {svc.rejectionReason}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  svc.publicationStatus === 'PUBLISHED'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {svc.publicationStatus}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingService(svc)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 cursor-pointer"
                                  title="Inspect service"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditServiceModal(svc)}
                                  className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-primary font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteService(svc)}
                                  disabled={deletingServiceId === svc._id}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Delete service"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 4: BUSINESS PROFILE EDITOR
             ===================================================================== */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs" data-testid="provider-profile-section">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-100">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-primary">
                    Business Profile & Taxonomy Classification
                  </h2>
                  <p className="text-xs text-text-muted">
                    Keep your business details, category specialization, and establishment photo up to date.
                  </p>
                </div>
                <span className="text-xs font-bold text-accent">
                  Completion: {completionPercentage}%
                </span>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-6" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Business / Enterprise Name *
                    </label>
                    <input
                      type="text"
                      name="businessName"
                      value={profileForm.businessName}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {profileErrors.businessName && (
                      <p className="mt-1 text-xs text-rose-600">{profileErrors.businessName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Authorized Contact Person *
                    </label>
                    <input
                      type="text"
                      name="providerName"
                      value={profileForm.providerName}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {profileErrors.providerName && (
                      <p className="mt-1 text-xs text-rose-600">{profileErrors.providerName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Main Category (5 Dealsathi Verticals) *
                    </label>
                    <select
                      name="categorySlug"
                      value={profileForm.categorySlug}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary cursor-pointer"
                    >
                      <option value="">Select Main Category</option>
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Primary Subcategory
                    </label>
                    <select
                      name="subcategory"
                      value={profileForm.subcategory}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary cursor-pointer"
                    >
                      <option value="">Select Subcategory</option>
                      {profileSubcategories.map((sub) => (
                        <option key={sub.slug} value={sub.name}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Direct Mobile Number *
                    </label>
                    <input
                      type="tel"
                      name="contactNumber"
                      maxLength={10}
                      value={profileForm.contactNumber}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {profileErrors.contactNumber && (
                      <p className="mt-1 text-xs text-rose-600">{profileErrors.contactNumber}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Years of Experience
                    </label>
                    <input
                      type="number"
                      name="experienceYears"
                      min={0}
                      max={100}
                      value={profileForm.experienceYears}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Operating City *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={profileForm.city}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {profileErrors.city && (
                      <p className="mt-1 text-xs text-rose-600">{profileErrors.city}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      State
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={profileForm.state}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Business Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={profileForm.address}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Service Areas (Comma-separated)
                    </label>
                    <input
                      type="text"
                      name="serviceAreas"
                      value={profileForm.serviceAreas}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Website URL
                    </label>
                    <input
                      type="url"
                      name="website"
                      value={profileForm.website}
                      onChange={handleProfileChange}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Business Description *
                    </label>
                    <textarea
                      name="description"
                      rows={4}
                      value={profileForm.description}
                      onChange={handleProfileChange}
                      className="w-full p-3.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                    />
                    {profileErrors.description && (
                      <p className="mt-1 text-xs text-rose-600">{profileErrors.description}</p>
                    )}
                  </div>

                  {/* Shop Image Update */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Business / Establishment Photo
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                      {(profileImagePreview || provider?.shopImage?.url) && (
                        <img
                          src={profileImagePreview || provider.shopImage.url}
                          alt="Establishment"
                          className="w-28 h-20 object-cover rounded-lg border border-slate-200"
                        />
                      )}
                      <div>
                        <input
                          type="file"
                          ref={profileFileInputRef}
                          onChange={handleProfileImageSelect}
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => profileFileInputRef.current?.click()}
                          className="py-2 px-3.5 rounded-xl bg-white border border-slate-200 hover:border-primary text-xs font-bold text-primary inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload New Photo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    data-testid="save-business-profile-btn"
                    className="py-2.5 px-6 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingProfile ? 'Saving Changes...' : 'Save Business Profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* =====================================================================
              TAB 5: ENQUIRIES / LEADS
             ===================================================================== */}
          {activeTab === 'enquiries' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden" data-testid="provider-enquiries-section">
              <div className="p-5 sm:p-6 border-b border-slate-200">
                <h2 className="text-base sm:text-lg font-extrabold text-primary">
                  Assigned Customer Enquiries
                </h2>
                <p className="text-xs text-text-muted">
                  Verified customer quote requests matched and assigned specifically to your business by Dealsathi Operations.
                </p>
              </div>

              {enquiries.length === 0 ? (
                <div className="py-16 px-4 text-center">
                  <MessageSquareText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h3 className="text-sm font-extrabold text-primary mb-1">
                    No Assigned Enquiries Yet
                  </h3>
                  <p className="text-xs text-text-muted max-w-md mx-auto">
                    When Dealsathi&apos;s operations desk pairs a verified customer requirement with your business, it will appear right here with full scope and contact details.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {enquiries.map((enq) => (
                    <div key={enq._id || enq.referenceId} className="p-5 sm:p-6 hover:bg-slate-50/70">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-accent">
                            {enq.referenceId}
                          </span>
                          <span className="text-sm font-extrabold text-primary">
                            {enq.service || enq.category}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
                          {enq.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed mb-3">
                        {enq.requirements}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
                        <span>
                          <strong className="text-primary">Customer:</strong> {enq.name}
                        </span>
                        {enq.phone && (
                          <span>
                            <strong className="text-primary">Phone:</strong> {enq.phone}
                          </span>
                        )}
                        <span>
                          <strong className="text-primary">City:</strong> {enq.city}
                        </span>
                        {enq.estimatedBudget && (
                          <span>
                            <strong className="text-primary">Budget:</strong> {enq.estimatedBudget}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 6: ACCOUNT SETTINGS
             ===================================================================== */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-6" data-testid="provider-settings-section">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-base sm:text-lg font-extrabold text-primary">
                  Account & Authentication Settings
                </h2>
                <p className="text-xs text-text-muted">
                  Your Dealsathi Provider account is linked to your verified Google identity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Verified Google Email
                  </span>
                  <span className="font-mono font-bold text-primary text-sm block">
                    {account?.email}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Google Identity Linked
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    Account Role & Status
                  </span>
                  <span className="font-bold text-primary text-sm block">
                    Verified Marketplace Partner ({account?.role || 'PROVIDER'})
                  </span>
                  <span className="text-[11px] text-text-muted block">
                    Public Slug: /providers/{provider?.slug || 'pending'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Sign out of your provider session on this device
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="py-2 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =========================================================================
          MODAL 1: CREATE / EDIT SERVICE & PACKAGE MODAL
         ========================================================================= */}
      {serviceModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-modal-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden my-8">
            <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent-300 block">
                  {serviceModalMode === 'create' ? 'New Service Package' : 'Edit Service Package'}
                </span>
                <h3 id="service-modal-title" className="text-base font-extrabold text-white">
                  {serviceModalMode === 'create'
                    ? 'Create Service / Package Offering'
                    : `Edit: ${editingService?.title}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isSubmittingService && setServiceModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleServiceSubmit} className="p-6 space-y-4 text-xs" noValidate>
              {serviceFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{serviceFormError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="service-title-input"
                  className="block font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Service / Package Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="service-title-input"
                  name="title"
                  type="text"
                  value={serviceForm.title}
                  onChange={handleServiceFormChange}
                  placeholder="e.g. Complete 2BHK Turnkey Interior Package"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                />
                {serviceFieldErrors.title && (
                  <p className="mt-1 text-rose-600">{serviceFieldErrors.title}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="service-category-select"
                    className="block font-bold uppercase tracking-wider text-slate-600 mb-1"
                  >
                    Main Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="service-category-select"
                    name="categorySlug"
                    value={serviceForm.categorySlug}
                    onChange={handleServiceFormChange}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary font-semibold focus:outline-none focus:bg-white focus:border-primary cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="service-subcategory-select"
                    className="block font-bold uppercase tracking-wider text-slate-600 mb-1"
                  >
                    Subcategory <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="service-subcategory-select"
                    name="subcategory"
                    value={serviceForm.subcategory}
                    onChange={handleServiceFormChange}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary font-semibold focus:outline-none focus:bg-white focus:border-primary cursor-pointer"
                  >
                    <option value="">Select Subcategory</option>
                    {serviceModalSubcategories.map((sub) => (
                      <option key={sub.slug} value={sub.name}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                  {serviceFieldErrors.subcategory && (
                    <p className="mt-1 text-rose-600">{serviceFieldErrors.subcategory}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Pricing Structure
                  </label>
                  <select
                    name="pricingModel"
                    value={serviceForm.pricingModel}
                    onChange={handleServiceFormChange}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary cursor-pointer"
                  >
                    {PRICING_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Starting / Package Price (₹)
                  </label>
                  <input
                    name="priceAmount"
                    type="number"
                    min={0}
                    value={serviceForm.priceAmount}
                    onChange={handleServiceFormChange}
                    placeholder="Optional (leave blank for Custom Quote)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Key Deliverables (Comma-separated)
                </label>
                <input
                  name="deliverables"
                  type="text"
                  value={serviceForm.deliverables}
                  onChange={handleServiceFormChange}
                  placeholder="e.g. 3D Floor Plan, Material BOQ, On-Site Supervision"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="service-description-input"
                  className="block font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Service Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="service-description-input"
                  name="description"
                  rows={3}
                  value={serviceForm.description}
                  onChange={handleServiceFormChange}
                  placeholder="Describe what is included in this service package, execution timeline, and quality standards..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-primary focus:outline-none focus:bg-white focus:border-primary"
                />
                {serviceFieldErrors.description && (
                  <p className="mt-1 text-rose-600">{serviceFieldErrors.description}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(false)}
                  disabled={isSubmittingService}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingService}
                  data-testid="submit-service-modal-btn"
                  className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingService ? (
                    <span>Saving...</span>
                  ) : (
                    <span>
                      {serviceModalMode === 'create' ? 'Create Service' : 'Save Changes'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: VIEW SERVICE DETAILS MODAL
         ========================================================================= */}
      {viewingService && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent-300 block">
                  Service Package Details
                </span>
                <h3 className="text-base font-extrabold text-white">{viewingService.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingService(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-text-muted font-semibold">Category</span>
                <span className="font-bold text-primary">
                  {viewingService.category}
                  {viewingService.subcategory ? ` → ${viewingService.subcategory}` : ''}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-text-muted font-semibold">Pricing</span>
                <span className="font-bold text-primary">{viewingService.priceLabel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-text-muted font-semibold">Approval Status</span>
                <span className="font-bold text-primary">{viewingService.approvalStatus}</span>
              </div>
              <div className="py-1.5">
                <span className="text-text-muted font-semibold block mb-1">Description</span>
                <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                  {viewingService.description}
                </p>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEditServiceModal(viewingService)}
                  className="py-2 px-4 rounded-xl bg-primary text-white font-bold cursor-pointer"
                >
                  Edit Service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
