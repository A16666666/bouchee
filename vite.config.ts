import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/bouchee/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      manifest: {
        name: 'Bouchée',
        short_name: 'Bouchée',
        description: 'Suivi des repas, calories et macros',
        lang: 'fr',
        start_url: '/bouchee/',
        scope: '/bouchee/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12141F',
        theme_color: '#12141F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], navigateFallback: '/bouchee/index.html' },
    }),
  ],
});
