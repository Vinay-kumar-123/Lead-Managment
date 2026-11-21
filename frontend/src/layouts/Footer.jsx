import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { categories } from '../data/categories.js';
import BrandLogo from '../components/common/BrandLogo.jsx';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-primary-900 text-white border-t border-primary-700/40">
      <div className="container-max px-4 sm:px-6 lg:px-8">
        {/* Main Footer Directory */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 py-16">
          {/* Brand Info & Mission */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-3 mb-5 group" aria-label="Dealsathi Home">
              <BrandLogo variant="footer" showWordmark={true} showTagline={true} />
            </Link>

            <p className="text-sm text-blue-100/85 leading-relaxed mb-6 max-w-sm">
              Dealsathi is a Pan-India multi-category service discovery marketplace. We connect homeowners, event organizers, and businesses with vetted professionals through a personalized, consent-first matching model.
            </p>

            <div className="space-y-3 text-xs text-blue-200">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-accent-400 flex-shrink-0" />
                <span>Manual verification before introduction</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-accent-400 flex-shrink-0" />
                <span>No spam policy — direct consent required</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Mail size={16} className="text-accent-400 flex-shrink-0" />
                <a href="mailto:hello@dealsathi.in" className="hover:text-white transition-colors underline">
                  hello@dealsathi.in
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
                    className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5"
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
                <Link to="/categories" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  All Categories
                </Link>
              </li>
              <li>
                <Link to="/providers" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  Find Providers
                </Link>
              </li>
              <li>
                <Link to="/get-quote" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  Get a Free Quote
                </Link>
              </li>
              <li>
                <Link to="/become-a-partner" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  Become a Partner
                </Link>
              </li>
              <li>
                <Link to="/blog" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  Marketplace Insights
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
                  About Dealsathi
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-blue-100/80 hover:text-accent-400 transition-colors block py-0.5">
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
            <div className="pt-3 border-t border-primary-700/50">
              <span className="text-[11px] text-blue-200 block">Are you a service business?</span>
              <Link to="/become-a-partner" className="text-xs text-accent-400 hover:underline font-semibold mt-1 inline-block">
                Apply to join our network →
              </Link>
            </div>
          </div>
        </div>

        {/* Legal & Compliance Bottom Bar */}
        <div className="border-t border-primary-800/80 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-200/80">
          <p>
            © {currentYear} Dealsathi. All rights reserved. Pan-India Verified Service Discovery Marketplace.
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
