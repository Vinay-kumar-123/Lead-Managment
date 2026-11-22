import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import DeleteConfirmationModal from '../../components/admin/DeleteConfirmationModal.jsx';
import adminDeletionService from '../../services/adminDeletionService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import { useCategories } from '../../hooks/useCategories.js';
import {
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Image as ImageIcon,
  RotateCcw,
  ShieldAlert,
  Package,
} from 'lucide-react';

export default function AdminProviderEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useAuth();
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const { categories, getCategoryBySlug } = useCategories();

  const [provider, setProvider] = useState(null);
  const [formData, setFormData] = useState({
    businessName: '',
    providerName: '',
    slug: '',
    description: '',
    category: '',
    categorySlug: '',
    services: '',
    contactNumber: '',
    email: '',
    city: '',
    state: '',
    address: '',
    pinCode: '',
    serviceAreas: '',
    website: '',
    verificationStatus: 'VERIFIED',
    publicationStatus: 'DRAFT',
    consentToDisplayPhone: true,
    metaTitle: '',
    metaDescription: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [deleteModal, setDeleteModal] = useState(null); // { mode, impact }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    api
      .get(`/admin/providers/${id}`)
      .then((res) => {
        if (res.success && res.data) {
          const p = res.data;
          setProvider(p);
          setFormData({
            businessName: p.businessName || '',
            providerName: p.providerName || '',
            slug: p.slug || '',
            description: p.description || '',
            category: p.category || '',
            categorySlug: p.categorySlug || '',
            services: Array.isArray(p.services) ? p.services.join(', ') : '',
            contactNumber: p.contactNumber || '',
            email: p.email || '',
            city: p.city || '',
            state: p.state || '',
            address: p.address || '',
            pinCode: p.pinCode || '',
            serviceAreas: Array.isArray(p.serviceAreas) ? p.serviceAreas.join(', ') : '',
            website: p.website || '',
            verificationStatus: p.verificationStatus || 'VERIFIED',
            publicationStatus: p.publicationStatus || 'DRAFT',
            consentToDisplayPhone: p.consentToDisplayPhone !== false,
            metaTitle: p.metaTitle || '',
            metaDescription: p.metaDescription || '',
          });
        } else {
          setErrorMsg('Provider not found');
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Error loading provider');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        ...formData,
        services: formData.services.split(',').map((s) => s.trim()).filter(Boolean),
        serviceAreas: formData.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
      };

      const res = await api.put(`/admin/providers/${id}`, payload);

      if (res.success && res.data) {
        setProvider(res.data);
        setSuccessMsg('Provider profile and publication settings updated successfully!');
      } else {
        setErrorMsg(res.message || 'Failed to update provider');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error updating provider');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublication = async (newStatus) => {
    setIsSaving(true);
    try {
      const res = await api.put(`/admin/providers/${id}`, { publicationStatus: newStatus });
      if (res.success) {
        setFormData((prev) => ({ ...prev, publicationStatus: newStatus }));
        setSuccessMsg(`Provider publication status changed to ${newStatus}.`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error updating publication status');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = async (mode) => {
    setDeleteError('');
    if (mode === 'soft') {
      setDeleteModal({ mode: 'soft', impact: null });
      return;
    }
    setIsSaving(true);
    try {
      const res = await adminDeletionService.getProviderDeletionImpact(id);
      setDeleteModal({ mode: 'permanent', impact: res?.data?.impact || null });
    } catch (err) {
      setErrorMsg(err.message || 'Could not check deletion impact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreProvider = async () => {
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await adminDeletionService.restoreProvider(id);
      if (res?.success) {
        setProvider((prev) => ({
          ...prev,
          isDeleted: false,
          publicationStatus: 'DRAFT',
          verificationStatus: 'VERIFIED',
        }));
        setFormData((prev) => ({
          ...prev,
          publicationStatus: 'DRAFT',
          verificationStatus: 'VERIFIED',
        }));
        setSuccessMsg(res.message || 'Provider restored as DRAFT.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error restoring provider');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async ({ reason, typedName }) => {
    if (!deleteModal || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res =
        deleteModal.mode === 'permanent'
          ? await adminDeletionService.permanentDeleteProvider(id, typedName)
          : await adminDeletionService.softDeleteProvider(id, reason);
      if (res?.success) {
        setDeleteModal(null);
        if (deleteModal.mode === 'permanent') {
          navigate('/admin/providers', { replace: true });
        } else {
          setProvider((prev) => ({
            ...prev,
            isDeleted: true,
            publicationStatus: 'ARCHIVED',
            verificationStatus: 'REVOKED',
          }));
          setFormData((prev) => ({
            ...prev,
            publicationStatus: 'ARCHIVED',
            verificationStatus: 'REVOKED',
          }));
          setSuccessMsg(res.message || 'Provider moved to trash.');
        }
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete provider');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Edit Provider" subtitle="Loading profile...">
        <div className="py-20 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        </div>
      </AdminLayout>
    );
  }

  if (!provider) {
    return (
      <AdminLayout title="Provider Profile" subtitle="Not Found">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 mb-1">Provider Profile Not Found</h3>
          <p className="text-xs text-slate-500 mb-6">
            {errorMsg || 'This provider profile does not exist or has been permanently removed.'}
          </p>
          <Link to="/admin/providers" className="btn-secondary py-2 px-4 text-xs font-semibold">
            Return to Providers List
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={`Edit Profile: ${provider?.businessName}`}
      subtitle={`Slug: /providers/${provider?.slug}`}
    >
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/admin/providers"
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Providers</span>
        </Link>

        {/* Quick Publication Actions */}
        <div className="flex items-center gap-2">
          {formData.publicationStatus === 'PUBLISHED' ? (
            <>
              <a
                href={`/providers/${provider?.slug}`}
                target="_blank"
                rel="noreferrer"
                className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span>Live Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => togglePublication('DRAFT')}
                disabled={isSaving}
                className="py-1.5 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold"
              >
                Unpublish to Draft
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => togglePublication('PUBLISHED')}
              disabled={isSaving || formData.verificationStatus !== 'VERIFIED'}
              className="btn-primary py-1.5 px-3.5 text-xs font-bold disabled:opacity-50"
            >
              Publish to Marketplace
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Shop Image Display */}
            {provider?.shopImage?.url && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                  <span>Verified Shop / Establishment Photo</span>
                </h3>
                <div className="flex items-center gap-4">
                  <img
                    src={provider.shopImage.url}
                    alt="Shop Establishment"
                    className="w-32 h-24 object-cover rounded-xl border border-slate-200 shadow-sm"
                  />
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-900">{provider.shopImage.originalName || 'Shop Image'}</p>
                    <p className="text-slate-400">Stored Key: {provider.shopImage.publicId}</p>
                    <a
                      href={provider.shopImage.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>View full image</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Core Business Information */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Core Identity
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    name="providerName"
                    value={formData.providerName}
                    onChange={handleChange}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Public Profile Slug (URL) *
                </label>
                <div className="flex items-center">
                  <span className="text-xs text-slate-400 bg-slate-100 px-3 py-3 border border-r-0 border-slate-200 rounded-l-xl">
                    /providers/
                  </span>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleChange}
                    required
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Business Description *
                </label>
                <textarea
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  required
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Main Category *
                  </label>
                  <select
                    name="categorySlug"
                    value={formData.categorySlug}
                    onChange={(e) => {
                      const chosenSlug = e.target.value;
                      const foundCat = getCategoryBySlug(chosenSlug);
                      setFormData((prev) => ({
                        ...prev,
                        categorySlug: chosenSlug,
                        category: foundCat ? foundCat.name : prev.category,
                      }));
                    }}
                    required
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 cursor-pointer"
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
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Category Slug *
                  </label>
                  <input
                    type="text"
                    name="categorySlug"
                    value={formData.categorySlug}
                    onChange={handleChange}
                    required
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Offered Services / Subcategories (Comma-separated)
                </label>
                <input
                  type="text"
                  name="services"
                  value={formData.services}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                {formData.categorySlug &&
                  getCategoryBySlug(formData.categorySlug)?.subcategories?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getCategoryBySlug(formData.categorySlug)
                        .subcategories.filter((s) => s.isActive !== false)
                        .map((sub) => {
                          const currentServices = formData.services
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          const isSelected = currentServices.some(
                            (s) => s.toLowerCase() === sub.name.toLowerCase()
                          );
                          return (
                            <button
                              key={sub.slug}
                              type="button"
                              onClick={() => {
                                const next = isSelected
                                  ? currentServices.filter(
                                      (s) => s.toLowerCase() !== sub.name.toLowerCase()
                                    )
                                  : [...currentServices, sub.name];
                                setFormData((prev) => ({
                                  ...prev,
                                  services: next.join(', '),
                                }));
                              }}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#012A7A] text-white border-[#012A7A]'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-[#012A7A]'
                              }`}
                            >
                              {isSelected ? `✓ ${sub.name}` : `+ ${sub.name}`}
                            </button>
                          );
                        })}
                    </div>
                  )}
              </div>
            </div>

            {/* Address & Geographic Scope */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Location & Coverage
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">State</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">PIN Code</label>
                  <input
                    type="text"
                    name="pinCode"
                    value={formData.pinCode}
                    onChange={handleChange}
                    maxLength={6}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Street Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Service Localities (Comma-separated)
                </label>
                <input
                  type="text"
                  name="serviceAreas"
                  value={formData.serviceAreas}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Governance, Contact & Publication */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Governance & Status
              </h3>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Verification Status
                </label>
                <select
                  name="verificationStatus"
                  value={formData.verificationStatus}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 font-semibold"
                >
                  <option value="VERIFIED">VERIFIED (Vetted)</option>
                  <option value="UNVERIFIED">UNVERIFIED (Pending)</option>
                  <option value="REVOKED">REVOKED (Delisted)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Publication Status
                </label>
                <select
                  name="publicationStatus"
                  value={formData.publicationStatus}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 font-semibold"
                >
                  <option value="DRAFT">DRAFT (Hidden from Public)</option>
                  <option value="PUBLISHED">PUBLISHED (Live Marketplace)</option>
                  <option value="ARCHIVED">ARCHIVED (Decommissioned)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consentToDisplayPhone"
                    checked={formData.consentToDisplayPhone}
                    onChange={handleChange}
                    className="w-4 h-4 text-teal-600 rounded mt-0.5 focus:ring-teal-400"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <strong>Display Phone Publicly:</strong> When checked, contact number is shown on
                    public provider card.
                  </span>
                </label>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Direct Coordinates
              </h3>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Website URL</label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving || provider?.isDeleted}
              className="btn-primary w-full py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save All Changes'}</span>
            </button>

            <Link
              to={`/admin/services?providerId=${id}`}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#012A7A] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Package className="w-4 h-4" />
              <span>Manage Provider Services & Packages</span>
            </Link>

            {/* Deletion & Lifecycle Management */}
            <div className="bg-rose-50/60 p-5 rounded-2xl border border-rose-200 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-900">
                Record Deletion & Access Control
              </h3>
              <p className="text-[11px] text-rose-800/80 leading-relaxed">
                {provider?.isDeleted
                  ? 'This provider profile is currently in Trash. Its public listing and login sessions are suspended.'
                  : 'Moving to Trash archives the profile, hides public listings, and suspends provider login sessions.'}
              </p>

              {!provider?.isDeleted ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => openDeleteModal('soft')}
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move Provider to Trash</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleRestoreProvider}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Provider as Draft</span>
                </button>
              )}

              {isSuperAdmin && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => openDeleteModal('permanent')}
                  className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Permanently Delete Provider</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <DeleteConfirmationModal
        isOpen={Boolean(deleteModal)}
        onClose={() => !isDeleting && setDeleteModal(null)}
        onConfirm={handleConfirmDelete}
        mode={deleteModal?.mode || 'soft'}
        entityType="Provider Profile"
        recordName={provider?.businessName || ''}
        identifierLabel={provider ? `/providers/${provider.slug} · ${provider.city}` : ''}
        description={
          deleteModal?.mode === 'permanent'
            ? 'This will permanently delete the provider profile, its services/packages, and provider login account, while preserving customer enquiry history.'
            : 'This will archive the provider profile and services, hide them from public listings, and immediately suspend provider authentication.'
        }
        impactItems={
          deleteModal?.mode === 'permanent' && deleteModal?.impact
            ? [
                `${deleteModal.impact.servicesCount} service/package record(s) will be permanently deleted.`,
                deleteModal.impact.hasLinkedAccount
                  ? 'Linked Google provider account and sessions will be deleted.'
                  : 'No linked provider account.',
                `${deleteModal.impact.assignedEnquiriesCount} customer enquiry record(s) will be preserved (unlinked).`,
              ]
            : []
        }
        mediaItems={
          deleteModal?.mode === 'permanent'
            ? deleteModal?.impact?.ownedMediaAssets || []
            : []
        }
        requireTypedConfirmation={deleteModal?.mode === 'permanent'}
        isSubmitting={isDeleting}
        errorMessage={deleteError}
      />
    </AdminLayout>
  );
}
