/**
 * tailwind.config.js — Tailwind CSS v4 Configuration
 *
 * Tailwind v4 uses zero-config by default via @tailwindcss/vite.
 * This file documents the custom theme extensions used alongside
 * the existing CSS custom properties design system.
 *
 * The project uses a hybrid approach:
 *  - CSS custom properties (--bg, --surface, etc.) for theming/dark mode
 *  - Tailwind utility classes for responsive layout helpers
 *  - Both systems coexist — Tailwind classes supplement, not replace
 *
 * Dark mode: handled via CSS custom properties + prefers-color-scheme
 * (not via Tailwind's `dark:` prefix, since the existing system is richer)
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Map to CSS custom properties for consistency
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-strong': 'var(--surface-strong)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'Helvetica', 'Arial', 'sans-serif'],
      },
      screens: {
        xs: '375px',
        sm: '480px',
        md: '768px',
        lg: '1024px',
        xl: '1200px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
};
