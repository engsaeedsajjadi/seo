import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', port: 3000, strictPort: true, hmr: { port: 3000 }, proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
    // Same policy as nginx.conf, so browser tests catch violations.
    headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" },
  },
});
