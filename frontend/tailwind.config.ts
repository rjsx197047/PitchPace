import type { Config } from 'tailwindcss';

// Shares the card / animation / font language of the other apps in this
// workspace (Reading, TradingAgentsLab, QA Engineer) but swaps the accent
// to a soccer-pitch green/emerald so PitchPace reads as its own product.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent — emerald/green. `brand` is the primary action color.
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      animation: {
        'fade-in-up': 'fadeInUp 220ms ease-out',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        'bar-grow': 'barGrow 600ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        barGrow: {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'SF Pro Text',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'JetBrains Mono',
          'Menlo',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
