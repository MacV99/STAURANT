// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

/** En local imita la regla de public/_redirects (`/oficial/*  /oficial  200`), que
 *  solo existe en Netlify: sin esto, recargar `/oficial/@handle` daba 404 en dev/preview. */
function officialHandleRewrite() {
  const rewrite = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (/^\/oficial\/[^/]+\/?$/.test(path)) {
      req.url = '/oficial/' + (query ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'official-handle-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// https://astro.build/config
export default defineConfig({
  // URL pública: base de las <meta og:*> (vista previa al compartir).
  site: 'https://staurant.netlify.app',
  vite: {
    plugins: [officialHandleRewrite()],
  },
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'STAURANT',
        short_name: 'STAURANT',
        description: 'Tu libreta de restaurantes y platos favoritos',
        theme_color: '#2e2e2e',
        background_color: '#f7f7f7',
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
        // Solo para las imágenes de vista previa al compartir (servidor): no precachear.
        globIgnores: ['fonts/**', 'img/og-app.png'],
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
