import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import DeleteConfirmationModal from '../../components/admin/DeleteConfirmationModal.jsx';
import adminDeletionService from '../../services/adminDeletionService.js';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Building2,
  Search,
  CheckCircle2,
  Edit,
  ExternalLink,
  Trash2,
  RotateCcw,
  ShieldAlert,
  Package,
} from 'lucide-react';

export default function AdminProvidersPage() {
  const { token, admin } = useAuth();
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();

  const publicationStatus = searchParams.get('publication') || 'all';
  const [search, setSearch] = useState('');
  const [providers, setProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null); // { provider, mode, impact }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const fetchProviders = () => {
    setIsLoading(true);
    const query = new URLSearchParams();
    if (publicationStatus !== 'all') query.set('publicationStatus', publicationStatus);
    if (search) query.set('search', search);

    api
      .get(`/admin/providers?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (res.success && res.data) {
          setProviders(res.data);
        } else {
          setError('Failed to fetch providers');
        }
      })
      .catch((err) => {
        setError(err.message || 'Error querying providers');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchProviders();
  }, [publicationStatus, token]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProviders();
  };

  const openDeleteModal = async (provider, mode) => {
    setDeleteError('');
    if (mode === 'soft') {
      setDeleteTarget({ provider, mode: 'soft', impact: null });
      return;
    }
    setBusyId(provider._id);
    try {
      const res = await adminDeletionService.getProviderDeletionImpact(provider._id);
      setDeleteTarget({
        provider,
        mode: 'permanent',
        impact: res?.data?.impact || null,
      });
    } catch (err) {
      setError(err.message || 'Unable to inspect provider deletion impact');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (provider) => {
    if (busyId === provider._id) return;
    setBusyId(provider._id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await adminDeletionService.restoreProvider(provider._id);
      if (res?.success) {
        setSuccessMsg(res.message || `Provider "${provider.businessName}" restored as DRAFT.`);
        fetchProviders();
      }
    } catch (err) {
      setError(err.message || 'Failed to restore provider');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async ({ reason, typedName }) => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    setError('');
    setSuccessMsg('');
    try {
      const { provider, mode } = deleteTarget;
      const res =
        mode === 'permanent'
          ? await adminDeletionService.permanentDeleteProvider(provider._id, typedName)
          : await adminDeletionService.softDeleteProvider(provider._id, reason);
      if (res?.success) {
        setDeleteTarget(null);
        setSuccessMsg(res.message || 'Provider updated successfully.');
        fetchProviders();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete provider');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminLayout title="Verified Provider Profiles" subtitle="Manage profile publication, contact phone visibility, and public listings">
      {/* Filters Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { label: 'All Profiles', value: 'all' },
            { label: 'Published (Public)', value: 'PUBLISHED' },
            { label: 'Drafts (Pending)', value: 'DRAFT' },
            { label: 'Archived', value: 'ARCHIVED' },
            { label: 'Trash / Deleted', value: 'DELETED' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setSearchParams({ publication: tab.value })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                publicationStatus === tab.value
                  ? tab.value === 'DELETED'
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by business, city, phone..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <button type="submit" className="p-1.5 bg-slate-900 text-white rounded-xl text-xs hover:bg-slate-800">
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Providers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-7 h-7 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs text-slate-500">Querying provider directory...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No Providers Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Approve partner applications to generate verified provider profiles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Business Name & Slug</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Public Phone</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4">Publication</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block">{p.businessName}</span>
                      <span className="text-[11px] font-mono text-slate-500 block truncate max-w-xs">/providers/{p.slug}</span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">{p.category}</td>
                    <td className="py-3.5 px-4 text-slate-600">{p.city}</td>
                    <td className="py-3.5 px-4">
                      {p.contactNumber ? (
                        <span className="font-mono font-bold text-teal-700">{p.contactNumber}</span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Hidden / Not Set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          p.verificationStatus === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {p.verificationStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          p.publicationStatus === 'PUBLISHED'
                            ? 'bg-teal-50 text-teal-700 border border-teal-200'
                            : p.publicationStatus === 'DRAFT'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.publicationStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {!p.isDeleted && p.publicationStatus === 'PUBLISHED' && (
                          <a
                            href={`/providers/${p.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-slate-600 p-1 inline-block"
                            title="View on Live Website"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <Link
                          to={`/admin/services?providerId=${p._id}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#012A7A] hover:bg-slate-100"
                          title={`Manage services for ${p.businessName}`}
                          aria-label={`Services for ${p.businessName}`}
                        >
                          <Package className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          to={`/admin/providers/${p._id}`}
                          className="btn-secondary py-1 px-3 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" />
                          <span>Edit Profile</span>
                        </Link>

                        {!p.isDeleted ? (
                          <button
                            type="button"
                            disabled={busyId === p._id}
                            onClick={() => openDeleteModal(p, 'soft')}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                            title={`Move ${p.businessName} to trash`}
                            aria-label={`Delete provider ${p.businessName}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyId === p._id}
                              onClick={() => handleRestore(p)}
                              className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title={`Restore ${p.businessName}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restore</span>
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                disabled={busyId === p._id}
                                onClick={() => openDeleteModal(p, 'permanent')}
                                className="py-1 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title={`Permanently delete ${p.businessName}`}
                                aria-label={`Permanently delete provider ${p.businessName}`}
                              >
                                <ShieldAlert className="w-3 h-3" />
                                <span>Purge</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        mode={deleteTarget?.mode || 'soft'}
        entityType="Provider Profile"
        recordName={deleteTarget?.provider?.businessName || ''}
        identifierLabel={
          deleteTarget?.provider
            ? `/providers/${deleteTarget.provider.slug} · ${deleteTarget.provider.city}`
            : ''
        }
        description={
          deleteTarget?.mode === 'permanent'
            ? 'This will permanently delete the provider profile, its services/packages, and provider login account, while unlinking customer enquiries.'
            : 'This will archive the provider profile and its services, hide them from public listings, and suspend provider login sessions.'
        }
        impactItems={
          deleteTarget?.mode === 'permanent' && deleteTarget?.impact
            ? [
                `${deleteTarget.impact.servicesCount} service/package record(s) will be permanently deleted.`,
                deleteTarget.impact.hasLinkedAccount
                  ? 'Linked Google provider authentication account and active sessions will be removed.'
                  : 'No linked provider authentication account.',
                `${deleteTarget.impact.assignedEnquiriesCount} customer enquiry record(s) will be preserved (unlinked safely).`,
                ...(deleteTarget.impact.sharedMediaAssets?.length > 0
                  ? [
                      `${deleteTarget.impact.sharedMediaAssets.length} media asset(s) are shared with another record and will NOT be deleted.`,
                    ]
                  : []),
              ]
            : []
        }
        mediaItems={
          deleteTarget?.mode === 'permanent'
            ? deleteTarget?.impact?.ownedMediaAssets || []
            : []
        }
        requireTypedConfirmation={deleteTarget?.mode === 'permanent'}
        isSubmitting={isDeleting}
        errorMessage={deleteError}
      />
    </AdminLayout>
  );
}
