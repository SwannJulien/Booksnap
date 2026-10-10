import { defineConfig } from 'vite';

const apiTarget = process.env.BOOKSNAP_API_ORIGIN || 'http://127.0.0.1:8080';
const apiProxy = {
  '/actuator/health': {
    target: apiTarget,
    changeOrigin: true,
  },
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  // Root entry point
  root: '.',

  // Production build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // HTML entry point
    rollupOptions: {
      input: './index.html',
    },

    // Production optimizations
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,

    // Chunking for better caching
    chunkSizeWarningLimit: 1000,
  },

  // Development server configuration
  server: {
    port: 5000,
    strictPort: true,
    host: true, // Listen on all interfaces (0.0.0.0)
    allowedHosts: true,

    // Same-origin API proxy for development and the production preview server.
    proxy: apiProxy,
  },

  // Preview server (to test the local build)
  preview: {
    port: 5000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: apiProxy,
  },

  // Dependency optimization
  optimizeDeps: {
    include: ['lit', '@vaadin/router', '@zxing/browser'],
  },
});
