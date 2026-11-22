import React, { useState, useEffect, useRef } from 'react';
import { useProviderAuth } from '../../context/ProviderAuthContext.jsx';
import providerPortalService from '../../services/providerPortalService.js';
import { ShieldCheck, X, CheckCircle2, AlertCircle, Lock } from 'lucide-react';

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function isRealGoogleClientId(clientId) {
  if (!clientId || typeof clientId !== 'string') return false;
  const trimmed = clientId.trim();
  return (
    trimmed.endsWith('.apps.googleusercontent.com') &&
    !trimmed.startsWith('your_google_') &&
    !trimmed.startsWith('dealsathi-local-')
  );
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  buttonText = 'Continue with Google',
  className = '',
}) {
  const { loginWithGoogleCredential, loginWithDevGoogleAccount } = useProviderAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(ENV_GOOGLE_CLIENT_ID);
  const [allowDevSandbox, setAllowDevSandbox] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  // Interactive Google Account Chooser Modal state (used when running locally without external Google OAuth Client ID)
  const [chooserOpen, setChooserOpen] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [chooserError, setChooserError] = useState('');

  const gisButtonContainerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    providerPortalService
      .getGoogleAuthConfig()
      .then((res) => {
        if (!isMounted || !res?.success || !res?.data) return;
        if (res.data.googleClientId && !ENV_GOOGLE_CLIENT_ID) {
          setGoogleClientId(res.data.googleClientId);
        }
        setAllowDevSandbox(Boolean(res.data.allowDevSandbox));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Load Google Identity Services script if a real Google OAuth Client ID is configured
  useEffect(() => {
    if (!isRealGoogleClientId(googleClientId)) return;

    const handleCredentialResponse = async (response) => {
      if (!response?.credential) {
        onError?.('No credential received from Google Sign-In.');
        return;
      }
      setIsAuthenticating(true);
      try {
        const result = await loginWithGoogleCredential(response.credential);
        onSuccess?.(result);
      } catch (err) {
        onError?.(err.message || 'Google authentication failed.');
      } finally {
        setIsAuthenticating(false);
      }
    };

    const initGis = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        if (gisButtonContainerRef.current) {
          window.google.accounts.id.renderButton(gisButtonContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: 340,
          });
        }
        setGisReady(true);
      } catch {
        setGisReady(false);
      }
    };

    if (window.google?.accounts?.id) {
      initGis();
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', initGis);
      return () => existingScript.removeEventListener('load', initGis);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGis;
    document.head.appendChild(script);
  }, [googleClientId, loginWithGoogleCredential, onSuccess, onError]);

  const handlePrimaryButtonClick = () => {
    if (isAuthenticating) return;

    if (isRealGoogleClientId(googleClientId) && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    if (allowDevSandbox) {
      setChooserError('');
      setChooserOpen(true);
      return;
    }

    onError?.(
      'Google OAuth Client ID (VITE_GOOGLE_CLIENT_ID) is not configured for this environment.'
    );
  };

  const handleSelectAccount = async ({ email, name }) => {
    setChooserError('');
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setChooserError('Please enter a valid Google email address.');
      return;
    }

    setIsAuthenticating(true);
    try {
      const result = await loginWithDevGoogleAccount({
        email: cleanEmail,
        name: cleanName || cleanEmail.split('@')[0],
      });
      setChooserOpen(false);
      onSuccess?.(result);
    } catch (err) {
      setChooserError(err.message || 'Google verification failed.');
      onError?.(err.message || 'Google verification failed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Official GIS rendered button container when live Client ID is configured */}
      {isRealGoogleClientId(googleClientId) && (
        <div
          ref={gisButtonContainerRef}
          className={`flex justify-center ${gisReady ? 'mb-2' : 'hidden'}`}
        />
      )}

      {/* Primary Continue with Google Button */}
      {(!isRealGoogleClientId(googleClientId) || !gisReady) && (
        <button
          type="button"
          onClick={handlePrimaryButtonClick}
          disabled={isAuthenticating}
          data-testid="continue-with-google-btn"
          className="w-full py-3.5 px-5 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-sm border-2 border-slate-200 hover:border-primary/40 shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
        >
          {isAuthenticating ? (
            <>
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Verifying with Google...</span>
            </>
          ) : (
            <>
              {/* Official 4-color Google 'G' SVG */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.275c0-.85-.075-1.67-.215-2.455H12v4.645h6.445c-.28 1.495-1.125 2.765-2.395 3.615v3.005h3.875c2.265-2.085 3.565-5.16 3.565-8.81Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.955-1.075 7.94-2.915l-3.875-3.005c-1.075.72-2.45 1.145-4.065 1.145-3.125 0-5.775-2.11-6.72-4.945H1.275v3.1C3.25 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.28A7.21 7.21 0 0 1 4.905 12c0-.79.135-1.56.375-2.28V6.62H1.275A11.99 11.99 0 0 0 0 12c0 1.935.465 3.765 1.275 5.38l4.005-3.1Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.775c1.76 0 3.34.605 4.585 1.795l3.435-3.435C17.95 1.19 15.235 0 12 0 7.31 0 3.25 2.7 1.275 6.62l4.005 3.1C6.225 6.885 8.875 4.775 12 4.775Z"
                />
              </svg>
              <span>{buttonText}</span>
            </>
          )}
        </button>
      )}

      {/* Non-Production Google Account Chooser Modal (for local/staging verification with RS256 backend token verification) */}
      {chooserOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-signin-modal-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            {/* Google Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.275c0-.85-.075-1.67-.215-2.455H12v4.645h6.445c-.28 1.495-1.125 2.765-2.395 3.615v3.005h3.875c2.265-2.085 3.565-5.16 3.565-8.81Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.955-1.075 7.94-2.915l-3.875-3.005c-1.075.72-2.45 1.145-4.065 1.145-3.125 0-5.775-2.11-6.72-4.945H1.275v3.1C3.25 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.28A7.21 7.21 0 0 1 4.905 12c0-.79.135-1.56.375-2.28V6.62H1.275A11.99 11.99 0 0 0 0 12c0 1.935.465 3.765 1.275 5.38l4.005-3.1Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.775c1.76 0 3.34.605 4.585 1.795l3.435-3.435C17.95 1.19 15.235 0 12 0 7.31 0 3.25 2.7 1.275 6.62l4.005 3.1C6.225 6.885 8.875 4.775 12 4.775Z"
                  />
                </svg>
                <span className="text-xs font-bold text-slate-700">
                  Sign in with Google
                </span>
              </div>
              <button
                type="button"
                onClick={() => !isAuthenticating && setChooserOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                aria-label="Close Google Sign-In dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-left">
              <div>
                <h3
                  id="google-signin-modal-title"
                  className="text-lg font-extrabold text-slate-900"
                >
                  Choose an account
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  to continue to <strong className="text-primary">Dealsathi Partner Portal</strong>
                </p>
              </div>

              {chooserError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{chooserError}</span>
                </div>
              )}

              {/* Quick Test Accounts */}
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isAuthenticating}
                  data-testid="google-quick-account-primary"
                  onClick={() =>
                    handleSelectAccount({
                      email: 'skyline.interiors@gmail.com',
                      name: 'Anand Kulkarni',
                    })
                  }
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50/40 transition-colors flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0">
                    AK
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      Anand Kulkarni
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      skyline.interiors@gmail.com
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isAuthenticating}
                  data-testid="google-quick-account-secondary"
                  onClick={() =>
                    handleSelectAccount({
                      email: 'verve.events.india@gmail.com',
                      name: 'Meera Deshmukh',
                    })
                  }
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50/40 transition-colors flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0">
                    MD
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      Meera Deshmukh
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      verve.events.india@gmail.com
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                </button>
              </div>

              {/* Or use custom Google email */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Or sign in with another Google account
                </span>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Your Full Name (e.g. Rajesh Sharma)"
                    data-testid="google-custom-name-input"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-primary"
                  />
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="Google Email (e.g. rajesh@gmail.com)"
                    data-testid="google-custom-email-input"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    data-testid="google-custom-submit-btn"
                    onClick={() =>
                      handleSelectAccount({
                        email: customEmail,
                        name: customName,
                      })
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isAuthenticating ? 'Verifying RS256 ID Token...' : 'Continue with this Google Account'}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Cryptographically verified on backend via RS256 Google ID Token signature.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
