import React, { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import BrandLogo from '../components/common/BrandLogo.jsx';

const navLinks = [
  { label: 'Categories', href: '/categories' },
  { label: 'Providers', href: '/providers' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route transition
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Elevation on scroll
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent background scroll when mobile modal is active
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-card border-b border-border'
          : 'bg-white border-b border-border/80'
      }`}
    >
      <div className="container-max">
        <nav
          className="flex items-center justify-between h-16 sm:h-20 px-4 sm:px-6 lg:px-8"
          aria-label="Main Navigation"
        >
          {/* Logo & Brand Identity */}
          <Link
            to="/"
            className="flex items-center gap-3 flex-shrink-0 group focus-visible:ring-accent rounded-sm"
            aria-label="Dealsathi Home"
          >
            <BrandLogo variant="header" showWordmark={true} showTagline={true} />
          </Link>

          {/* Desktop Navigation Links */}
          <ul className="hidden md:flex items-center gap-1 lg:gap-2" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavLink
                  to={link.href}
                  className={({ isActive }) =>
                    `px-3.5 py-2 rounded-sm text-sm font-semibold transition-colors duration-150 ${
                      isActive
                        ? 'text-accent-600 bg-accent-50'
                        : 'text-text-primary hover:text-primary hover:bg-primary-50/70'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Desktop Call to Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/become-a-partner"
              className="text-sm font-semibold text-primary hover:text-accent px-3 py-2 rounded-sm hover:bg-slate-50 transition-colors"
            >
              Become a Partner
            </Link>
            <Link
              to="/get-quote"
              className="btn-primary text-sm py-2.5 px-5 shadow-sm"
            >
              <span>Get a Quote</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/get-quote"
              className="btn-primary text-xs py-2 px-3.5"
            >
              Get Quote
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-sm text-primary hover:bg-slate-100 transition-colors focus-visible:ring-accent"
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isOpen}
              aria-controls="mobile-nav"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div
          id="mobile-nav"
          className="md:hidden fixed inset-x-0 top-16 sm:top-20 bottom-0 bg-white z-40 overflow-y-auto border-t border-border px-5 py-6 flex flex-col justify-between"
          role="dialog"
          aria-label="Mobile Navigation"
        >
          <div className="space-y-1">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 px-3">
              Explore Dealsathi
            </p>
            {navLinks.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                className={({ isActive }) =>
                  `block px-3.5 py-3 rounded-sm text-base font-semibold transition-colors ${
                    isActive
                      ? 'text-accent-600 bg-accent-50'
                      : 'text-text-primary hover:bg-slate-50'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="pt-6 border-t border-border space-y-3">
            <Link
              to="/become-a-partner"
              className="block w-full text-center btn-secondary py-3 text-sm font-semibold"
            >
              For Providers — Become a Partner
            </Link>
            <Link
              to="/get-quote"
              className="block w-full text-center btn-primary py-3 text-sm font-semibold"
            >
              Get a Free Quote
            </Link>
            <p className="text-center text-xs text-text-muted pt-2">
              Dealsathi • Pan-India Service Discovery & Verified Advisory
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
