import axios from 'axios';

// API base URL - can be overridden via environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Export for use in components that need direct fetch (e.g., streaming)
export { API_BASE_URL };

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

/**
 * Turn any API error into a plain string safe to render in JSX.
 *
 * FastAPI returns `detail` as a string for HTTPException, but as an ARRAY OF
 * OBJECTS for request-validation (422) failures:
 *
 *   {"detail":[{"type":"missing","loc":["body","email"],"msg":"Field required"}]}
 *
 * Passing that array straight into JSX throws "Objects are not valid as a React
 * child" and blanks the whole page - which is exactly what used to happen on the
 * login screen if a field was empty. Always route error text through this helper
 * rather than reading `err.response.data.detail` directly.
 *
 * @param {unknown} err - error thrown by axios
 * @param {string} fallback - message to use when nothing useful is present
 * @returns {string}
 */
export function extractErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const detail = err?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (typeof d === 'string') return d;
        // Surface which field failed, not just "Field required".
        const field = Array.isArray(d?.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
        const msg = d?.msg || d?.message || '';
        return field ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }

  if (detail && typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }

  if (typeof err?.response?.data === 'string' && err.response.data.trim()) {
    return err.response.data;
  }

  return err?.message || fallback;
}

