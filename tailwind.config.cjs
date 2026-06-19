/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // enable class-based dark mode
  theme: {
    extend: {
      colors: {
        primary: '#aa3bff',
        background: 'var(--bg)',
        foreground: 'var(--text)',
      },
    },
  },
  plugins: [],
};
