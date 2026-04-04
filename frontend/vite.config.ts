import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import frontendConfig from '../build-config/frontendConfig.json';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@/build-config': path.resolve(__dirname, '../build-config'),
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/pages': path.resolve(__dirname, './src/pages'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/auth': path.resolve(__dirname, './src/auth'),
      '@/config': path.resolve(__dirname, './src/config'),
      '@/i18n': path.resolve(__dirname, './src/i18n'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false,
      },
      '/exported-files': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2024',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('antd')) {
              return 'antd';
            }
            if (id.includes('react-router-dom')) {
              return 'router';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
