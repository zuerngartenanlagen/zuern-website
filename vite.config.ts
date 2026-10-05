import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (file: string) => resolve(import.meta.dirname, file);

export default defineConfig({
  // Custom domain zuern-gartenanlagen.de serves this Pages site from /.
  // The project path /zuern-website/ 404s there, so assets must not use it.
  base: '/',
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
