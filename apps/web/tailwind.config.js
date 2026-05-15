// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/tailwind.config.js
//
// Genesis Banking design system mapped to Tailwind utility classes.
// Extends default Tailwind — does not replace it.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // ── Brand Colors ────────────────────────────────────────────────────────
      colors: {
        gold: {
          DEFAULT: '#C9A84C',
          dark:    '#8A6E2A',
          light:   '#E8C96C',
          dim:     'rgba(201,168,76,0.12)',
        },
        teal: {
          DEFAULT: '#00D4AA',
          dim:     'rgba(0,212,170,0.10)',
        },
        blue: {
          DEFAULT: '#4A9EFF',
          dim:     'rgba(74,158,255,0.10)',
        },
        green: {
          DEFAULT: '#18C870',
          dim:     'rgba(24,200,112,0.10)',
        },
        red:    '#E04040',
        amber:  '#F0A020',
        purple: '#9B6DFF',

        // Background layers
        bg: {
          DEFAULT: '#070707',
          2:       '#0c0c0c',
          3:       '#111111',
          4:       '#181818',
        },

        // Text scale
        text: {
          primary:   '#f5f0e8',
          secondary: '#A8A49E',
          muted:     '#5A5650',
          faint:     '#2C2A26',
        },
      },

      // ── Typography ───────────────────────────────────────────────────────────
      fontFamily: {
        sora:   ['Sora', 'sans-serif'],
        mono:   ['JetBrains Mono', 'monospace'],
        serif:  ['Cormorant Garamond', 'serif'],
        bebas:  ['Bebas Neue', 'sans-serif'],
        tenor:  ['Tenor Sans', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.35rem' }],
        sm: ['0.9375rem', { lineHeight: '1.45rem' }],
      },

      // ── Border Radius ────────────────────────────────────────────────────────
      borderRadius: {
        '4xl': '2rem',
      },

      // ── Animation ────────────────────────────────────────────────────────────
      animation: {
        'pulse-slow':  'pulse 2s ease-in-out infinite',
        'spin-slow':   'spin 1.2s linear infinite',
        'fade-up':     'fadeUp 0.4s ease both',
        'slide-up':    'slideUp 0.36s cubic-bezier(0.32,0,0.18,1)',
        'shimmer':     'shimmer 1.5s ease-in-out infinite',
        'scale-in':    'scaleIn 0.38s ease both',
      },

      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scaleX(0)' },
          to:   { opacity: '1', transform: 'scaleX(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },

      // ── Backdrop Blur ────────────────────────────────────────────────────────
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
