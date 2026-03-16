const BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request(path, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || `Request failed with status ${response.status}`, response.status);
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  signup: (email, password) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getMe: (token) => request('/auth/me', {}, token),

  // Signals
  getSignals: (token, params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.set(k, v);
    });
    const qs = searchParams.toString();
    return request(`/api/signals${qs ? `?${qs}` : ''}`, {}, token);
  },

  getSignal: (token, id) => request(`/api/signals/${id}`, {}, token),

  getStats: (token) => request('/api/signals/stats', {}, token),

  // Export - returns a URL to navigate to or fetch directly
  getExportUrl: (token, format, params = {}) => {
    const searchParams = new URLSearchParams({ format, ...params });
    // For file downloads, we need to handle auth differently
    return `/api/signals/export?${searchParams.toString()}`;
  },

  exportSignals: async (token, format, params = {}) => {
    const searchParams = new URLSearchParams({ format });
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') searchParams.set(k, v);
    });

    const response = await fetch(`${BASE_URL}/api/signals/export?${searchParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.message || 'Export failed', response.status);
    }

    return response;
  },

  // Alerts
  getAlerts: (token) => request('/api/alerts', {}, token),

  subscribe: (token, sectors, companies) =>
    request('/api/alerts/subscribe', {
      method: 'POST',
      body: JSON.stringify({ sectors, companies }),
    }, token),

  deleteAlert: (token, id) =>
    request(`/api/alerts/${id}`, { method: 'DELETE' }, token),

  // Admin
  triggerIngestion: () =>
    request('/admin/ingest', { method: 'POST' }),

  // Health
  health: () => request('/health'),
};

export { ApiError };
