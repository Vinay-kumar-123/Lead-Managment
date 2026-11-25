import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';
import './styles/index.css';

const rootEl = document.getElementById('root');
const appTree = (
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);

const normalizedPathname =
  window.location.pathname.length > 1
    ? window.location.pathname.replace(/\/+$/, '')
    : window.location.pathname;
const prerenderedRoute = rootEl.getAttribute('data-prerender-route');
const hasStoredSession = (() => {
  try {
    return Boolean(
      localStorage.getItem('dealsathi_provider_token') ||
        localStorage.getItem('dealsathi_admin_token') ||
        localStorage.getItem('konnevia_admin_token')
    );
  } catch {
    return false;
  }
})();

if (
  prerenderedRoute &&
  prerenderedRoute === normalizedPathname &&
  rootEl.firstElementChild &&
  !hasStoredSession
) {
  ReactDOM.hydrateRoot(rootEl, appTree);
} else {
  ReactDOM.createRoot(rootEl).render(appTree);
}
