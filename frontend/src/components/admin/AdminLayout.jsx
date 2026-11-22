import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import BrandLogo from '../common/BrandLogo.jsx';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  LogOut,
  ExternalLink,
  Building2,
  FileText,
  Activity,
  Settings,
  Layers,
  Package,
  Menu,
  X,
} from 'lucide-react';

export default function AdminLayout({ children, title, subtitle }) {
  usePageMeta({
    title: title ? `${title} — Dealsathi Admin` : 'Admin Portal — Dealsathi',
    description: 'Private administrative workspace for Dealsathi operations.',
    canonical: null,
    robots: 'noindex, nofollow',
  });

  const { admin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navItems = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Enquiries', href: '/admin/enquiries', icon: FileText },
    { label: 'Partner Applications', href: '/admin/applications', icon: Users },
    { label: 'Verified Providers', href: '/admin/providers', icon: Building2 },
    { label: 'Services & Packages', href: '/admin/services', icon: Package },
    { label: 'Categories & Services', href: '/admin/categories', icon: Layers },
    { label: 'Blog CMS', href: '/admin/blogs', icon: BookOpen },
    { label: 'Activity Logs', href: '/admin/activity-logs', icon: Activity },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  const isCurrentActive = (itemHref) => {
    if (itemHref === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(itemHref);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-text-primary">
      {/* Mobile Header */}
      <header className="md:hidden bg-primary-900 text-white p-4 flex items-center justify-between border-b border-primary-800">
        <div className="flex items-center gap-2.5">
          <BrandLogo variant="sidebar" showWordmark={true} showTagline={false} />
          <span className="text-[10px] uppercase font-bold text-accent-400 tracking-widest px-1.5 py-0.5 rounded bg-accent/20">
            Admin
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-300 hover:text-white"
          aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`w-full md:w-64 bg-primary-900 text-slate-200 flex flex-col justify-between shrink-0 ${
          mobileMenuOpen ? 'block' : 'hidden md:flex'
        }`}
      >
        <div>
          {/* Logo and Brand */}
          <div className="p-5 border-b border-primary-800/80 flex items-center justify-between">
            <Link to="/admin" className="group">
              <BrandLogo
                variant="sidebar"
                showWordmark={true}
                showTagline={true}
                subtitle="Operations Portal"
              />
            </Link>
          </div>

          {/* Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = isCurrentActive(item.href);
              return (
                <Link
                  key={idx}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-primary-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info & Actions */}
        <div className="p-4 border-t border-primary-800/80 space-y-3">
          <div className="px-3.5 py-2.5 bg-primary-800/60 rounded-xl text-xs border border-primary-700/50">
            <span className="text-[10px] text-blue-200/70 uppercase font-bold block mb-0.5">
              Logged in as
            </span>
            <span className="font-semibold text-white truncate block">{admin?.email || 'Owner'}</span>
            <span className="text-[10px] text-accent-400 font-bold uppercase tracking-wider">
              {admin?.role || 'SUPER_ADMIN'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors"
            >
              <span>Live Site</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <div className="bg-white border-b border-slate-200 px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-primary tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 font-medium">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Dealsathi Core Online</span>
            </span>
          </div>
        </div>

        {/* Child Pages Container */}
        <div className="p-6 sm:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
