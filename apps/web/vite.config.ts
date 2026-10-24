/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3001' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true },
});
