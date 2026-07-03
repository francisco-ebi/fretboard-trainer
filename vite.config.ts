/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import crossOriginIsolated from 'vite-plugin-cross-origin-isolation';
import replace from "@rollup/plugin-replace";

import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: "/fretboard-trainer/",
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'framer-motion', 'i18next', 'react-i18next'],
          tensorflow: ['@tensorflow/tfjs'],
          audio: ['meyda', 'pitchfinder']
        }
      }
    }
  },
  plugins: [
    react(),
    crossOriginIsolated(),
    VitePWA({
      base: "/fretboard-trainer/",
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      devOptions: {
        enabled: process.env.SW_DEV === "true",
        type: "module",
        navigateFallback: "index.html",
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Feature-worker bundles (the essentia one embeds ~2.4MB of WASM) are
        // fetched on demand when the opt-in audio features initialize — keep
        // them out of the install-time precache.
        globIgnores: ['**/*feature-worker-*.js'],
        // Workbox default (2MB) acts as a tripwire: if a chunk ever grows past
        // it again (e.g. a dataset gets bundled), the build fails instead of
        // silently precaching tens of MB on first visit.
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Fretboard Trainer',
        short_name: 'Fretboard',
        description: 'Master the fretboard with this interactive trainer.',
        theme_color: '#242424',
        background_color: '#242424',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.jpeg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'pwa-512x512.jpeg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    }),
    replace({ __DATE__: new Date().toISOString() }),
  ],
})
