import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Oto Yıkama Yönetim',
        short_name: 'Oto Yıkama',
        description: 'İş emri, tahsilat ve müşteri yönetimi',
        lang: 'tr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#1566b0',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Yalnızca uygulama kabuğu önbelleğe alınır. /api asla önbelleğe alınmaz:
        // kasada eski bakiye veya durum göstermek yanlış tahsilata yol açar.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    // Aynı origin: session çerezi sorunsuz çalışır, CORS gerekmez.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
