const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000/api/v1';

// Default request timeout in milliseconds (15s for file uploads or single requests)
const REQUEST_TIMEOUT_MS = 15_000;

// Bounded retry budget for eligible public GET requests
const DEFAULT_PUBLIC_GET_RETRY = {
  maxRetries: 2,
  perAttemptTimeoutMs: 12_000,
  totalTimeoutMs: 28_000,
  baseDelayMs: 700,
};

function isProtectedNamespace(endpoint = '') {
  const clean = String(endpoint || '').split('?')[0].toLowerCase();
  return (
    clean === '/admin' ||
    clean.startsWith('/admin/') ||
    clean === '/provider' ||
    clean.startsWith('/provider/') ||
    clean === '/leads' ||
    clean.startsWith('/leads/')
  );
}

function isTransientError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return false;
  if (error instanceof ApiError) {
    // status 0 represents timeout or network unavailability; >=500 represents transient upstream failures
    return error.status === 0 || error.status >= 500;
  }
  return true;
}

function createAbortError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function sleepWithSignal(delayMs, signal) {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function executeSingleAttempt(url, config, timeoutMs, externalSignal) {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...config,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => null);
    }

    if (!response.ok) {
      const errorMessage = data?.message || `HTTP Request failed with status ${response.status}`;
      throw new ApiError(errorMessage, response.status, data);
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted && !timedOut) {
        throw error;
      }
      throw new ApiError(
        'The request timed out. Please check your connection and try again.',
        0
      );
    }
    throw new ApiError(
      'Unable to connect to the Dealsathi server. Please verify your connection or try again shortly.',
      0
    );
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const {
    retry = false,
    timeoutMs: customTimeoutMs,
    signal: externalSignal,
    headers: customHeaders,
    ...fetchRest
  } = options;

  const method = String(fetchRest.method || 'GET').toUpperCase();

  // Retrieve stored admin or provider session token depending on endpoint namespace
  let authToken = null;
  let providerToken = null;
  try {
    authToken =
      localStorage.getItem('dealsathi_admin_token') ||
      localStorage.getItem('konnevia_admin_token');
    providerToken = localStorage.getItem('dealsathi_provider_token');
  } catch {
    // LocalStorage inaccessible (e.g. strict private browsing)
  }

  const defaultHeaders = {};
  // Only set application/json if body is not FormData
  if (!(fetchRest.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const isProviderPortalRequest =
    endpoint.startsWith('/provider/') || endpoint === '/provider';

  if (isProviderPortalRequest) {
    if (providerToken && !customHeaders?.['x-provider-token']) {
      defaultHeaders['x-provider-token'] = providerToken;
    }
  } else if (authToken && !customHeaders?.Authorization && !customHeaders?.authorization) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    ...fetchRest,
    method,
    credentials: 'include', // Ensures cookies are transmitted in cross-origin / same-origin requests
    headers: {
      ...defaultHeaders,
      ...customHeaders,
    },
  };

  // Retries are strictly limited to explicitly opted-in public GET requests
  const canRetry =
    Boolean(retry) &&
    method === 'GET' &&
    !isProtectedNamespace(endpoint);

  if (!canRetry) {
    return executeSingleAttempt(url, config, customTimeoutMs || REQUEST_TIMEOUT_MS, externalSignal);
  }

  const retryCfg =
    typeof retry === 'object'
      ? { ...DEFAULT_PUBLIC_GET_RETRY, ...retry }
      : DEFAULT_PUBLIC_GET_RETRY;

  const startedAt = Date.now();
  const maxRetries = Math.max(0, Math.min(3, Number(retryCfg.maxRetries) || 0));
  const totalBudgetMs = Math.max(5_000, Number(retryCfg.totalTimeoutMs) || DEFAULT_PUBLIC_GET_RETRY.totalTimeoutMs);
  const perAttemptCapMs = customTimeoutMs || retryCfg.perAttemptTimeoutMs;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw createAbortError();
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = totalBudgetMs - elapsedMs;
    if (remainingBudgetMs <= 250) {
      break;
    }

    const attemptTimeoutMs = Math.max(1_000, Math.min(perAttemptCapMs, remainingBudgetMs));

    try {
      return await executeSingleAttempt(url, config, attemptTimeoutMs, externalSignal);
    } catch (error) {
      lastError = error;

      // Never retry caller-initiated cancellations or non-transient errors (400, 401, 403, 404, etc.)
      if (error?.name === 'AbortError' || !isTransientError(error) || attempt === maxRetries) {
        throw error;
      }

      const elapsedAfterError = Date.now() - startedAt;
      const budgetLeftForRetry = totalBudgetMs - elapsedAfterError;
      if (budgetLeftForRetry <= 1_200) {
        throw error;
      }

      const backoffMs = Math.min(
        retryCfg.baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 150),
        Math.max(0, budgetLeftForRetry - 1_000)
      );

      await sleepWithSignal(backoffMs, externalSignal);
    }
  }

  throw (
    lastError ||
    new ApiError('The request timed out. Please check your connection and try again.', 0)
  );
}

export const api = {
  get: (endpoint, options = {}) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options = {}) =>
    request(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  put: (endpoint, body, options = {}) =>
    request(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  patch: (endpoint, body, options = {}) =>
    request(endpoint, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  delete: (endpoint, options = {}) => {
    const { data, body, ...rest } = options || {};
    const resolvedBody =
      data !== undefined
        ? JSON.stringify(data)
        : body && typeof body === 'object' && !(body instanceof FormData)
        ? JSON.stringify(body)
        : body;
    return request(endpoint, {
      method: 'DELETE',
      ...(resolvedBody !== undefined ? { body: resolvedBody } : {}),
      ...rest,
    });
  },
  upload: (endpoint, formData, options = {}) =>
    request(endpoint, {
      method: 'POST',
      body: formData,
      ...options,
    }),
};

export default api;
