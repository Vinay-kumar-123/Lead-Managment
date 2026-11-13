import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { categories } from '../data/categories.js';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-primary text-white border-t border-primary-600/30">
      <div className="container-max px-4 sm:px-6 lg:px-8">
        {/* Main Footer Directory */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 py-16">
          {/* Brand Info & Mission */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-3 mb-5" aria-label="KONNEVIA Home">
              <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center p-1.5 shadow-sm">
                <svg viewBox="0 0 40 40" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="7" y="6" width="6" height="28" rx="2" fill="#FFFFFF" />
                  <path d="M13 22 L24 9 H31 L20 22 L32 34 H25 L13 22 Z" fill="#142D4E" />
                  <rect x="15" y="27" width="2.5" height="2.5" rx="0.5" fill="#FFFFFF" />
                  <rect x="19" y="27" width="2.5" height="2.5" rx="0.5" fill="#FFFFFF" />
                  <rect x="15" y="31" width="2.5" height="2.5" rx="0.5" fill="#FFFFFF" />
                  <rect x="19" y="31" width="2.5" height="2.5" rx="0.5" fill="#FFFFFF" />
                </svg>
              </div>
              <span className="text-2xl font-black text-white tracking-tight">KONNEVIA</span>
            </Link>

            <p className="text-sm text-blue-100/80 leading-relaxed mb-6 max-w-sm">
              Pan-India multi-category service discovery marketplace. We connect homeowners, event organizers, and businesses with vetted professionals through a personalized, consent-first matching model.
            </p>

            <div className="space-y-3 text-xs text-blue-200">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-accent flex-shrink-0" />
                <span>Manual verification before introduction</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-accent flex-shrink-0" />
                <span>No spam policy — direct consent required</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Mail size={16} className="text-accent flex-shrink-0" />
                <a href="mailto:hello@konnevia.in" className="hover:text-white transition-colors underline">
                  hello@konnevia.in
                </a>
              </div>
            </div>
          </div>

          {/* Core Categories */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Marketplace Verticals
            </h3>
            <ul className="space-y-2.5 text-sm">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/categories/${cat.slug}`}
                    className="text-blue-100/75 hover:text-accent transition-colors block py-0.5"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Explore & Company
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/categories" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  All Categories
                </Link>
              </li>
              <li>
                <Link to="/providers" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  Find Providers
                </Link>
              </li>
              <li>
                <Link to="/get-quote" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  Get a Free Quote
                </Link>
              </li>
              <li>
                <Link to="/become-a-partner" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  Become a Partner
                </Link>
              </li>
              <li>
                <Link to="/blog" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  Marketplace Insights
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  About KONNEVIA
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-blue-100/75 hover:text-accent transition-colors block py-0.5">
                  Contact Team
                </Link>
              </li>
            </ul>
          </div>

          {/* Conversion CTA Block */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Need Assistance?
            </h3>
            <p className="text-xs text-blue-100/80 leading-relaxed mb-4">
              Submit your requirements in 2 minutes. Our team will verify and connect you with qualified local professionals.
            </p>
            <Link
              to="/get-quote"
              className="inline-flex items-center gap-2 bg-accent text-white text-xs font-bold px-4 py-2.5 rounded-sm hover:bg-accent-600 transition-colors shadow-sm mb-4"
            >
              <span>Submit Enquiry</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <div className="pt-2 border-t border-primary-600/40">
              <span className="text-[11px] text-blue-200 block">Are you a service business?</span>
              <Link to="/become-a-partner" className="text-xs text-accent hover:underline font-semibold mt-1 inline-block">
                Apply to join our network →
              </Link>
            </div>
          </div>
        </div>

        {/* Legal & Compliance Bottom Bar */}
        <div className="border-t border-primary-700/60 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-300">
          <p>
            © {currentYear} KONNEVIA. All rights reserved. Working brand identity pending formal India trademark clearance.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-white transition-colors">
              Terms & Conditions
            </Link>
            <Link to="/contact" className="hover:text-white transition-colors">
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
