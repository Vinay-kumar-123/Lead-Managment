# PHASE 1 — EXISTING CODEBASE AUDIT REPORT (DEALSATHI MIGRATION)

**Date:** November 22, 2026
**Objective:** Controlled brand migration from **KONNEVIA** to **Dealsathi** (`DEALSATHI`) and comprehensive UI/UX refinement across customer marketplace, provider onboarding, and operational admin portal while preserving 100% of existing functionality, JavaScript technology stack, and API/database compatibility.

---

## 1. Repository Structure & Folder Separation
The repository (`d:\projects\LeadManagment`) enforces a strict, decoupled monorepo-style separation:
- `frontend/` — Standalone Single Page Application (React 19 + Vite 6 + Tailwind CSS 3), zero backend code.
- `backend/` — Standalone REST API & SEO Prerender Server (Node.js + Express 4 + Mongoose 8), zero frontend code.
- `docs/` — Architecture, API, environment, security, and deployment documentation.
- `screenshots/` — Playwright verification scripts and viewport captures.
- `uploads/` — Local media storage fallback directory.

## 2. Frontend Framework & Programming Language
- **Language:** Modern ES Modules JavaScript (`.js`, `.jsx`). Zero TypeScript files.
- **Framework:** React `^19.0.0`, React Router DOM `^7.18.5`, Lucide React `^1.72.0`.
- **Build Tool:** Vite `^6.0.7` (`@vitejs/plugin-react`).
- **Styling:** Tailwind CSS `^3.4.17` + PostCSS + Autoprefixer (`frontend/tailwind.config.js`, `frontend/src/styles/index.css`).

## 3. Backend Framework & Programming Language
- **Language:** Node.js ES Modules JavaScript (`.js`) with `.cjs` automated integration test suites.
- **Framework:** Express `^4.21.2` with `helmet`, `cors`, `morgan`, `cookie-parser`, `express-rate-limit`, and `multer`.
- **Entry Point:** `backend/server.js` -> `backend/src/app.js`.

## 4. Database & Data Models
- **Database:** MongoDB Atlas (via Mongoose `^8.9.5`) with development in-memory fallback when disconnected.
- **Models (`backend/src/models/`):**
  1. `Lead.js` — Customer quote enquiries (`type: 'enquiry'`), partner applications (`type: 'partner'`), and contact desk messages (`type: 'contact'`), including `shopImage` metadata and consent audit fields.
  2. `Provider.js` — Verified service providers with `verificationStatus` (`UNVERIFIED`, `VERIFIED`, `REVOKED`), `publicationStatus` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `consentToDisplayPhone`, and `shopImage`.
  3. `Blog.js` — Editorial CMS articles with slug, markdown content, SEO fields, `status` (`draft`, `published`, `archived`), and author info.
  4. `Admin.js` — Administrator accounts with salted `crypto.scryptSync` password hashes and 32-byte session tokens.
  5. `ActivityLog.js` — Immutable audit log for admin operations (`AUTH`, `LEAD`, `PROVIDER`, `BLOG`, `SETTINGS`).

## 5. Existing Component Architecture
- **Common Components (`frontend/src/components/common/`):** `Alert.jsx`, `Badge.jsx`, `Breadcrumb.jsx`, `Button.jsx`, `Card.jsx`, `EmptyState.jsx`, `Input.jsx`, `LoadingSpinner.jsx`, `SectionHeading.jsx`.
- **Marketplace Components (`frontend/src/components/marketplace/`):** `CategoryCard.jsx`, `HeroSearch.jsx`, `HowItWorks.jsx` (`HowItWorksSection`, `TrustSection`), `ProviderCard.jsx`, `ServiceCard.jsx`.
- **Admin Components (`frontend/src/components/admin/`):** `AdminLayout.jsx`, `ProtectedRoute.jsx`.

## 6. Routing & Navigation
- **Declarative Router (`frontend/src/routes/AppRoutes.jsx`):**
  - **Public Marketplace Routes (wrapped in `MainLayout` with `Navbar` and `Footer`):** `/`, `/categories`, `/categories/:slug`, `/services/:slug`, `/providers`, `/providers/:slug`, `/get-quote`, `/become-a-partner`, `/blog`, `/blog/:slug`, `/about`, `/contact`, `/privacy-policy`, `/terms`, `*` (`NotFoundPage`).
  - **Protected Admin Portal Routes:** `/admin/login`, `/admin`, `/admin/enquiries`, `/admin/applications`, `/admin/applications/:id`, `/admin/providers`, `/admin/providers/:id`, `/admin/categories`, `/admin/blogs`, `/admin/blogs/new`, `/admin/blogs/:id`, `/admin/activity-logs`, `/admin/settings`.

