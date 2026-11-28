/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Ohne @types/node: nur die Umgebungsvariablen, die hier gebraucht werden
declare const process: { env: Record<string, string | undefined> };

// Woher dieser Build kommt; die CI setzt die Werte beim Image-Bau (siehe Dockerfile)
// Die Version kommt aus package.json: npm setzt npm_package_version bei jedem „npm run …“
const build = {
  version: process.env.npm_package_version ?? '',
  pr: process.env.BUILD_PR ?? '',
  sha: (process.env.BUILD_SHA ?? '').slice(0, 7),
  time: process.env.BUILD_TIME ?? '',
};

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // App-Shell komplett vorhalten, damit der Life-Tracker ohne Netz startet (N-01)
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,webmanifest}'],
        // Beta-Icons und -Manifest liefert nur Caddy auf Staging aus (AP-3b), nicht vorhalten
        globIgnores: ['beta/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        // Push-Nachrichten anzeigen, auch wenn die App geschlossen ist (AP-8)
        importScripts: ['push-sw.js'],
      },
      manifest: {
        id: '/',
        name: 'TopStack',
        short_name: 'TopStack',
        description: 'Life-Tracker, Draft-Turniere und Rangliste für deine MTG-Gruppe',
        lang: 'de',
        start_url: '/',
        scope: '/',
        theme_color: '#121218',
        background_color: '#121218',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  // Erlaubt Tests über einen temporären Cloudflare-Tunnel (HTTPS aufs Handy)
  preview: { allowedHosts: ['.trycloudflare.com'] },
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/api': 'http://localhost:8000', '/ws': { target: 'ws://localhost:8000', ws: true } },
  },
  test: { include: ['src/**/*.test.ts'] },
});
