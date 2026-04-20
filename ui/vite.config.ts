import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const basePath = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: basePath,
  server: {
    port: 2685,
    proxy: {
      '/api': {
        target: 'http://localhost:2686',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
