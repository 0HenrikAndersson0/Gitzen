import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './renderer',
  publicDir: 'public',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: true,
  },
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    sourcemapIgnoreList: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './renderer/src'),
    },
  },
});

