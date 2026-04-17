import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Syne', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Node type colours
        node: {
          service: { bg: '#EFF6FF', border: '#93C5FD' },
          pipeline: { bg: '#F0FDFA', border: '#5EEAD4' },
          database: { bg: '#FAF5FF', border: '#C4B5FD' },
          redis: { bg: '#FFF7F0', border: '#FCA07A' },
          gcs_bucket: { bg: '#FFFBEB', border: '#FCD34D' },
          schema: { bg: '#F9FAFB', border: '#9CA3AF' },
          note: { bg: '#FFFFFF', border: '#E5E7EB' },
          team: { bg: '#F0FDF4', border: '#86EFAC' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
