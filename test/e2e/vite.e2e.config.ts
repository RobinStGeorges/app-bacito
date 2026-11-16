import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  server: { port: 5199 },
  plugins: [svelte({ configFile: here('../../svelte.config.js') })],
  resolve: {
    alias: [
      { find: /^famille-core$/, replacement: here('../fake/famille-core.ts') },
      { find: 'famille-core/theme.css', replacement: here('../../node_modules/famille-core/dist/theme.css') },
      { find: /^firebase\/firestore$/, replacement: here('../fake/firestore.ts') },
      { find: 'virtual:pwa-register', replacement: here('./pwa-stub.ts') },
    ],
  },
});