## 7. Shared Layouts & Design Tokens
- **Layouts:** `MainLayout.jsx`, `Navbar.jsx`, `Footer.jsx`, `AdminLayout.jsx`.
- **Current Design Tokens (`tailwind.config.js` & `index.css`):**
  - Previously configured for KONNEVIA navy (`#142D4E`) and teal (`#13A89E`).
  - Will be migrated to the **Dealsathi** Blue-and-Orange identity sampled directly from the supplied DS logo (`primary` Deep Royal/Navy Blue `#012A7A` / `#02165F` / `#014EBA` scale, `accent` Vibrant Brand Orange `#FF6A03` / `#EA580C` scale, clean white & neutral slate surfaces).

## 8. Authentication & Authorization
- **Admin Auth (`AuthContext.jsx`, `backend/src/middleware/auth.js`, `adminAuthController.js`):**
  - Supports Bearer token (`Authorization: Bearer <token>`), `x-admin-token` header, and `HttpOnly` cookie.
  - Note: Cookie name `konnevia_admin_session` and localStorage keys (`konnevia_admin_token`, `konnevia_admin_user`) will be preserved (or dual-read) to prevent breaking existing sessions or automated test suites.

## 9. Admin Panel Architecture
- Full operational suite covering live MongoDB KPI metrics, Customer Enquiry status transitions, Partner Application KYC & shop photo verification (Approve -> Verified Draft Provider, Reject with reason), Provider Profile & Phone Visibility Editor, Category Taxonomy viewer, Blog Markdown CMS, Activity Audit Logs, and Security Settings.

## 10. SEO Infrastructure
- **Frontend:** `frontend/src/utils/seo.js` + `frontend/src/hooks/usePageMeta.js` managing dynamic `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph (`og:*`), Twitter Cards (`twitter:*`), and dynamic JSON-LD structured data.
- **Backend:**
  - `sitemapController.js` (`GET /sitemap.xml`) dynamically generating XML for static routes, published blogs, and verified+published providers.
  - `renderController.js` (`GET /render/blog/:slug` and crawler User-Agent middleware on `GET /blog/:slug`) serving SSR HTML with Article JSON-LD and OG tags to bots.
  - Note: `backend/test-seo-infrastructure.cjs` tests `/render/blog/how-to-choose-interior-designer` and `/sitemap.xml`. We will ensure the brand updates in `renderController.js`, `blogController.js`, and `test-seo-infrastructure.cjs` stay 100% synchronized and domain configurations (`vercel.json`, `_redirects`) are preserved per Phase 7 instructions.

## 11. Existing Deployment Configuration
- `frontend/vercel.json` and `frontend/public/_redirects` route `/sitemap.xml` and `/render/blog/:slug` to the backend Render URL. Per Phase 7 ("Do not change domain configuration or deployment infrastructure during this task"), deployment host rewrites and infrastructure settings remain untouched.

## 12. Existing Logo & Branding References
- Currently uses inline geometric SVG placeholders in `Navbar.jsx`, `Footer.jsx`, `frontend/public/logo.svg`, `frontend/public/favicon.svg`, and `ShieldCheck` icon in `AdminLayout.jsx` and `AdminLoginPage.jsx`.
- User has supplied the official **Dealsathi (DS)** logo (`985 x 600` JPEG on pure `#FFFFFF` background featuring a bold gradient Royal/Navy Blue `D` and Vibrant Orange `S`).
- We will process the supplied DS logo to create a crisp transparent-background PNG asset (`dealsathi-logo.png`) as well as copying the original (`dealsathi-logo-original.jpg`) and creating a reusable `<BrandLogo />` component so the exact DS logo renders cleanly on light headers, dark footers, admin sidebars, and auth screens without distortion.

## 13. Legacy Identifiers Preserved for Backward Compatibility
To guarantee zero regression across existing database records, environment variables, and automated test suites (`npm run test:all`):
- Reference ID prefixes (`KNV-ENQ-*`, `KNV-PTR-*`, `KNV-CNT-*`) in `backend/src/utils/referenceId.js` (tested by `run-phase41-tests.js` and `test-admin-mvp.cjs`).
- Default test environment fallbacks (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MONGODB_URI`, `x-konnevia-test-suite` header, `konnevia_admin_session` cookie).
- Deployment rewrite destinations in `frontend/vercel.json` and `frontend/public/_redirects`.
