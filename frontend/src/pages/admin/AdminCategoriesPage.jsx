import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import DeleteConfirmationModal from '../../components/admin/DeleteConfirmationModal.jsx';
import categoryService from '../../services/categoryService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { categories as seedCategories } from '../../data/categories.js';
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Edit3,
  Eye,
  Power,
  X,
  Home,
  Camera,
  Building2,
  Monitor,
  GraduationCap,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  FolderTree,
  Tag,
  ArrowUpRight,
  Trash2,
  RotateCcw,
  ShieldAlert,
  ArrowRightLeft,
} from 'lucide-react';

const ICON_MAP = {
  Home,
  Camera,
  Building2,
  Monitor,
  GraduationCap,
  Layers,
};

function createSlugPreview(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildFallbackAdminData() {
  const mainCategories = seedCategories.map((cat, idx) => {
    const subs = (cat.subcategories || []).map((sub, sIdx) => ({
      _id: sub._id || sub.id || sub.slug,
      id: sub.slug,
      name: sub.name,
      slug: sub.slug,
      description: sub.description || '',
      parentCategory: cat._id || cat.id || cat.slug,
      parentSlug: cat.slug,
      parentName: cat.name,
      isMain: false,
      isActive: sub.isActive !== false,
      displayOrder: sIdx + 1,
    }));

    return {
      ...cat,
      _id: cat._id || cat.id || cat.slug,
      isMain: true,
      isActive: true,
      displayOrder: idx + 1,
      subcategoryCount: subs.length,
      totalSubcategories: subs.length,
      activeSubcategories: subs.filter((s) => s.isActive).length,
      inactiveSubcategories: subs.filter((s) => !s.isActive).length,
      subcategories: subs,
    };
  });

  const subcategories = mainCategories.flatMap((m) => m.subcategories);

  return {
    mainCategories,
    subcategories,
    summary: {
      totalMainCategories: mainCategories.length,
      totalSubcategories: subcategories.length,
      activeSubcategories: subcategories.filter((s) => s.isActive).length,
      inactiveSubcategories: subcategories.filter((s) => !s.isActive).length,
    },
  };
}

export default function AdminCategoriesPage() {
  const { admin } = useAuth();
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const [mainCategories, setMainCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [allActiveSubcategories, setAllActiveSubcategories] = useState([]);
  const [summary, setSummary] = useState({
    totalMainCategories: 5,
    totalSubcategories: 0,
    activeSubcategories: 0,
    inactiveSubcategories: 0,
    deletedSubcategories: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: '' }

  // Search & Filter states
  const [selectedParentSlug, setSelectedParentSlug] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive' | 'deleted'
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [viewingSubcategory, setViewingSubcategory] = useState(null);

  // Delete & Reassign modal states
  const [deleteTarget, setDeleteTarget] = useState(null); // { sub, mode: 'soft' | 'permanent', depReport }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reassignTarget, setReassignTarget] = useState(null); // { sub, depReport }
  const [reassignToId, setReassignToId] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  // Form data & validation states
  const [formData, setFormData] = useState({
    name: '',
    parentCategory: '',
    description: '',
    displayOrder: '',
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [formServerError, setFormServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const fetchCategoriesData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    setLoadError('');

    try {
      const [res, activeRes] = await Promise.all([
        categoryService.getAdminCategories({ status: statusFilter === 'deleted' ? 'deleted' : 'all' }),
        statusFilter === 'deleted' ? categoryService.getAdminCategories({ status: 'active' }) : Promise.resolve(null),
      ]);
      if (res && res.success && res.data) {
        setMainCategories(res.data.mainCategories || []);
        setSubcategories(res.data.subcategories || []);
        if (activeRes?.success && activeRes?.data?.subcategories) {
          setAllActiveSubcategories(activeRes.data.subcategories);
        } else {
          setAllActiveSubcategories((res.data.subcategories || []).filter((s) => s.isActive && !s.isDeleted));
        }
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      } else {
        throw new Error(res?.message || 'Unable to load categories');
      }
    } catch (err) {
      const fallback = buildFallbackAdminData();
      setMainCategories((prev) => (prev.length > 0 ? prev : fallback.mainCategories));
      setSubcategories((prev) => (prev.length > 0 ? prev : fallback.subcategories));
      setAllActiveSubcategories(fallback.subcategories.filter((s) => s.isActive));
      setSummary((prev) => (prev.totalSubcategories > 0 ? prev : fallback.summary));
      setLoadError(
        err.message || 'Could not reach the backend API. Showing canonical taxonomy data.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCategoriesData();
  }, [fetchCategoriesData]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (formModalOpen && !isSubmitting) {
          setFormModalOpen(false);
        }
        if (viewingSubcategory) {
          setViewingSubcategory(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formModalOpen, isSubmitting, viewingSubcategory]);

  // Filtered subcategories based on selectedParentSlug, statusFilter, and searchQuery
  const filteredSubcategories = useMemo(() => {
    return subcategories.filter((sub) => {
      if (selectedParentSlug !== 'all' && sub.parentSlug !== selectedParentSlug) {
        return false;
      }
      if (statusFilter === 'active' && !sub.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && sub.isActive) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = String(sub.name || '').toLowerCase().includes(q);
        const matchesSlug = String(sub.slug || '').toLowerCase().includes(q);
        const matchesDesc = String(sub.description || '').toLowerCase().includes(q);
        const matchesParent = String(sub.parentName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSlug && !matchesDesc && !matchesParent) {
          return false;
        }
      }
      return true;
    });
  }, [subcategories, selectedParentSlug, statusFilter, searchQuery]);

  const activeParentCategory = useMemo(() => {
    if (selectedParentSlug === 'all') return null;
    return mainCategories.find((m) => m.slug === selectedParentSlug) || null;
  }, [mainCategories, selectedParentSlug]);

  // Open Create Subcategory Modal
  const handleOpenCreateModal = (preselectedParentSlug = '') => {
    const defaultParent =
      preselectedParentSlug ||
      (selectedParentSlug !== 'all' ? selectedParentSlug : mainCategories[0]?.slug || 'home-construction');

    setFormMode('create');
    setEditingSubcategory(null);
    setFormData({
      name: '',
      parentCategory: defaultParent,
      description: '',
      displayOrder: '',
      isActive: true,
    });
    setFormErrors({});
    setFormServerError('');
    setFormModalOpen(true);
  };

  // Open Edit Subcategory Modal
  const handleOpenEditModal = (sub) => {
    setFormMode('edit');
    setEditingSubcategory(sub);
    setFormData({
      name: sub.name || '',
      parentCategory: sub.parentSlug || sub.parentCategory || '',
      description: sub.description || '',
      displayOrder: sub.displayOrder !== undefined && sub.displayOrder !== null ? String(sub.displayOrder) : '',
      isActive: sub.isActive !== false,
    });
    setFormErrors({});
    setFormServerError('');
    setViewingSubcategory(null);
    setFormModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (formServerError) {
      setFormServerError('');
    }
  };

  const validateSubcategoryForm = () => {
    const errs = {};
    const normalizedName = String(formData.name || '').trim().replace(/\s+/g, ' ');

    if (!normalizedName) {
      errs.name = 'Subcategory name is required';
    } else if (normalizedName.length < 2) {
      errs.name = 'Subcategory name must be at least 2 characters';
    } else if (normalizedName.length > 80) {
      errs.name = 'Subcategory name cannot exceed 80 characters';
    } else if (/[<>]/.test(normalizedName)) {
      errs.name = 'Subcategory name cannot contain HTML tags (< or >)';
    } else if (createSlugPreview(normalizedName).length < 2) {
      errs.name = 'Subcategory name must contain valid letters or numbers';
    } else {
      // Client-side duplicate check
      const candidateSlug = createSlugPreview(normalizedName);
      const duplicate = subcategories.find(
        (s) =>
          (!editingSubcategory || String(s._id) !== String(editingSubcategory._id)) &&
          (s.name.toLowerCase() === normalizedName.toLowerCase() || s.slug === candidateSlug)
      );
      if (duplicate) {
        errs.name = `A subcategory named "${duplicate.name}" (/${duplicate.slug}) already exists under ${duplicate.parentName}.`;
      }
    }

    const validParent = mainCategories.find(
      (m) => m.slug === formData.parentCategory || String(m._id) === String(formData.parentCategory)
    );
    if (!formData.parentCategory || !validParent) {
      errs.parentCategory = 'Please select one of the 5 established main categories';
    }

    if (formData.description && formData.description.trim().length > 500) {
      errs.description = 'Description cannot exceed 500 characters';
    } else if (/[<>]/.test(formData.description || '')) {
      errs.description = 'Description cannot contain HTML tags';
    }

    if (formData.displayOrder !== '' && formData.displayOrder !== undefined) {
      const orderNum = Number(formData.displayOrder);
      if (!Number.isInteger(orderNum) || orderNum < 0 || orderNum > 9999) {
        errs.displayOrder = 'Display order must be a whole number between 0 and 9999';
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormServerError('');
    if (!validateSubcategoryForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedName = formData.name.trim().replace(/\s+/g, ' ');
      const payload = {
        name: normalizedName,
        parentCategory: formData.parentCategory,
        description: formData.description.trim().replace(/\s+/g, ' '),
        isActive: Boolean(formData.isActive),
      };

      if (formData.displayOrder !== '' && formData.displayOrder !== undefined) {
        payload.displayOrder = Number(formData.displayOrder);
      }

      if (formMode === 'create') {
        const res = await categoryService.createSubcategory(payload);
        if (res && res.success) {
          setFeedback({
            type: 'success',
            message: `Subcategory "${res.data?.name || normalizedName}" created under ${res.data?.parentName || 'selected main category'}.`,
          });
          setFormModalOpen(false);
          await fetchCategoriesData({ silent: true });
        } else {
          setFormServerError(res?.message || 'Failed to create subcategory');
        }
      } else if (editingSubcategory) {
        const res = await categoryService.updateSubcategory(
          editingSubcategory._id || editingSubcategory.slug,
          payload
        );
        if (res && res.success) {
          setFeedback({
            type: 'success',
            message: `Subcategory "${res.data?.name || normalizedName}" updated successfully.`,
          });
          setFormModalOpen(false);
          await fetchCategoriesData({ silent: true });
        } else {
          setFormServerError(res?.message || 'Failed to update subcategory');
        }
      }
    } catch (err) {
      setFormServerError(err.message || 'An error occurred while saving the subcategory.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (sub) => {
    const targetId = sub._id || sub.slug;
    if (togglingId === targetId) return;

    setTogglingId(targetId);
    setFeedback(null);

    try {
      const nextStatus = !sub.isActive;
      const res = await categoryService.updateSubcategoryStatus(targetId, nextStatus);
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `Subcategory "${sub.name}" is now ${nextStatus ? 'ACTIVE' : 'INACTIVE'}.`,
        });
        await fetchCategoriesData({ silent: true });
      } else {
        setFeedback({
          type: 'error',
          message: res?.message || 'Could not update subcategory status.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to toggle subcategory status.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleResetFilters = () => {
    setSelectedParentSlug('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const openSubcategoryDeleteModal = async (sub, mode) => {
    const targetId = sub._id || sub.slug;
    if (togglingId === targetId) return;
    setTogglingId(targetId);
    setDeleteError('');
    try {
      const depRes = await categoryService.getSubcategoryDependencies(targetId);
      setDeleteTarget({
        sub,
        mode,
        depReport: depRes?.data || null,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Could not inspect category dependencies before deletion.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleRestoreSubcategory = async (sub) => {
    const targetId = sub._id || sub.slug;
    if (togglingId === targetId) return;
    setTogglingId(targetId);
    setFeedback(null);
    try {
      const res = await categoryService.restoreSubcategory(targetId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Subcategory "${sub.name}" restored as inactive.`,
        });
        await fetchCategoriesData({ silent: true });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to restore subcategory.' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDeleteSubcategory = async ({ reason }) => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { sub, mode } = deleteTarget;
      const targetId = sub._id || sub.slug;
      const res =
        mode === 'permanent'
          ? await categoryService.permanentDeleteSubcategory(targetId)
          : await categoryService.softDeleteSubcategory(targetId, reason);
      if (res?.success) {
        setDeleteTarget(null);
        setViewingSubcategory(null);
        setFeedback({
          type: 'success',
          message:
            res.message ||
            (mode === 'permanent'
              ? `Subcategory "${sub.name}" permanently deleted.`
              : `Subcategory "${sub.name}" moved to trash.`),
        });
        await fetchCategoriesData({ silent: true });
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete subcategory.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenReassign = async (sub, existingReport = null) => {
    setDeleteTarget(null);
    setReassignToId('');
    if (existingReport) {
      setReassignTarget({ sub, depReport: existingReport });
      return;
    }
    try {
      const res = await categoryService.getSubcategoryDependencies(sub._id || sub.slug);
      setReassignTarget({ sub, depReport: res?.data || null });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Could not inspect dependencies.' });
    }
  };

  const handleConfirmReassign = async (e) => {
    e.preventDefault();
    if (!reassignTarget || !reassignToId || isReassigning) return;
    setIsReassigning(true);
    try {
      const res = await categoryService.reassignSubcategoryDependencies(
        reassignTarget.sub._id || reassignTarget.sub.slug,
        reassignToId
      );
      if (res?.success) {
        setReassignTarget(null);
        setFeedback({
          type: 'success',
          message: res.message || 'Dependencies reassigned successfully.',
        });
        await fetchCategoriesData({ silent: true });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reassign dependencies.' });
    } finally {
      setIsReassigning(false);
    }
  };

  const slugPreview = createSlugPreview(formData.name);

  return (
    <AdminLayout
      title="Categories & Subcategory Taxonomy"
      subtitle="Manage Dealsathi service subcategories under the 5 established main marketplace verticals"
    >
      {/* Top Architecture & Governance Banner + Primary Action */}
      <div className="mb-6 p-5 bg-gradient-to-r from-[#012A7A] via-[#013696] to-[#012A7A] text-white rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                Dealsathi Canonical Taxonomy
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF6A03]/25 text-amber-200 border border-[#FF6A03]/40">
                5 Protected Main Verticals
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-3xl">
              The 5 established main categories form the core marketplace architecture. Create, edit, and activate specialized subcategories below to power homepage discovery, provider onboarding, and customer quote routing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => fetchCategoriesData()}
            disabled={isLoading}
            className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            title="Refresh taxonomy from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            data-testid="open-create-subcategory-btn"
            className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Subcategory</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`mb-6 p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
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
            className="p-1 rounded-lg hover:bg-black/5 text-current"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Non-blocking Load Warning if Backend Offline */}
      {loadError && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchCategoriesData()}
            className="text-xs font-bold text-amber-900 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Main Verticals
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-[#012A7A]">
              {summary.totalMainCategories || 5}
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              100% Protected
            </span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Subcategories
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-[#012A7A]">
              {summary.totalSubcategories}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">Across 5 verticals</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Active Subcategories
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600">
              {summary.activeSubcategories}
            </span>
            <span className="text-[11px] font-semibold text-emerald-700">Live in Marketplace</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Inactive / Hidden
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-amber-600">
              {summary.inactiveSubcategories}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">Paused by Admin</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: 5 ESTABLISHED MAIN CATEGORIES OVERVIEW */}
      <div className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#012A7A] flex items-center gap-2">
              <span>1. Established Main Marketplace Categories</span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-[#012A7A]">
                5 Canonical Verticals
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Click any main category card to filter its subcategories, or add a new subcategory directly under it.
            </p>
          </div>
          {selectedParentSlug !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedParentSlug('all')}
              className="text-xs font-bold text-[#FF6A03] hover:underline self-start sm:self-auto"
            >
              Show All 5 Main Categories&apos; Subcategories
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {mainCategories.map((cat, idx) => {
            const IconComp = ICON_MAP[cat.icon] || Layers;
            const isSelected = selectedParentSlug === cat.slug;
            const activeSubs = (cat.subcategories || []).filter((s) => s.isActive !== false);
            const totalSubs =
              typeof cat.totalSubcategories === 'number'
                ? cat.totalSubcategories
                : (cat.subcategories || []).length;

            return (
              <div
                key={cat._id || cat.slug || idx}
                data-testid={`main-category-card-${cat.slug}`}
                className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#012A7A] ring-2 ring-[#012A7A]/15 shadow-md'
                    : 'border-slate-200 hover:border-[#012A7A]/40 shadow-2xs'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: cat.bgColor || '#E8EDF3' }}
                      >
                        <IconComp
                          className="w-4 h-4"
                          style={{ color: cat.color || '#012A7A' }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                        0{idx + 1}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Canonical main verticals cannot be deleted">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      PROTECTED
                    </span>
                  </div>

                  {/* Title & Slug */}
                  <h3 className="text-sm font-extrabold text-[#012A7A] mb-0.5 leading-snug">
                    {cat.name}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2.5">
                    <span>/{cat.slug}</span>
                    <Link
                      to={`/categories/${cat.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#FF6A03] hover:underline inline-flex items-center gap-0.5 font-sans font-semibold"
                      title={`Open public ${cat.name} page`}
                    >
                      <span>Live</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-4">
                    {cat.shortDescription || cat.description}
                  </p>

                  {/* Subcategory Count Pill & Preview */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-bold text-slate-700">Subcategories</span>
                      <span className="font-extrabold text-[#012A7A]">
                        {activeSubs.length} active{' '}
                        {totalSubs > activeSubs.length && (
                          <span className="text-slate-400 font-normal">
                            / {totalSubs} total
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeSubs.slice(0, 3).map((sub) => (
                        <span
                          key={sub._id || sub.slug}
                          className="text-[10px] font-medium bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200/80 truncate max-w-[130px]"
                        >
                          {sub.name}
                        </span>
                      ))}
                      {activeSubs.length > 3 && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
                          +{activeSubs.length - 3} more
                        </span>
                      )}
                      {activeSubs.length === 0 && (
                        <span className="text-[10px] text-slate-400 italic">
                          No active subcategories
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedParentSlug(isSelected ? 'all' : cat.slug)
                    }
                    className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#012A7A] text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-[#012A7A]'
                    }`}
                  >
                    {isSelected ? 'Viewing Vertical' : 'Manage Subcategories'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal(cat.slug)}
                    className="py-2 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center justify-center transition-colors cursor-pointer"
                    title={`Add subcategory under ${cat.name}`}
                    aria-label={`Add subcategory under ${cat.name}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: SUBCATEGORY MANAGEMENT DESK */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Desk Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[#012A7A]">
                2. Subcategory Directory & Management
              </h2>
              {activeParentCategory && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#012A7A] text-white">
                  <span>{activeParentCategory.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedParentSlug('all')}
                    className="hover:text-amber-300"
                    aria-label="Clear parent category filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing <strong className="text-[#012A7A]">{filteredSubcategories.length}</strong> of{' '}
              <strong>{subcategories.length}</strong> subcategories
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              handleOpenCreateModal(selectedParentSlug !== 'all' ? selectedParentSlug : '')
            }
            className="py-2.5 px-4 rounded-xl bg-[#012A7A] hover:bg-[#1B3B66] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>
              {activeParentCategory
                ? `New ${activeParentCategory.name} Subcategory`
                : 'Create Subcategory'}
            </span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 sm:px-6 border-b border-slate-200 bg-white space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <label htmlFor="admin-subcategory-search" className="sr-only">
                Search subcategories
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-subcategory-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by subcategory name, slug, description..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-[#012A7A] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search query"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Parent Category Filter Select */}
            <div className="md:col-span-4">
              <label htmlFor="admin-parent-filter" className="sr-only">
                Filter by Parent Main Category
              </label>
              <select
                id="admin-parent-filter"
                value={selectedParentSlug}
                onChange={(e) => setSelectedParentSlug(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-[#012A7A] focus:outline-none focus:bg-white focus:border-[#012A7A] cursor-pointer"
              >
                <option value="all">All 5 Main Categories ({subcategories.length})</option>
                {mainCategories.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name} ({m.totalSubcategories ?? m.subcategories?.length ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter Pills */}
            <div className="md:col-span-3 flex items-center bg-slate-100 p-1 rounded-xl">
              {[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: `Trash${summary.deletedSubcategories ? ` (${summary.deletedSubcategories})` : ''}`, value: 'deleted' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab.value
                      ? tab.value === 'deleted'
                        ? 'bg-rose-700 text-white shadow-2xs'
                        : 'bg-white text-[#012A7A] shadow-2xs'
                      : 'text-slate-600 hover:text-[#012A7A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Subcategories Table / Empty / Loading States */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-[#012A7A] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-medium">Loading category taxonomy...</p>
          </div>
        ) : filteredSubcategories.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Tag className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-[#012A7A] mb-1">
              No Matching Subcategories Found
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
              {searchQuery || selectedParentSlug !== 'all' || statusFilter !== 'all'
                ? 'No subcategories match your current filter criteria. Try clearing your search or switching verticals.'
                : 'No subcategories have been created yet. Click below to add your first subcategory.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {(searchQuery || selectedParentSlug !== 'all' || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Reset All Filters
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleOpenCreateModal(selectedParentSlug !== 'all' ? selectedParentSlug : '')
                }
                className="py-2 px-4 rounded-xl bg-[#012A7A] hover:bg-[#1B3B66] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add Subcategory</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="subcategories-table">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-5">Subcategory & Slug</th>
                  <th className="py-3.5 px-4">Parent Main Category</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubcategories.map((sub) => {
                  const parentCat = mainCategories.find((m) => m.slug === sub.parentSlug);
                  const ParentIcon = ICON_MAP[parentCat?.icon] || Layers;
                  const rowKey = sub._id || sub.slug;
                  const isToggling = togglingId === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      data-testid={`subcategory-row-${sub.slug}`}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !sub.isActive ? 'bg-slate-50/40 opacity-80' : ''
                      }`}
                    >
                      {/* Subcategory Name & Slug */}
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-[#012A7A] text-xs sm:text-sm">
                          {sub.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          slug: /{sub.slug}
                        </div>
                      </td>

                      {/* Parent Main Category Badge */}
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedParentSlug(sub.parentSlug)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white hover:border-[#012A7A]/40 text-[#012A7A] transition-colors cursor-pointer"
                          title={`Filter by ${sub.parentName}`}
                        >
                          <ParentIcon
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: parentCat?.color || '#012A7A' }}
                          />
                          <span>{sub.parentName || sub.parentSlug}</span>
                        </button>
                      </td>

                      {/* Description */}
                      <td className="py-4 px-4 max-w-md">
                        {sub.description ? (
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {sub.description}
                          </p>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            No description provided
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            sub.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sub.isActive ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          {sub.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingSubcategory(sub)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#012A7A] hover:bg-slate-100 transition-colors cursor-pointer"
                            title={`View ${sub.name} details`}
                            aria-label={`View ${sub.name} details`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {!sub.isDeleted ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(sub)}
                                className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#012A7A] font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                                title={`Edit ${sub.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleStatus(sub)}
                                disabled={isToggling}
                                className={`py-1.5 px-2.5 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 border transition-colors cursor-pointer disabled:opacity-50 ${
                                  sub.isActive
                                    ? 'bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-800 border-slate-200 hover:border-amber-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}
                                title={
                                  sub.isActive
                                    ? `Deactivate ${sub.name}`
                                    : `Activate ${sub.name}`
                                }
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>
                                  {isToggling
                                    ? '...'
                                    : sub.isActive
                                    ? 'Deactivate'
                                    : 'Activate'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openSubcategoryDeleteModal(sub, 'soft')}
                                disabled={isToggling}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                                title={`Move ${sub.name} to trash`}
                                aria-label={`Delete subcategory ${sub.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRestoreSubcategory(sub)}
                                disabled={isToggling}
                                className="py-1.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title={`Restore ${sub.name}`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restore</span>
                              </button>

                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openSubcategoryDeleteModal(sub, 'permanent')}
                                  disabled={isToggling}
                                  className="py-1.5 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title={`Permanently delete ${sub.name}`}
                                  aria-label={`Permanently delete subcategory ${sub.name}`}
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>Purge</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: CREATE / EDIT SUBCATEGORY FORM MODAL
         ========================================================================= */}
      {formModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subcategory-modal-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden my-8">
            {/* Modal Header */}
            <div className="bg-[#012A7A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                  {formMode === 'create' ? 'New Taxonomy Entry' : 'Update Taxonomy Entry'}
                </span>
                <h3 id="subcategory-modal-title" className="text-base font-extrabold text-white">
                  {formMode === 'create'
                    ? 'Create Marketplace Subcategory'
                    : `Edit Subcategory: ${editingSubcategory?.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setFormModalOpen(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5" noValidate>
              {formServerError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formServerError}</span>
                </div>
              )}

              {/* 1. Parent Main Category Select */}
              <div>
                <label
                  htmlFor="subcategory-parentCategory"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Parent Main Category <span className="text-rose-500">*</span>
                </label>
                <select
                  id="subcategory-parentCategory"
                  name="parentCategory"
                  value={formData.parentCategory}
                  onChange={handleFormChange}
                  disabled={isSubmitting}
                  className={`w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border rounded-xl text-[#012A7A] focus:outline-none focus:bg-white transition-colors cursor-pointer ${
                    formErrors.parentCategory
                      ? 'border-rose-500 bg-rose-50/30'
                      : 'border-slate-200 focus:border-[#012A7A]'
                  }`}
                >
                  <option value="">Select one of the 5 established main categories</option>
                  {mainCategories.map((main) => (
                    <option key={main.slug} value={main.slug}>
                      {main.name} (/{main.slug})
                    </option>
                  ))}
                </select>
                {formErrors.parentCategory ? (
                  <p className="mt-1 text-xs text-rose-600 font-medium">
                    {formErrors.parentCategory}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Every subcategory must belong to one of Dealsathi&apos;s 5 established top-level categories.
                  </p>
                )}
              </div>

              {/* 2. Subcategory Name & Live Slug Preview */}
              <div>
                <label
                  htmlFor="subcategory-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Subcategory Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="subcategory-name"
                  name="name"
                  type="text"
                  maxLength={80}
                  value={formData.name}
                  onChange={handleFormChange}
                  disabled={isSubmitting}
                  placeholder="e.g. Modular Kitchens, Solar Installation, Corporate Law"
                  className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-xl text-slate-900 focus:outline-none focus:bg-white transition-colors ${
                    formErrors.name
                      ? 'border-rose-500 bg-rose-50/30'
                      : 'border-slate-200 focus:border-[#012A7A]'
                  }`}
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{formErrors.name}</p>
                )}

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">
                    URL Slug:{' '}
                    <strong className="text-[#012A7A]">
                      /{slugPreview || 'auto-generated-slug'}
                    </strong>
                  </span>
                  <span>{formData.name.trim().length}/80</span>
                </div>
              </div>

              {/* 3. Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="subcategory-description"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                  >
                    Subcategory Description
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {(formData.description || '').length}/500
                  </span>
                </div>
                <textarea
                  id="subcategory-description"
                  name="description"
                  rows={3}
                  maxLength={500}
                  value={formData.description}
                  onChange={handleFormChange}
                  disabled={isSubmitting}
                  placeholder="Briefly describe the services and professionals covered under this subcategory..."
                  className={`w-full p-3.5 text-xs bg-slate-50 border rounded-xl text-slate-900 focus:outline-none focus:bg-white transition-colors ${
                    formErrors.description
                      ? 'border-rose-500 bg-rose-50/30'
                      : 'border-slate-200 focus:border-[#012A7A]'
                  }`}
                />
                {formErrors.description && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">
                    {formErrors.description}
                  </p>
                )}
              </div>

              {/* 4. Display Order & Active Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label
                    htmlFor="subcategory-displayOrder"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                  >
                    Display Order <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                  </label>
                  <input
                    id="subcategory-displayOrder"
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={9999}
                    value={formData.displayOrder}
                    onChange={handleFormChange}
                    disabled={isSubmitting}
                    placeholder="Auto"
                    className={`w-full px-3.5 py-2 text-xs bg-slate-50 border rounded-xl text-slate-900 focus:outline-none focus:bg-white ${
                      formErrors.displayOrder
                        ? 'border-rose-500'
                        : 'border-slate-200 focus:border-[#012A7A]'
                    }`}
                  />
                  {formErrors.displayOrder && (
                    <p className="mt-1 text-xs text-rose-600">{formErrors.displayOrder}</p>
                  )}
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={formData.isActive}
                      onChange={handleFormChange}
                      disabled={isSubmitting}
                      className="w-4 h-4 text-[#FF6A03] rounded focus:ring-[#FF6A03] cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#012A7A] block">
                        Active in Marketplace
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Visible on public category & quote pages
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  disabled={isSubmitting}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-subcategory-btn"
                  className="py-2.5 px-5 rounded-xl bg-[#012A7A] hover:bg-[#1B3B66] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>
                      {formMode === 'create' ? 'Create Subcategory' : 'Save Changes'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: VIEW SUBCATEGORY DETAILS INSPECTOR MODAL
         ========================================================================= */}
      {viewingSubcategory && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-subcategory-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-[#012A7A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                  Subcategory Inspector
                </span>
                <h3 id="view-subcategory-title" className="text-base font-extrabold text-white">
                  {viewingSubcategory.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingSubcategory(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                aria-label="Close details dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-semibold">Status</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    viewingSubcategory.isActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {viewingSubcategory.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-semibold">Parent Main Category</span>
                <span className="font-bold text-[#012A7A]">
                  {viewingSubcategory.parentName} (/{viewingSubcategory.parentSlug})
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-semibold">Canonical Slug</span>
                <span className="font-mono font-bold text-slate-800">
                  /{viewingSubcategory.slug}
                </span>
              </div>

              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 font-semibold block mb-1">Description</span>
                <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {viewingSubcategory.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                <Link
                  to={`/categories/${viewingSubcategory.parentSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#FF6A03] hover:underline inline-flex items-center gap-1"
                >
                  <span>View on Category Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <div className="flex items-center gap-2">
                  {!viewingSubcategory.isDeleted && (
                    <>
                      <button
                        type="button"
                        onClick={() => openSubcategoryDeleteModal(viewingSubcategory, 'soft')}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(viewingSubcategory)}
                        className="py-2 px-3.5 rounded-xl bg-[#012A7A] hover:bg-[#1B3B66] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Subcategory</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: SUBCATEGORY DELETE / DEPENDENCY CHECK MODAL
         ========================================================================= */}
      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteSubcategory}
        mode={deleteTarget?.mode || 'soft'}
        entityType="Subcategory"
        recordName={deleteTarget?.sub?.name || ''}
        identifierLabel={
          deleteTarget?.sub
            ? `/${deleteTarget.sub.slug} · Parent: ${deleteTarget.sub.parentName}`
            : ''
        }
        description={
          deleteTarget?.mode === 'permanent'
            ? 'Permanently removes this unused subcategory from MongoDB. Canonical main categories and active dependencies cannot be orphaned.'
            : 'Moves this subcategory to Trash and hides it from public category and quote forms. Existing providers and services are preserved and never cascade-deleted.'
        }
        impactItems={
          deleteTarget?.depReport
            ? [
                `Providers referencing this subcategory: ${deleteTarget.depReport.dependencies.providersCount}`,
                `Services/Packages referencing this subcategory: ${deleteTarget.depReport.servicesCount}`,
                `Customer Enquiries referencing this subcategory: ${deleteTarget.depReport.enquiriesCount}`,
                `Blog Articles linked to this slug: ${deleteTarget.depReport.blogsCount}`,
              ]
            : []
        }
        blockedReason={
          deleteTarget?.mode === 'permanent' &&
          deleteTarget?.depReport &&
          !deleteTarget.depReport.canPermanentlyDelete
            ? `Permanent deletion is blocked because ${deleteTarget.depReport.dependencies.totalDependencies} active record(s) still reference "${deleteTarget.sub.name}". Use Deactivate, Move to Trash, or Reassign dependencies first.`
            : ''
        }
        isSubmitting={isDeleting}
        errorMessage={deleteError}
      />

      {/* Quick Reassign Trigger Banner when Permanent Delete is Blocked */}
      {deleteTarget?.mode === 'permanent' &&
        deleteTarget?.depReport &&
        !deleteTarget.depReport.canPermanentlyDelete && (
          <div className="fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-xl rounded-2xl p-4 max-w-sm text-xs flex items-center justify-between gap-3">
            <div>
              <strong className="text-[#012A7A] block">Need to remove this subcategory?</strong>
              <span className="text-slate-600">
                Reassign its {deleteTarget.depReport.dependencies.totalDependencies} dependencies to another subcategory first.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleOpenReassign(deleteTarget.sub, deleteTarget.depReport)}
              className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Reassign</span>
            </button>
          </div>
        )}

      {/* =========================================================================
          MODAL 4: REASSIGN DEPENDENCIES MODAL
         ========================================================================= */}
      {reassignTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-[#012A7A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                  Safe Taxonomy Migration
                </span>
                <h3 className="text-base font-extrabold">
                  Reassign Dependencies from {reassignTarget.sub.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isReassigning && setReassignTarget(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmReassign} className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Select an active replacement subcategory. Providers, Services, and Blog CTA links currently pointing to{' '}
                <strong>{reassignTarget.sub.name}</strong> will be updated safely without deleting any provider or service records.
              </p>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1.5">
                  Target Subcategory
                </label>
                <select
                  required
                  value={reassignToId}
                  onChange={(e) => setReassignToId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-[#012A7A]"
                >
                  <option value="">Choose replacement subcategory...</option>
                  {allActiveSubcategories
                    .filter((s) => s.slug !== reassignTarget.sub.slug)
                    .map((s) => (
                      <option key={s._id || s.slug} value={s._id || s.slug}>
                        {s.name} ({s.parentName})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReassignTarget(null)}
                  disabled={isReassigning}
                  className="py-2 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!reassignToId || isReassigning}
                  className="py-2 px-4 rounded-xl bg-[#012A7A] text-white font-bold disabled:opacity-50"
                >
                  {isReassigning ? 'Reassigning...' : 'Reassign Dependencies'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
