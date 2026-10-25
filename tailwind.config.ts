import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 900: '#0c0b17', 800: '#151326', 700: '#1f1d36', 600: '#2a2745', 500: '#38345a' },
        line: '#28253f',
        brand: { DEFAULT: '#9d5cf5', 600: '#8b46ec', 300: '#c4a0fb' },
        aqua: '#22d3ee',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
