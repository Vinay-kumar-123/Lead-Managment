import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import DeleteConfirmationModal from '../../components/admin/DeleteConfirmationModal.jsx';
import adminDeletionService from '../../services/adminDeletionService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Package,
  Search,
  CheckCircle2,
  XCircle,
  Power,
  Trash2,
  RotateCcw,
  Eye,
  X,
  AlertCircle,
  ShieldAlert,
  Building2,
} from 'lucide-react';

const STATUS_TABS = [
  { label: 'All Active', value: 'all' },
  { label: 'Pending Review', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Trash / Deleted', value: 'deleted' },
];

export default function AdminServicesPage() {
  const { admin } = useAuth();
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();

  const currentStatus = searchParams.get('status') || 'all';
  const providerIdFilter = searchParams.get('providerId') || '';
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const [viewingService, setViewingService] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null); // { service, mode: 'soft' | 'permanent' }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchServices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminDeletionService.getServices({
        status: currentStatus,
        providerId: providerIdFilter,
        search: search.trim(),
      });
      if (res?.success && Array.isArray(res.data)) {
        setServices(res.data);
      } else {
        setServices([]);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load services.' });
    } finally {
      setIsLoading(false);
    }
  }, [currentStatus, providerIdFilter, search]);

  useEffect(() => {
    fetchServices();
  }, [currentStatus, providerIdFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchServices();
  };

  const handleTabChange = (val) => {
    const next = new URLSearchParams(searchParams);
    next.set('status', val);
    setSearchParams(next);
  };

  const handleApproval = async (svc, approvalStatus) => {
    if (busyId === svc._id) return;
    setBusyId(svc._id);
    setFeedback(null);
    try {
      const res = await adminDeletionService.updateServiceApproval(svc._id, {
        approvalStatus,
        publishIfVerified: approvalStatus === 'APPROVED',
      });
      if (res?.success) {
        setFeedback({ type: 'success', message: res.message || `Service ${approvalStatus}.` });
        await fetchServices();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Could not update approval.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (svc) => {
    if (busyId === svc._id) return;
    setBusyId(svc._id);
    setFeedback(null);
    try {
      const res = await adminDeletionService.updateServiceStatus(svc._id, {
        isActive: !svc.isActive,
      });
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Service "${svc.title}" ${!svc.isActive ? 'activated' : 'deactivated'}.`,
        });
        await fetchServices();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Could not update service status.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (svc) => {
    if (busyId === svc._id) return;
    setBusyId(svc._id);
    setFeedback(null);
    try {
      const res = await adminDeletionService.restoreService(svc._id);
      if (res?.success) {
        setFeedback({ type: 'success', message: res.message || 'Service restored as DRAFT.' });
        await fetchServices();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Could not restore service.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async ({ reason }) => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { service, mode } = deleteTarget;
      const res =
        mode === 'permanent'
          ? await adminDeletionService.permanentDeleteService(service._id)
          : await adminDeletionService.softDeleteService(service._id, reason);

      if (res?.success) {
        setDeleteTarget(null);
        setViewingService(null);
        setFeedback({
          type: 'success',
          message:
            res.message ||
            (mode === 'permanent'
              ? `Service "${service.title}" permanently deleted.`
              : `Service "${service.title}" moved to trash.`),
        });
        await fetchServices();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete service.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminLayout
      title="Services & Packages"
      subtitle="Moderate provider service packages, approval status, visibility, and safe removal"
    >
      {/* Filters Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                currentStatus === tab.value
                  ? tab.value === 'deleted'
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:w-72">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search service title, category..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6A03]"
            />
          </div>
          <button
            type="submit"
            className="p-1.5 bg-slate-900 text-white rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
            aria-label="Search services"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {providerIdFilter && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
          <span>
            Filtered by Provider ID: <strong className="font-mono">{providerIdFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('providerId');
              setSearchParams(next);
            }}
            className="font-bold text-blue-700 hover:underline cursor-pointer"
          >
            Show All Providers
          </button>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mb-6 p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
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
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Services Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#FF6A03] border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs text-slate-500">Loading provider services & packages...</p>
          </div>
        ) : services.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">
              {currentStatus === 'deleted' ? 'Trash is Empty' : 'No Services or Packages Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {currentStatus === 'deleted'
                ? 'No deleted services or packages are currently in trash.'
                : 'Provider services will appear here once providers create offerings.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Service / Package</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Approval</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((svc) => {
                  const isBusy = busyId === svc._id;
                  const isDeletedRow = Boolean(svc.isDeleted);
                  return (
                    <tr key={svc._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 block">{svc.title}</span>
                        <span className="text-[11px] font-mono text-slate-400 block">
                          /{svc.slug}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {svc.provider ? (
                          <Link
                            to={`/admin/providers/${svc.provider._id}`}
                            className="font-semibold text-[#012A7A] hover:underline inline-flex items-center gap-1"
                          >
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{svc.provider.businessName}</span>
                          </Link>
                        ) : (
                          <span className="text-slate-400 italic">Unknown Provider</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700 block">{svc.category}</span>
                        {svc.subcategory && (
                          <span className="text-[11px] text-slate-400">{svc.subcategory}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {svc.priceLabel || 'Custom Quote'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            svc.approvalStatus === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : svc.approvalStatus === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {svc.approvalStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isDeletedRow ? (
                          <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            TRASHED
                          </span>
                        ) : (
                          <span
                            className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              svc.isActive && svc.publicationStatus === 'PUBLISHED'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {svc.publicationStatus} {svc.isActive ? '' : '(Inactive)'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingService(svc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#012A7A] hover:bg-slate-100 cursor-pointer"
                            title={`View ${svc.title}`}
                            aria-label={`View ${svc.title}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {!isDeletedRow ? (
                            <>
                              {svc.approvalStatus !== 'APPROVED' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleApproval(svc, 'APPROVED')}
                                  className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Approve service"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                              )}
                              {svc.approvalStatus === 'PENDING' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleApproval(svc, 'REJECTED')}
                                  className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Reject service"
                                >
                                  <XCircle className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleToggleActive(svc)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                                title={svc.isActive ? 'Deactivate service' : 'Activate service'}
                                aria-label={svc.isActive ? `Deactivate ${svc.title}` : `Activate ${svc.title}`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setDeleteError('');
                                  setDeleteTarget({ service: svc, mode: 'soft' });
                                }}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                title={`Move ${svc.title} to trash`}
                                aria-label={`Delete service ${svc.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRestore(svc)}
                                className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title={`Restore ${svc.title}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setDeleteError('');
                                    setDeleteTarget({ service: svc, mode: 'permanent' });
                                  }}
                                  className="py-1 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title={`Permanently delete ${svc.title}`}
                                  aria-label={`Permanently delete service ${svc.title}`}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Service Modal */}
      {viewingService && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="bg-[#012A7A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 block">
                  Service / Package Inspector
                </span>
                <h3 className="text-base font-extrabold">{viewingService.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingService(null)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                aria-label="Close service details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Provider</span>
                <span className="font-bold text-slate-900">
                  {viewingService.provider?.businessName || viewingService.providerId}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Category / Subcategory</span>
                <span className="font-semibold text-slate-800">
                  {viewingService.category}
                  {viewingService.subcategory ? ` → ${viewingService.subcategory}` : ''}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Pricing</span>
                <span className="font-bold text-slate-900">{viewingService.priceLabel}</span>
              </div>
              <div className="py-1.5">
                <span className="text-slate-500 block mb-1">Description</span>
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 leading-relaxed">
                  {viewingService.description}
                </p>
              </div>
              {Array.isArray(viewingService.deliverables) && viewingService.deliverables.length > 0 && (
                <div className="py-1.5">
                  <span className="text-slate-500 block mb-1">Deliverables</span>
                  <div className="flex flex-wrap gap-1.5">
                    {viewingService.deliverables.map((d, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                {!viewingService.isDeleted && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError('');
                      setDeleteTarget({ service: viewingService, mode: 'soft' });
                    }}
                    className="py-2 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Move to Trash</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingService(null)}
                  className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        mode={deleteTarget?.mode || 'soft'}
        entityType="Service / Package"
        recordName={deleteTarget?.service?.title || ''}
        identifierLabel={
          deleteTarget?.service
            ? `${deleteTarget.service.category}${
                deleteTarget.service.provider?.businessName
                  ? ` · Provider: ${deleteTarget.service.provider.businessName}`
                  : ''
              }`
            : ''
        }
        description={
          deleteTarget?.mode === 'permanent'
            ? 'This service/package will be permanently removed from MongoDB and unlinked from the provider summary list. The parent provider profile will remain intact.'
            : 'This service/package will be archived and hidden from active provider and public listings. The parent provider profile will remain intact.'
        }
        impactItems={
          deleteTarget?.mode === 'permanent'
            ? [
                'Removes the ProviderService document permanently.',
                'Removes this service title from the parent provider profile summary.',
                'Parent Provider business profile and unrelated services remain untouched.',
              ]
            : []
        }
        isSubmitting={isDeleting}
        errorMessage={deleteError}
      />
    </AdminLayout>
  );
}
