/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e8ff',
          200: '#b9c9ff',
          300: '#7e9dff',
          400: '#3d6aff',
          500: '#1845f5',
          600: '#0c2de0',
          700: '#0b22b5',
          800: '#0f1e93',
          900: '#0f172a',
          950: '#07091a',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
