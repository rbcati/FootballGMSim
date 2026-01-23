/**
 * Premium UI Interactions & Animations
 * Enhances user experience with smooth animations and iOS-optimized interactions
 */

(function() {
  'use strict';

  // ============================================
  // Smooth Page Transitions
  // ============================================
  
  function initSmoothTransitions() {
    // Add fade-in animation to views when they're shown
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
          const target = mutation.target;
          if (!target.hidden && target.classList.contains('view')) {
            target.classList.add('fade-in');
            setTimeout(() => target.classList.remove('fade-in'), 300);
          }
        }
      });
    });

    // Observe all view elements
    document.querySelectorAll('.view').forEach(view => {
      observer.observe(view, { attributes: true });
    });
  }

  // ============================================
  // Enhanced Button Ripple Effect
  // ============================================
  
  function initRippleEffects() {
    document.addEventListener('click', function(e) {
      const button = e.target.closest('.btn, button');
      if (!button) return;

      // Create ripple element
      const ripple = document.createElement('span');
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
      `;

      // Ensure button has relative positioning
      if (getComputedStyle(button).position === 'static') {
        button.style.position = 'relative';
      }
      button.style.overflow = 'hidden';

      button.appendChild(ripple);

      // Remove ripple after animation
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // Add ripple animation CSS
  if (!document.getElementById('ripple-styles')) {
    const style = document.createElement('style');
    style.id = 'ripple-styles';
    style.textContent = `
      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // iOS-Specific Optimizations
  // ============================================
  
  function initIOSOptimizations() {
    // Prevent iOS bounce scrolling on body
    document.body.style.overscrollBehaviorY = 'contain';
    
    // Better touch handling
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    // Prevent pull-to-refresh on iOS
    document.addEventListener('touchmove', (e) => {
      if (window.scrollY === 0 && e.touches[0].clientY > touchStartY) {
        e.preventDefault();
      }
    }, { passive: false });

    // Add iOS safe area padding
    const root = document.documentElement;
    root.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
    root.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
    root.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left)');
    root.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right)');
  }

  // ============================================
  // Enhanced Card Interactions
  // ============================================
  
  function initCardInteractions() {
    // Add hover effect to cards with clickable content
    document.querySelectorAll('.card').forEach(card => {
      const clickable = card.querySelector('a, button, [onclick]');
      if (clickable) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target === card || e.target.closest('.card') === card) {
            clickable.click();
          }
        });
      }
    });
  }

  // ============================================
  // Smooth Scroll Behavior
  // ============================================
  
  function initSmoothScroll() {
    // Smooth scroll for anchor links (only for actual anchor links, not SPA routes)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        
        // Skip SPA routes (hash routes starting with #/)
        if (href.startsWith('#/')) {
          return; // Let the router handle it
        }
        
        // Skip empty hash
        if (href === '#' || href === '') return;
        
        // Only handle actual anchor links (like #section-id)
        try {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        } catch (error) {
          // Invalid selector, likely an SPA route - let it pass through
          console.debug('Skipping smooth scroll for:', href);
        }
      });
    });
  }

  // ============================================
  // Loading States
  // ============================================
  
  function showLoading(element) {
    if (!element) return;
    element.classList.add('loading');
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.innerHTML = '<div class="spinner"></div>';
    element.appendChild(loader);
  }

  function hideLoading(element) {
    if (!element) return;
    element.classList.remove('loading');
    const loader = element.querySelector('.loading-spinner');
    if (loader) loader.remove();
  }

  // ============================================
  // Toast Notifications
  // ============================================
  
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: var(--space-6);
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--surface-strong);
      color: var(--text);
      padding: var(--space-4) var(--space-6);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      z-index: 10000;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      max-width: 90%;
      text-align: center;
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    });

    // Remove after duration
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============================================
  // Enhanced Table Interactions
  // ============================================
  
  function initTableInteractions() {
    document.querySelectorAll('.table tbody tr').forEach(row => {
      row.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.01)';
      });
      
      row.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
      });
    });
  }

  // ============================================
  // Mobile Menu Toggle
  // ============================================
  
  function initMobileMenu() {
    const toggle = document.querySelector('.nav-toggle');
    const navSidebar = document.querySelector('#nav-sidebar');
    
    if (toggle && navSidebar) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        const newState = !isExpanded;
        toggle.setAttribute('aria-expanded', newState);
        navSidebar.setAttribute('aria-expanded', newState);
        navSidebar.classList.toggle('nav-open');
        document.body.classList.toggle('nav-open');
        
        // Close menu when clicking a nav link on mobile
        if (newState) {
          navSidebar.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', () => {
              toggle.setAttribute('aria-expanded', 'false');
              navSidebar.setAttribute('aria-expanded', 'false');
              navSidebar.classList.remove('nav-open');
              document.body.classList.remove('nav-open');
            }, { once: true });
          });
        }
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (document.body.classList.contains('nav-open') &&
            !navSidebar.contains(e.target) &&
            !toggle.contains(e.target)) {
          toggle.setAttribute('aria-expanded', 'false');
          navSidebar.setAttribute('aria-expanded', 'false');
          navSidebar.classList.remove('nav-open');
          document.body.classList.remove('nav-open');
        }
      });
    }
  }

  // ============================================
  // Initialize All Enhancements
  // ============================================
  
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    initSmoothTransitions();
    initRippleEffects();
    initIOSOptimizations();
    initCardInteractions();
    initSmoothScroll();
    initTableInteractions();
    initMobileMenu();

    console.log('✅ Premium UI interactions initialized');
  }

  // Expose utility functions globally
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.showToast = showToast;

  // Initialize on load
  init();

  // Re-initialize when views change (for SPA behavior)
  if (window.show) {
    const originalShow = window.show;
    window.show = function(viewId) {
      originalShow(viewId);
      setTimeout(() => {
        initCardInteractions();
        initTableInteractions();
      }, 100);
    };
  }

})();
