import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (file: string) => resolve(import.meta.dirname, file);

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/; CI passes the path from actions/configure-pages
  base: process.env.BASE_PATH || '/',
  build: {
    rolldownOptions: {
      input: {
        // The walk into the garden is the homepage.
        main: page('index.html'),
        impressum: page('impressum.html'),
        datenschutz: page('datenschutz.html'),
      },
    },
  },
});
