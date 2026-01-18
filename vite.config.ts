import { defineConfig } from 'vite';

export default defineConfig({
  base: '/shader-composer/',
  server: {
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});

