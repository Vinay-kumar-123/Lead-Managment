import React from 'react';
import dsLogo from '../../assets/dealsathi-logo.png';

/**
 * Official Dealsathi Brand Logo Component
 * Uses the exact supplied DS logo asset with preserved aspect ratio (895 x 499, ~1.79:1)
 * and renders appropriate contrast containers for light and dark backgrounds.
 *
 * Variants:
 * - "header"  (Desktop & Mobile Navbar on light surface)
 * - "footer"  (Footer on dark primary blue surface)
 * - "sidebar" (Admin Sidebar on dark surface)
 * - "auth"    (Admin Login / Authentication card)
 */
export default function BrandLogo({
  variant = 'header',
  showWordmark = true,
  showTagline = false,
  subtitle = null,
  className = '',
}) {
  const isDarkBg = variant === 'footer' || variant === 'sidebar' || variant === 'auth';

  // Size configurations preserving exact aspect ratio without stretching
  const sizeConfigs = {
    header: {
      badge: 'px-2 py-1.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs',
      img: 'h-7 sm:h-8 w-auto object-contain',
      wordmark: 'text-xl sm:text-2xl font-black tracking-tight leading-none',
      tagline: 'text-[10px] sm:text-[11px] text-text-muted font-medium tracking-normal mt-0.5 hidden sm:block',
    },
    footer: {
      badge: 'px-2.5 py-1.5 rounded-lg bg-white shadow-sm border border-white/20',
      img: 'h-7 sm:h-8 w-auto object-contain',
      wordmark: 'text-2xl font-black tracking-tight leading-none',
      tagline: 'text-[10px] text-blue-200 font-medium tracking-normal mt-0.5 block',
    },
    sidebar: {
      badge: 'px-2 py-1 rounded-lg bg-white shadow-sm',
      img: 'h-6 w-auto object-contain',
      wordmark: 'text-lg font-black tracking-tight leading-none',
      tagline: 'text-[10px] uppercase font-bold text-accent-400 tracking-widest mt-0.5 block',
    },
    auth: {
      badge: 'px-4 py-2.5 rounded-2xl bg-white shadow-md border border-slate-200/80 mx-auto inline-flex items-center justify-center',
      img: 'h-10 sm:h-11 w-auto object-contain',
      wordmark: 'text-2xl font-black tracking-tight leading-none mt-3 block',
      tagline: 'text-xs text-slate-400 mt-1.5 uppercase tracking-widest font-bold block',
    },
  };

  const cfg = sizeConfigs[variant] || sizeConfigs.header;

  if (variant === 'auth') {
    return (
      <div className={`text-center ${className}`}>
        <div className={cfg.badge}>
          <img
            src={dsLogo}
            alt="Dealsathi DS Logo"
            className={cfg.img}
            width="79"
            height="44"
          />
        </div>
        {showWordmark && (
          <div className={cfg.wordmark}>
            <span className="text-white">Deal</span>
            <span className="text-accent-400">sathi</span>
          </div>
        )}
        {subtitle && <span className={cfg.tagline}>{subtitle}</span>}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 flex-shrink-0 ${className}`}>
      <div className={`${cfg.badge} flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-[1.02]`}>
        <img
          src={dsLogo}
          alt="Dealsathi DS Logo"
          className={cfg.img}
          width="58"
          height="32"
        />
      </div>

      {showWordmark && (
        <div className="flex flex-col justify-center">
          <span className={cfg.wordmark}>
            <span className={isDarkBg ? 'text-white' : 'text-primary'}>Deal</span>
            <span className={isDarkBg ? 'text-accent-400' : 'text-accent'}>sathi</span>
          </span>
          {showTagline && (
            <span className={cfg.tagline}>
              {subtitle || 'Discover. Connect. Get Things Done.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
