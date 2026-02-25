import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isVitest =
    mode === 'test' ||
    process.env.VITEST === 'true' ||
    process.env.VITEST === '1'

  return {
    plugins: isVitest ? [] : [react({ fastRefresh: true })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/pages': path.resolve(__dirname, './src/pages'),
        '@/hooks': path.resolve(__dirname, './src/hooks'),
        '@/services': path.resolve(__dirname, './src/services'),
        '@/store': path.resolve(__dirname, './src/store'),
        '@/utils': path.resolve(__dirname, './src/utils'),
        '@/types': path.resolve(__dirname, './src/types'),
        '@/styles': path.resolve(__dirname, './src/styles'),
        '@/assets': path.resolve(__dirname, './src/assets'),
      },
    },
    server: isVitest
      ? {
          host: '127.0.0.1',
          hmr: false,
        }
      : {
          port: 3000,
          host: true,
          proxy: {
            '/api': {
              target: 'http://localhost:3001',
              changeOrigin: true,
              secure: false,
            },
            '/socket.io': {
              target: 'http://localhost:3001',
              changeOrigin: true,
              ws: true,
            },
          },
        },
    root: '.',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            mui: ['@mui/material', '@mui/icons-material'],
            charts: ['chart.js', 'react-chartjs-2', 'recharts'],
            router: ['react-router-dom'],
            redux: ['@reduxjs/toolkit', 'react-redux'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      api: false,
      pool: 'forks',
      poolOptions: {
        forks: {
          minForks: 1,
          maxForks: 2,
          execArgv: ['--max-old-space-size=4096'],
        },
      },
    },
  }
})
