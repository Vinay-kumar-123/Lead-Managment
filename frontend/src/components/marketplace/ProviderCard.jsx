import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, ShieldAlert, CheckCircle2, Phone } from 'lucide-react';
import Badge from '../common/Badge.jsx';

export default function ProviderCard({ provider }) {
  // Safe initials generator for avatar placeholder
  const getInitials = (name) => {
    if (!name) return 'KP';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  };

  return (
    <div className="card-hover bg-white p-5 sm:p-6 flex flex-col justify-between h-full border-border/80">
      <div>
        {/* Top Header: Avatar + Verification/Sample Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-base shadow-sm flex-shrink-0"
              aria-hidden="true"
            >
              {getInitials(provider.businessName)}
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-primary line-clamp-1">
                {provider.businessName}
              </h3>
              <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{provider.location}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Labels: Primary Service + Dev Sample Indicator */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="teal">{provider.mainService}</Badge>

          {provider.isDevSample && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldAlert className="w-3 h-3" aria-hidden="true" />
              <span>Development Sample</span>
            </span>
          )}

          {provider.verificationStatus === 'verified' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              <span>Manually Verified</span>
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-text-muted text-xs sm:text-sm leading-relaxed mb-4 line-clamp-3">
          {provider.description}
        </p>

        {/* Services / Tags Offered */}
        {provider.servicesOffered && provider.servicesOffered.length > 0 && (
          <div className="mb-4">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1.5">
              Services Offered:
            </span>
            <div className="flex flex-wrap gap-1">
              {provider.servicesOffered.slice(0, 3).map((item, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-medium text-text-primary/80 bg-slate-100 px-2 py-0.5 rounded"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation CTA & Direct Phone */}
      <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
        {provider.contactNumber ? (
          <a
            href={`tel:${provider.contactNumber}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 px-2 py-1 rounded-lg transition-colors"
            title={`Call ${provider.businessName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="w-3 h-3 text-teal-600" />
            <span className="font-mono">{provider.contactNumber}</span>
          </a>
        ) : (
          <Link
            to={`/providers/${provider.slug}`}
            className="text-xs sm:text-sm font-semibold text-primary hover:text-accent transition-colors flex items-center gap-1"
          >
            <span>View Profile</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {provider.contactNumber && (
            <Link
              to={`/providers/${provider.slug}`}
              className="text-xs font-semibold text-primary hover:text-accent transition-colors hidden sm:inline-block"
            >
              Profile
            </Link>
          )}

          <Link
            to={`/get-quote?service=${encodeURIComponent(provider.mainService || provider.category || '')}&provider=${encodeURIComponent(provider.businessName)}`}
            className="btn-primary text-xs py-1 px-3"
          >
            Request Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
