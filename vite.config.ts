import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Servie sous https://lepetitperchoir.fr/bacito/ (le routeur retire le préfixe avant le Worker
// famille-bacito, mais les URL vues par le navigateur gardent /bacito/).
export default defineConfig({
  base: '/bacito/',
  server: { port: 5178, strictPort: true },
  // Firebase pèse ~700 Ko minifié (~220 Ko compressé) : normal, pas la peine d'avertir.
  build: { chunkSizeWarningLimit: 1000 },
  preview: { port: 5178, strictPort: true },
  plugins: [
    svelte(),
    VitePWA({
      // Seul le portail est installable : pas de manifeste ici, juste le cache hors-ligne.
      registerType: 'prompt',
      manifest: false,
      injectRegister: false,
      workbox: {
        navigateFallback: '/bacito/index.html',
        navigateFallbackAllowlist: [/^\/bacito\/(index\.html)?$/],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
});
