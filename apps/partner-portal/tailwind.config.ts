import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        partner: { bg: '#f8fafc', sidebar: '#0f172a', accent: '#6366f1' }
      },
    }
  },
};
export default config;
