import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kds: { bg: '#0f0f0f', card: '#1a1a1a', border: '#2a2a2a' }
      }
    }
  },
};
export default config;
