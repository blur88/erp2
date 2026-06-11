import { defineConfig } from 'vitest/config'
import { createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isVitest =
    mode === 'test' ||
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST != null ||
    process.argv.some(arg => arg.includes('vitest'))

  const baseLogger = createLogger()
  const vitestLogger = {
    ...baseLogger,
    error(message: string, options?: any) {
      if (
        typeof message === 'string' &&
        (message.includes('WebSocket server error') || message.includes('listen EPERM'))
      ) {
        return
      }

      baseLogger.error(message, options)
    },
  }

  return {
    customLogger: isVitest ? vitestLogger : undefined,
    plugins: isVitest ? [] : [react()],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
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
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor',
                test: /node_modules[\\/](react|react-dom)[\\/]/,
                priority: 50,
              },
              {
                name: 'mui',
                test: /node_modules[\\/]@mui[\\/]/,
                priority: 40,
              },
              {
                name: 'charts',
                test: /node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
                priority: 30,
              },
              {
                name: 'router',
                test: /node_modules[\\/](react-router|react-router-dom)[\\/]/,
                priority: 20,
              },
              {
                name: 'redux',
                test: /node_modules[\\/](@reduxjs[\\/]toolkit|react-redux)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    test: {
      globals: true,
      // MUI v9.1+ ships ESM that does an extensionless directory import
      // (`react-transition-group/TransitionGroupContext`). react-transition-group
      // 4.x has no `exports` map, so Node's native ESM resolver rejects it with
      // ERR_UNSUPPORTED_DIR_IMPORT. Inlining these deps routes them through
      // Vite's resolver (which rewrites the import) instead of raw Node ESM.
      server: {
        deps: {
          inline: [/@mui\//, /react-transition-group/],
        },
      },
      environment: 'jsdom',
      environmentMatchGlobs: [['src/**/*.test.ts', 'node']],
      setupFiles: ['./src/test/setup.ts', './src/setupTests.ts'],
      api: false,
      maxWorkers: 2,
      execArgv: ['--max-old-space-size=1536'],
      testTimeout: 30000,
    },
  }
})
