import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/DataForge/',
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg'],
    manifest: { name: 'DataForge — Test data workbench', short_name: 'DataForge', description: 'Local-first test data generation', theme_color: '#101a2d', background_color: '#f3f5f9', display: 'standalone', start_url: '/DataForge/', scope: '/DataForge/', icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallback: '/DataForge/index.html', cleanupOutdatedCaches: true },
  })],
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
