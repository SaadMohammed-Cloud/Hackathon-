/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        // Real CTA platform signs are set in Helvetica.
        sign: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        paper: '#FFFFFF',
        mist: '#F1F2F4',
        rule: '#DADCE0',
        ink: {
          DEFAULT: '#000000',
          2: '#4A4F57',
          3: '#80868F',
        },
        ok: '#1E7E34',
        alert: {
          info: '#2B4C7E',
          warning: '#FFD200',
          critical: '#C8102E',
        },
      },
      keyframes: {
        // Ring that expands out from a live alert — draws the eye without strobing.
        'alert-pulse': {
          '0%': { boxShadow: '0 0 0 0 var(--pulse)' },
          '70%': { boxShadow: '0 0 0 14px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
        // 1 Hz, well under WCAG 2.3.1's 3-flashes-per-second limit.
        'alert-flash': {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(0.8)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'alert-pulse': 'alert-pulse 1.6s ease-out infinite',
        'alert-flash': 'alert-flash 1s ease-in-out infinite',
        'sheet-up': 'sheet-up 220ms cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};
