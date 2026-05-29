// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'STAURANT',
        short_name: 'STAURANT',
        description: 'Tu libreta de restaurantes y platos favoritos',
        theme_color: '#2e2e2e',
        background_color: '#fff8ec',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/img/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/img/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // No fallback para navegación — la app requiere red (auth Supabase)
        navigateFallback: null,
        // Cachear solo assets estáticos
        globPatterns: ['**/*.{css,js,html,svg,png,jpg,jpeg,ico,webp,avif,woff,woff2}'],
        runtimeCaching: [
          {
            // Supabase: siempre desde la red (auth + datos en tiempo real)
            urlPattern: /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false, // No activar SW en desarrollo
      },
    }),
  ],
});
