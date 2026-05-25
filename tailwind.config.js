/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        devlens: {
          bg: '#0f1117',
          surface: '#1a1d27',
          border: '#2a2d3a',
          accent: '#6366f1',
          'accent-hover': '#4f52e0',
          text: '#e2e8f0',
          muted: '#64748b',
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
          blue: '#3b82f6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
