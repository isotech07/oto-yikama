import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Aynı origin: session çerezi sorunsuz çalışır, CORS gerekmez.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
