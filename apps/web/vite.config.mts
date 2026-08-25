/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const openClockworkPackage = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'),
) as { version?: unknown };

if (
  typeof openClockworkPackage.version !== 'string' ||
  openClockworkPackage.version.length === 0
) {
  throw new Error('The root package.json must contain a version');
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  define: {
    'import.meta.env.VITE_OPEN_CLOCKWORK_VERSION': JSON.stringify(
      openClockworkPackage.version,
    ),
  },
  server: {
    port: 4200,
    host: 'localhost',
    headers: {
      'Permissions-Policy': 'camera=(self), geolocation=(self)',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4200,
    host: 'localhost',
    headers: {
      'Permissions-Policy': 'camera=(self), geolocation=(self)',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'OpenClockwork',
        short_name: 'Clockwork',
        description: 'Self-hostable working-time tracker',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globIgnores: [
          '**/runtime-config.js',
          '**/kiosk.html',
          '**/*.webmanifest',
        ],
        // Kiosk challenges and scans are intentionally network-only. A stale
        // service-worker response must never resurrect an expired QR code.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/socket\.io\//,
          /^\/kiosk(?:\/|$|\?)/,
        ],
        runtimeCaching: [
          {
            urlPattern: /\/api\/terminals\/kiosk(?:\?|$)/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/terminals\/(?:pair|scan)(?:\?|$)/,
            handler: 'NetworkOnly',
            method: 'POST',
          },
          {
            urlPattern: /\/kiosk(?:\?|$)/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    {
      name: 'openclockwork-kiosk-manifest',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          const indexHtml = bundle['index.html'];
          if (
            indexHtml?.type !== 'asset' ||
            typeof indexHtml.source !== 'string'
          ) {
            throw new Error('Vite did not emit the expected index.html entry');
          }
          const employeeManifest =
            '<link rel="manifest" href="/manifest.webmanifest">';
          if (!indexHtml.source.includes(employeeManifest)) {
            throw new Error('Employee manifest tag is missing from index.html');
          }
          const kioskHead = [
            '<meta name="robots" content="noindex,nofollow,noarchive">',
            '<meta name="apple-mobile-web-app-title" content="Clockwork Terminal">',
          ].join('');
          const kioskHtml = indexHtml.source
            .replace(
              '<title>OpenClockwork</title>',
              '<title>OpenClockwork Terminal</title>',
            )
            .replace('content="#0f172a"', 'content="#020617"')
            .replace(
              employeeManifest,
              '<link rel="manifest" href="/kiosk.webmanifest">',
            )
            .replace('</head>', `${kioskHead}</head>`);
          this.emitFile({
            type: 'asset',
            fileName: 'kiosk.html',
            source: kioskHtml,
          });
        },
      },
    },
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
