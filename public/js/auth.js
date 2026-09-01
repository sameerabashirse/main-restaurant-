/* ==========================================================================
   FEASTFLOW AUTHENTICATION & SESSION GUARDS MODULE
   ========================================================================== */

const Auth = {
  /**
   * Super Admin Login Handler
   */
  async handleSuperAdminLogin(event) {
    if (event) event.preventDefault();

    const emailInput = document.getElementById('admin-email-input');
    const passwordInput = document.getElementById('admin-password-input');
    const submitBtn = event ? event.target.querySelector('button[type="submit"]') : null;

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      Utils.showToast('Please enter admin email and password.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
    }

    try {
      const res = await API.post('/api/auth/admin-login', { email, password });

      if (res && res.success) {
        API.setSession(res.token, res.user);
        Utils.showToast('Super Admin authenticated successfully!', 'success');
        setTimeout(() => {
          window.location.href = res.redirectUrl || '/admin/dashboard';
        }, 500);
      } else {
        Utils.showToast(res.message || 'Invalid admin credentials.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Login to Executive Admin Portal';
        }
      }
    } catch (err) {
      Utils.showToast('Authentication failed. Please check server.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Login to Executive Admin Portal';
      }
    }
  },

  /**
   * Unified Staff Operations Login Handler
   */
  async handleStaffPortalLogin(event) {
    if (event) event.preventDefault();

    const emailInput = document.getElementById('staff-email');
    const passwordInput = document.getElementById('staff-password');
    const submitBtn = event ? event.target.querySelector('button[type="submit"]') : null;

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      Utils.showToast('Please enter your staff email and password.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
    }

    try {
      const res = await API.post('/api/auth/staff-login', { email, password });

      if (res && res.success) {
        API.setSession(res.token, res.user);
        Utils.showToast(`Logged in as ${res.user.role.toUpperCase()}!`, 'success');
        setTimeout(() => {
          window.location.href = res.redirectUrl || '/staff/manager/dashboard';
        }, 500);
      } else {
        Utils.showToast(res.message || 'Invalid staff credentials.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login To Staff Operations';
        }
      }
    } catch (err) {
      Utils.showToast('Staff authentication error.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login To Staff Operations';
      }
    }
  },

  /**
   * Delivery Rider Login Handler
   */
  async handleRiderPortalLogin(event) {
    if (event) event.preventDefault();

    const emailInput = document.getElementById('rider-email-input');
    const passwordInput = document.getElementById('rider-password-input');
    const submitBtn = event ? event.target.querySelector('button[type="submit"]') : null;

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      Utils.showToast('Please enter rider email and password.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
    }

    try {
      const res = await API.post('/api/auth/rider-login', { email, password });

      if (res && res.success) {
        API.setSession(res.token, res.user);
        Utils.showToast('Rider logged in successfully!', 'success');
        setTimeout(() => {
          window.location.href = res.redirectUrl || '/rider/dashboard';
        }, 500);
      } else {
        Utils.showToast(res.message || 'Invalid rider credentials.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login To Rider Portal';
        }
      }
    } catch (err) {
      Utils.showToast('Rider authentication error.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login To Rider Portal';
      }
    }
  },

  /**
   * Preset Fill Helper for Staff Login
   */
  applyStaffRolePreset(role) {
    const emailInput = document.getElementById('staff-email');
    const passInput = document.getElementById('staff-password');
    if (!emailInput || !passInput) return;

    if (role === 'admin') {
      emailInput.value = 'admin@restaurant.com';
      passInput.value = 'admin123';
    } else if (role === 'manager') {
      emailInput.value = 'manager@restaurant.com';
      passInput.value = 'manager123';
    } else if (role === 'kitchen') {
      emailInput.value = 'kitchen@restaurant.com';
      passInput.value = 'kitchen123';
    } else if (role === 'delivery') {
      emailInput.value = 'delivery@restaurant.com';
      passInput.value = 'delivery123';
    } else if (role === 'rider') {
      emailInput.value = 'rider@restaurant.com';
      passInput.value = 'rider123';
    }
  },

  /**
   * Session Check Redirects on Login Pages
   */
  checkAdminSessionRedirect() {
    const user = API.getUser();
    const token = API.getToken();
    if (token && user && user.role === 'admin') {
      window.location.href = '/admin/dashboard';
    }
  },

  checkStaffSessionRedirect() {
    const user = API.getUser();
    const token = API.getToken();
    if (token && user) {
      if (user.role === 'admin') window.location.href = '/admin/dashboard';
      else if (user.role === 'manager') window.location.href = '/staff/manager/dashboard';
      else if (user.role === 'kitchen') window.location.href = '/staff/kitchen/dashboard';
      else if (user.role === 'delivery') window.location.href = '/staff/delivery/dashboard';
      else if (user.role === 'rider') window.location.href = '/rider/dashboard';
    }
  },

  checkRiderSessionRedirect() {
    const user = API.getUser();
    const token = API.getToken();
    if (token && user && user.role === 'rider') {
      window.location.href = '/rider/dashboard';
    }
  },

  /**
   * Dashboard RBAC Guard - Redirects unauthorized users
   */
  async enforceDashboardProtection(requiredRole) {
    const token = API.getToken();
    const user = API.getUser();

    if (!token || !user) {
      this.redirectToLogin(requiredRole);
      return;
    }

    // Role Hierarchy & Permissions
    const isSuperAdmin = user.role === 'admin';
    const isManager = user.role === 'manager' || isSuperAdmin;
    const isKitchen = user.role === 'kitchen' || isSuperAdmin || user.role === 'manager';
    const isDelivery = user.role === 'delivery' || isSuperAdmin || user.role === 'manager';
    const isRider = user.role === 'rider' || isSuperAdmin;

    let isAuthorized = false;
    if (requiredRole === 'admin' && isSuperAdmin) isAuthorized = true;
    else if (requiredRole === 'manager' && isManager) isAuthorized = true;
    else if (requiredRole === 'kitchen' && isKitchen) isAuthorized = true;
    else if (requiredRole === 'delivery' && isDelivery) isAuthorized = true;
    else if (requiredRole === 'rider' && isRider) isAuthorized = true;

    if (!isAuthorized) {
      Utils.showToast(`Access Denied: Role '${user.role}' is not authorized for this dashboard.`, 'error');
      setTimeout(() => {
        this.redirectToLogin(requiredRole);
      }, 800);
    }
  },

  redirectToLogin(role) {
    API.clearSession();
    if (role === 'admin') window.location.href = '/admin/login';
    else if (role === 'rider') window.location.href = '/rider/login';
    else window.location.href = '/staff/login';
  },

  /**
   * Logout Handlers
   */
  performAdminLogout() {
    API.clearSession();
    Utils.showToast('Super Admin session ended.', 'info');
    setTimeout(() => window.location.href = '/admin/login', 300);
  },

  performStaffLogout() {
    API.clearSession();
    Utils.showToast('Staff logged out successfully.', 'info');
    setTimeout(() => window.location.href = '/staff/login', 300);
  },

  performRiderLogout() {
    API.clearSession();
    Utils.showToast('Rider signed out.', 'info');
    setTimeout(() => window.location.href = '/rider/login', 300);
  }
};

window.Auth = Auth;
window.handleSuperAdminLogin = Auth.handleSuperAdminLogin;
window.handleStaffPortalLogin = Auth.handleStaffPortalLogin;
window.handleRiderPortalLogin = Auth.handleRiderPortalLogin;
window.applyStaffRolePreset = Auth.applyStaffRolePreset;
window.checkAdminSessionRedirect = Auth.checkAdminSessionRedirect;
window.checkStaffSessionRedirect = Auth.checkStaffSessionRedirect;
window.checkRiderSessionRedirect = Auth.checkRiderSessionRedirect;
window.enforceDashboardProtection = (role) => Auth.enforceDashboardProtection(role);
window.performAdminLogout = Auth.performAdminLogout;
window.performStaffLogout = Auth.performStaffLogout;
window.performRiderLogout = Auth.performRiderLogout;
