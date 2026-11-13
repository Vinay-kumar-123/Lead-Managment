import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import { categories } from '../../data/categories.js';
import { Layers, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Tag } from 'lucide-react';

export default function AdminCategoriesPage() {
  return (
    <AdminLayout
      title="Categories & Service Taxonomy"
      subtitle="Canonical service verticals, classification taxonomy, and multi-category governance"
    >
      <div className="mb-6 p-4 bg-teal-50 border border-teal-200 text-teal-900 rounded-2xl flex items-start sm:items-center justify-between gap-4 text-xs">
        <div>
          <strong className="font-bold block mb-0.5">Architecture Status: Standard Taxonomy</strong>
          <span>
            These 5 canonical verticals drive customer search, provider onboarding routing, and SEO directory generation across India.
          </span>
        </div>
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-[#13A89E] text-white whitespace-nowrap">
          5 Verticals Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat, idx) => (
          <div
            key={cat.id || idx}
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4 hover:border-[#13A89E]/40 transition-colors"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-mono font-bold text-[#13A89E] uppercase tracking-wider">
                Vertical 0{idx + 1}
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                ACTIVE
              </span>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-[#142D4E] mb-1">{cat.name}</h3>
              <p className="text-xs text-slate-500 font-mono">slug: /{cat.slug}</p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{cat.description}</p>

            <div className="pt-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
                Supported Sub-Services
              </span>
              <div className="flex flex-wrap gap-1.5">
                {cat.services?.map((svc, sIdx) => (
                  <span
                    key={sIdx}
                    className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md"
                  >
                    {svc.name || svc}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
