import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (file: string) => resolve(import.meta.dirname, file);

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/; CI passes the path from actions/configure-pages
  base: process.env.BASE_PATH || '/',
  build: {
    // three.js is lazy-loaded only for the 3D model, so its large chunk is expected
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: page('index.html'),
        impressum: page('impressum.html'),
        datenschutz: page('datenschutz.html'),
      },
    },
  },
});
