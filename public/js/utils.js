/* ==========================================================================
   FEASTFLOW UTILITY & UI HELPER MODULE
   ========================================================================== */

let activeModalId = null;
let lastFocusedElement = null;

const Utils = {
  /**
   * Display modern floating Toast notifications with WCAG accessibility
   */
  showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.setAttribute('role', 'alert');
    toast.className = 'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transform transition-all duration-300 translate-y-2 opacity-0 text-sm font-medium border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

    let icon = 'fa-circle-info';
    let colors = 'bg-slate-900/95 text-white border-slate-800';

    if (type === 'success') {
      icon = 'fa-circle-check';
      colors = 'bg-emerald-800/95 text-white border-emerald-700';
    } else if (type === 'error') {
      icon = 'fa-circle-exclamation';
      colors = 'bg-rose-800/95 text-white border-rose-700';
    } else if (type === 'warning') {
      icon = 'fa-triangle-exclamation';
      colors = 'bg-amber-800/95 text-white border-amber-700';
    }

    toast.className += ` ${colors}`;
    toast.innerHTML = `
      <i class="fa-solid ${icon} text-base flex-shrink-0" aria-hidden="true"></i>
      <span class="flex-1">${message}</span>
      <button class="opacity-70 hover:opacity-100 transition-opacity ml-1 p-1 rounded focus-visible:ring-2 focus-visible:ring-white" aria-label="Close notification" onclick="this.parentElement.remove()">
        <i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
      </button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // Auto dismiss
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Currency formatter
   */
  formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `Rs. ${num.toLocaleString()}`;
  },

  /**
   * Date & Time Formatter
   */
  formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PK', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },

  /**
   * Status Badge Generator with Accessible Tailwind Styling & Motion-Safe Pulse
   */
  getStatusBadge(status) {
    const s = String(status || 'Received').trim();
    let bg = 'bg-slate-100 text-slate-800 border-slate-200';
    let icon = 'fa-clock';

    switch (s) {
      case 'Received':
        bg = 'bg-blue-50 text-blue-700 border-blue-200';
        icon = 'fa-bell';
        break;
      case 'Confirmed':
        bg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        icon = 'fa-check';
        break;
      case 'Preparing':
        bg = 'bg-amber-50 text-amber-900 border-amber-300 motion-safe:animate-pulse font-bold';
        icon = 'fa-fire-burner';
        break;
      case 'Ready':
        bg = 'bg-purple-50 text-purple-700 border-purple-200';
        icon = 'fa-utensils';
        break;
      case 'Out For Delivery':
        bg = 'bg-teal-50 text-teal-800 border-teal-300';
        icon = 'fa-motorcycle';
        break;
      case 'Delivered':
        bg = 'bg-emerald-50 text-emerald-800 border-emerald-300';
        icon = 'fa-circle-check';
        break;
      case 'Cancelled':
        bg = 'bg-rose-50 text-rose-700 border-rose-200';
        icon = 'fa-ban';
        break;
      case 'Available':
        bg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        icon = 'fa-circle-dot';
        break;
      case 'On Delivery':
        bg = 'bg-amber-50 text-amber-800 border-amber-200';
        icon = 'fa-route';
        break;
      case 'Offline':
        bg = 'bg-slate-100 text-slate-600 border-slate-200';
        icon = 'fa-moon';
        break;
    }

    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${bg}">
      <i class="fa-solid ${icon} text-[10px]" aria-hidden="true"></i> ${s}
    </span>`;
  },

  /**
   * Accessible Modal Controllers with Focus Management & Escape Listener
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    lastFocusedElement = document.activeElement;
    activeModalId = modalId;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element inside modal
    setTimeout(() => {
      const focusable = modal.querySelector('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])');
      if (focusable) focusable.focus();
    }, 50);
  },

  closeModal(modalId) {
    const targetId = modalId || activeModalId;
    if (!targetId) return;

    const modal = document.getElementById(targetId);
    if (!modal) return;

    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (activeModalId === targetId) activeModalId = null;

    // Return focus to triggering element
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  },

  /**
   * Responsive Mobile Navigation Drawer Controller
   */
  toggleMobileDrawer(drawerId = 'mobile-sidebar-drawer', backdropId = 'mobile-sidebar-backdrop') {
    const drawer = document.getElementById(drawerId);
    const backdrop = document.getElementById(backdropId);
    if (!drawer) return;

    const isOpen = !drawer.classList.contains('-translate-x-full');
    if (isOpen) {
      this.closeMobileDrawer(drawerId, backdropId);
    } else {
      this.openMobileDrawer(drawerId, backdropId);
    }
  },

  openMobileDrawer(drawerId = 'mobile-sidebar-drawer', backdropId = 'mobile-sidebar-backdrop') {
    const drawer = document.getElementById(drawerId);
    const backdrop = document.getElementById(backdropId);
    if (!drawer) return;

    if (backdrop) {
      backdrop.classList.remove('hidden');
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        backdrop.classList.add('opacity-100');
      });
    }

    drawer.classList.remove('-translate-x-full');
    drawer.classList.add('translate-x-0');
    document.body.style.overflow = 'hidden';
  },

  closeMobileDrawer(drawerId = 'mobile-sidebar-drawer', backdropId = 'mobile-sidebar-backdrop') {
    const drawer = document.getElementById(drawerId);
    const backdrop = document.getElementById(backdropId);
    if (!drawer) return;

    drawer.classList.remove('translate-x-0');
    drawer.classList.add('-translate-x-full');
    document.body.style.overflow = '';

    if (backdrop) {
      backdrop.classList.remove('opacity-100');
      backdrop.classList.add('opacity-0');
      setTimeout(() => backdrop.classList.add('hidden'), 250);
    }
  },

  /**
   * Render Loading Skeleton Cards
   */
  renderSkeleton(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="animate-pulse bg-slate-100 rounded-2xl p-4 mb-3 border border-slate-200/80">
          <div class="h-4 bg-slate-200 rounded w-1/3 mb-2.5"></div>
          <div class="h-3 bg-slate-200 rounded w-1/2 mb-3"></div>
          <div class="h-9 bg-slate-200 rounded-xl w-full"></div>
        </div>
      `;
    }
    container.innerHTML = html;
  },

  /**
   * Render Table Row Skeletons
   */
  renderTableSkeleton(tbodyId, rows = 4, cols = 7) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr class="animate-pulse border-b border-slate-100">';
      for (let c = 0; c < cols; c++) {
        html += '<td class="p-3.5"><div class="h-3.5 bg-slate-200 rounded w-3/4"></div></td>';
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
  },

  /**
   * Render Standardized Empty State
   */
  renderEmptyState(containerId, title = 'No records found', description = 'There is currently no data available in this section.', icon = 'fa-folder-open') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-200/80 my-4 shadow-sm">
        <div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-2xl mb-3 shadow-inner" aria-hidden="true">
          <i class="fa-solid ${icon}"></i>
        </div>
        <h4 class="text-base font-bold text-slate-800 mb-1">${title}</h4>
        <p class="text-xs text-slate-500 max-w-sm leading-relaxed">${description}</p>
      </div>
    `;
  }
};

// Global Keyboard Listener for Modal and Drawer Dismissal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (activeModalId) {
      Utils.closeModal(activeModalId);
    }
    Utils.closeMobileDrawer();
  }
});

window.Utils = Utils;
window.closeModal = Utils.closeModal;
window.openModal = Utils.openModal;
window.toggleMobileDrawer = (drawerId, backdropId) => Utils.toggleMobileDrawer(drawerId, backdropId);
window.closeMobileDrawer = (drawerId, backdropId) => Utils.closeMobileDrawer(drawerId, backdropId);
window.openMobileDrawer = (drawerId, backdropId) => Utils.openMobileDrawer(drawerId, backdropId);
