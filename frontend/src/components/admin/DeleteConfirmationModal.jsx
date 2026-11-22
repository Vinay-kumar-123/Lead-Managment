import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, ShieldAlert, Info } from 'lucide-react';

/**
 * Consistent confirmation modal for Soft Delete (Move to Trash) and
 * Permanent Delete (Irreversible) across all Dealsathi Admin sections.
 */
export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  mode = 'soft', // 'soft' | 'permanent'
  entityType = 'Record',
  recordName = '',
  identifierLabel = '',
  description = '',
  impactItems = [],
  mediaItems = [],
  blockedReason = '',
  requireTypedConfirmation = false,
  isSubmitting = false,
  errorMessage = '',
  confirmLabel = '',
}) {
  const [reason, setReason] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setAckChecked(false);
      setTypedName('');
    }
  }, [isOpen, recordName, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isPermanent = mode === 'permanent';
  const typedMatches =
    !requireTypedConfirmation ||
    typedName.trim().toLowerCase() === String(recordName || '').trim().toLowerCase();

  const canSubmit =
    !isSubmitting &&
    !blockedReason &&
    (!isPermanent || (ackChecked && typedMatches));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({ reason: reason.trim(), typedName: typedName.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden my-6">
        {/* Header */}
        <div
          className={`px-6 py-4 flex items-center justify-between text-white ${
            isPermanent ? 'bg-rose-700' : 'bg-[#012A7A]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isPermanent ? (
              <ShieldAlert className="w-5 h-5 text-rose-200 shrink-0" />
            ) : (
              <Trash2 className="w-5 h-5 text-amber-300 shrink-0" />
            )}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 block">
                {isPermanent ? 'Irreversible Super Admin Action' : 'Soft Delete / Archive'}
              </span>
              <h3 id="delete-modal-title" className="text-sm sm:text-base font-extrabold">
                {isPermanent
                  ? `Permanently Delete ${entityType}`
                  : `Move ${entityType} to Trash`}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => !isSubmitting && onClose()}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Target Record Identity */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Target {entityType}
            </span>
            <p className="text-sm font-extrabold text-slate-900 break-words">
              {recordName || 'Selected Record'}
            </p>
            {identifierLabel && (
              <p className="text-[11px] font-mono text-slate-500 mt-0.5 break-all">
                {identifierLabel}
              </p>
            )}
          </div>

          {/* Warning / Explanation */}
          {isPermanent ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="block mb-0.5">Permanent deletion cannot be undone.</strong>
                <span>
                  {description ||
                    'This record will be permanently removed from MongoDB along with its owned assets. It cannot be restored.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span>
                  {description ||
                    'This record will be excluded from active and public listings and can be restored later from Trash.'}
                </span>
              </div>
            </div>
          )}

          {/* Impact Summary */}
          {impactItems.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Affected Related Records
              </span>
              <ul className="space-y-1 text-slate-700">
                {impactItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Owned Media Assets */}
          {mediaItems.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Owned Uploaded Files to Clean Up
              </span>
              <ul className="space-y-1 font-mono text-[11px] text-slate-600">
                {mediaItems.map((m, idx) => (
                  <li key={idx} className="truncate">
                    [{m.provider}] {m.publicId}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Blocker Notice */}
          {blockedReason && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 font-semibold"
            >
              {blockedReason}
            </div>
          )}

          {/* Soft delete optional reason */}
          {!isPermanent && (
            <div>
              <label
                htmlFor="soft-delete-reason"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1"
              >
                Reason / Audit Note (Optional)
              </label>
              <input
                id="soft-delete-reason"
                type="text"
                maxLength={250}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Duplicate entry, spam lead, business closed..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#012A7A]"
              />
            </div>
          )}

          {/* Strong Confirmation Controls for Permanent Delete */}
          {isPermanent && !blockedReason && (
            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackChecked}
                  onChange={(e) => setAckChecked(e.target.checked)}
                  disabled={isSubmitting}
                  className="w-4 h-4 text-rose-600 rounded mt-0.5 cursor-pointer"
                />
                <span className="text-slate-700 leading-relaxed font-medium">
                  I understand this permanent deletion is irreversible and will remove the database
                  record{mediaItems.length > 0 ? ' and its owned media assets' : ''}.
                </span>
              </label>

              {requireTypedConfirmation && (
                <div>
                  <label
                    htmlFor="confirm-typed-name"
                    className="block text-[11px] font-bold text-slate-700 mb-1"
                  >
                    Type <span className="font-mono text-rose-700">{recordName}</span> to confirm:
                  </label>
                  <input
                    id="confirm-typed-name"
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    disabled={isSubmitting}
                    placeholder={recordName}
                    autoComplete="off"
                    className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold"
            >
              {errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            {!blockedReason && (
              <button
                type="submit"
                disabled={!canSubmit}
                data-testid="confirm-delete-submit-btn"
                className={`py-2 px-4 rounded-xl font-bold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isPermanent
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#012A7A] hover:bg-[#1B3B66]'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {confirmLabel ||
                        (isPermanent ? 'Permanently Delete' : 'Move to Trash')}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
