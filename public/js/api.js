/* ==========================================================================
   FEASTFLOW API CLIENT MODULE
   ========================================================================== */

const API = {
  TOKEN_KEY: 'feastflow_token',
  USER_KEY: 'feastflow_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      const user = localStorage.getItem(this.USER_KEY);
      return user ? JSON.parse(user) : null;
    } catch (e) {
      return null;
    }
  },

  setSession(token, user) {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  async request(url, options = {}) {
    const headers = options.headers || {};
    
    // Set JSON content type if payload exists and not form data
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    // Attach JWT Bearer token if present
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    options.headers = headers;

    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized
      if (response.status === 401) {
        console.warn('Session expired or unauthorized request.');
        // If on dashboard, redirect to login
        const path = window.location.pathname;
        if (path.includes('/admin/dashboard')) {
          this.clearSession();
          window.location.href = '/admin/login';
        } else if (path.includes('/staff/')) {
          this.clearSession();
          window.location.href = '/staff/login';
        } else if (path.includes('/rider/dashboard')) {
          this.clearSession();
          window.location.href = '/rider/login';
        }
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return data;
      }

      return response;
    } catch (error) {
      console.error(`API Request Error to ${url}:`, error);
      if (window.Utils) {
        window.Utils.showToast(`Network Error: ${error.message}`, 'error');
      }
      throw error;
    }
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, data) {
    return this.request(url, { method: 'POST', body: data });
  },

  put(url, data) {
    return this.request(url, { method: 'PUT', body: data });
  },

  delete(url) {
    return this.request(url, { method: 'DELETE' });
  }
};

window.API = API;
