import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import providerPortalService from '../services/providerPortalService.js';

const ProviderAuthContext = createContext(null);

const STORAGE_TOKEN_KEY = 'dealsathi_provider_token';
const STORAGE_ACCOUNT_KEY = 'dealsathi_provider_account';
const STORAGE_PROFILE_KEY = 'dealsathi_provider_profile';

export function ProviderAuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [account, setAccount] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ACCOUNT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [provider, setProvider] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(() => Boolean(token));

  const persistSession = useCallback((nextToken, nextAccount, nextProvider) => {
    if (nextToken !== undefined) setToken(nextToken);
    if (nextAccount !== undefined) setAccount(nextAccount);
    if (nextProvider !== undefined) setProvider(nextProvider);

    try {
      if (nextToken) {
        localStorage.setItem(STORAGE_TOKEN_KEY, nextToken);
      } else if (nextToken === null) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      }

      if (nextAccount) {
        localStorage.setItem(STORAGE_ACCOUNT_KEY, JSON.stringify(nextAccount));
      } else if (nextAccount === null) {
        localStorage.removeItem(STORAGE_ACCOUNT_KEY);
      }

      if (nextProvider) {
        localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(nextProvider));
      } else if (nextProvider === null) {
        localStorage.removeItem(STORAGE_PROFILE_KEY);
      }
    } catch {
      // Ignore storage quota / privacy errors
    }
  }, []);

  const clearProviderSession = useCallback(() => {
    persistSession(null, null, null);
  }, [persistSession]);

  const refreshProviderSession = useCallback(async () => {
    try {
      const res = await providerPortalService.getMe();
      if (res?.success && res?.data?.account) {
        persistSession(token, res.data.account, res.data.provider || null);
        return res.data;
      }
      clearProviderSession();
      return null;
    } catch {
      clearProviderSession();
      return null;
    }
  }, [token, persistSession, clearProviderSession]);

  useEffect(() => {
    let isMounted = true;

    if (token) {
      providerPortalService
        .getMe()
        .then((res) => {
          if (!isMounted) return;
          if (res?.success && res?.data?.account) {
            persistSession(token, res.data.account, res.data.provider || null);
          } else {
            clearProviderSession();
          }
        })
        .catch(() => {
          if (isMounted) {
            clearProviderSession();
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [token, persistSession, clearProviderSession]);

  const loginWithGoogleCredential = useCallback(
    async (credential) => {
      const res = await providerPortalService.authenticateWithGoogle(credential);
      if (res?.success && res?.data) {
        const {
          token: sessionToken,
          account: acc,
          provider: prov,
          onboardingCompleted,
          isNewProvider,
          redirectTo,
        } = res.data;
        persistSession(sessionToken, acc, prov || null);
        return {
          success: true,
          account: acc,
          provider: prov || null,
          onboardingCompleted: Boolean(onboardingCompleted),
          isNewProvider: Boolean(isNewProvider),
          redirectTo: redirectTo || (onboardingCompleted ? '/provider/dashboard' : '/become-a-partner?step=business-profile'),
        };
      }
      throw new Error(res?.message || 'Google authentication failed.');
    },
    [persistSession]
  );

  const loginWithDevGoogleAccount = useCallback(
    async ({ email, name, sub }) => {
      const tokenRes = await providerPortalService.createDevGoogleToken({ email, name, sub });
      if (!tokenRes?.success || !tokenRes?.data?.credential) {
        throw new Error(tokenRes?.message || 'Could not generate Google ID token.');
      }
      return loginWithGoogleCredential(tokenRes.data.credential);
    },
    [loginWithGoogleCredential]
  );

  const updateProviderContext = useCallback(
    ({ account: nextAccount, provider: nextProvider }) => {
      const mergedAccount =
        nextAccount !== undefined
          ? nextAccount
          : nextProvider
          ? { ...(account || {}), onboardingCompleted: true, providerProfileId: nextProvider._id }
          : account;
      const mergedProvider = nextProvider !== undefined ? nextProvider : provider;
      persistSession(token, mergedAccount, mergedProvider);
    },
    [token, account, provider, persistSession]
  );

  const logoutProvider = useCallback(async () => {
    const activeToken = token;
    clearProviderSession();
    if (activeToken) {
      try {
        await providerPortalService.logout();
      } catch {
        // Session cleared locally
      }
    }
  }, [token, clearProviderSession]);

  const onboardingCompleted = Boolean(account?.onboardingCompleted && provider);

  return (
    <ProviderAuthContext.Provider
      value={{
        token,
        account,
        provider,
        isLoading,
        isAuthenticated: Boolean(token && account),
        onboardingCompleted,
        loginWithGoogleCredential,
        loginWithDevGoogleAccount,
        updateProviderContext,
        refreshProviderSession,
        logoutProvider,
      }}
    >
      {children}
    </ProviderAuthContext.Provider>
  );
}

export function useProviderAuth() {
  const context = useContext(ProviderAuthContext);
  if (!context) {
    throw new Error('useProviderAuth must be used within a ProviderAuthProvider');
  }
  return context;
}

export default ProviderAuthContext;
