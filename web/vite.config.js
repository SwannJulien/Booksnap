import { defineConfig } from 'vite';

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

    // API proxy to avoid CORS in development
    proxy: {
      '/actuator/health': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview server (to test the local build)
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
  },

  // Dependency optimization
  optimizeDeps: {
    include: ['lit', '@vaadin/router', '@zxing/browser'],
  },
});
