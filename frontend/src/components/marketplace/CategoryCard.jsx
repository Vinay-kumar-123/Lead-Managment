import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Home, Camera, Building2, Monitor, GraduationCap, Layers } from 'lucide-react';

const iconMap = {
  Home,
  Camera,
  Building2,
  Monitor,
  GraduationCap,
  Layers,
};

export default function CategoryCard({ category }) {
  const IconComponent = iconMap[category.icon] || Layers;

  return (
    <Link
      to={`/categories/${category.slug}`}
      className="group card-hover p-6 sm:p-7 flex flex-col justify-between h-full bg-white transition-all duration-200 border-border/80 hover:border-accent/40"
      aria-label={`Explore ${category.name} services`}
    >
      <div>
        {/* Category Icon Badge */}
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center mb-5 transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundColor: category.bgColor || '#EEF3FF' }}
        >
          <IconComponent
            className="w-6 h-6 sm:w-7 sm:h-7 transition-colors duration-200"
            style={{ color: category.color || '#012A7A' }}
            aria-hidden="true"
          />
        </div>

        {/* Category Title */}
        <h3 className="text-lg sm:text-xl font-bold text-primary group-hover:text-accent transition-colors duration-150 mb-2">
          {category.name}
        </h3>

        {/* Short Description */}
        <p className="text-text-muted text-xs sm:text-sm leading-relaxed mb-4">
          {category.shortDescription || category.description}
        </p>

        {/* Subcategories preview tags */}
        {category.subcategories && category.subcategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {category.subcategories.slice(0, 3).map((sub) => (
              <span
                key={sub.id}
                className="inline-block text-[11px] font-medium text-text-muted bg-slate-100/90 px-2 py-0.5 rounded"
              >
                {sub.name}
              </span>
            ))}
            {category.subcategories.length > 3 && (
              <span className="inline-block text-[11px] font-semibold text-accent-700 bg-accent-50 px-1.5 py-0.5 rounded border border-accent-100">
                +{category.subcategories.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs sm:text-sm font-semibold text-primary group-hover:text-accent">
        <span>Explore Category</span>
        <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
