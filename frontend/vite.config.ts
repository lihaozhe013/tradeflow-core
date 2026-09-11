import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import frontendConfig from '../build-config/frontendConfig.json' with { type: 'json' };

const frontendRoot = process.cwd();

// Compute the short git commit hash at build-time; fall back to 'unknown' if unavailable
function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const COMMIT_HASH = getCommitHash();

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // Replace __COMMIT_HASH__ with a hardcoded string literal at build time
  define: {
    __COMMIT_HASH__: JSON.stringify(COMMIT_HASH)
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@/build-config': path.resolve(frontendRoot, '../build-config'),
      '@': path.resolve(frontendRoot, './src'),
      '@/components': path.resolve(frontendRoot, './src/components'),
      '@/pages': path.resolve(frontendRoot, './src/pages'),
      '@/hooks': path.resolve(frontendRoot, './src/hooks'),
      '@/utils': path.resolve(frontendRoot, './src/utils'),
      '@/auth': path.resolve(frontendRoot, './src/auth'),
      '@/config': path.resolve(frontendRoot, './src/config'),
      '@/i18n': path.resolve(frontendRoot, './src/i18n'),
      '@/types': path.resolve(frontendRoot, './src/types')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false
      },
      '/exported-files': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false
      }
    }
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
        }
      }
    },
    chunkSizeWarningLimit: 2000
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': {
        target: frontendConfig.server.url,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
