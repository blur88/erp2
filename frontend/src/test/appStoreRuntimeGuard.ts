import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// See docs/frontend/testing-and-print.md#tests-never-evaluate-the-application-store.
export function appStoreRuntimeGuard(): Plugin {
  const store = realpathSync(
    fileURLToPath(new URL('../store/index.ts', import.meta.url)),
  )
  return {
    name: 'application-store-runtime-guard',
    enforce: 'pre',
    transform(_source, id) {
      if (id.split('?')[0] !== store) return
      return {
        code: `const error = new Error('ERP_APP_STORE_EVALUATION_BLOCKED');
const key = Symbol.for('erp.test.application-store-violations');
(globalThis[key] ??= []).push({ stack: error.stack, reported: false });
console.error(error.stack);
throw error;`,
        map: null,
      }
    },
  }
}
