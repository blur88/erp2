// @vitest-environment node

import os from 'node:os'

import { describe, expect, it, vi } from 'vitest'

describe('vite config in test mode', () => {
  it('uses localhost host and disables hmr even if VITEST is unset at config load', async () => {
    const originalVitestEnv = process.env.VITEST
    delete process.env.VITEST

    vi.resetModules()
    const { default: viteConfig } = await import('../../../vite.config.ts')

    process.env.VITEST = originalVitestEnv

    const config = typeof viteConfig === 'function'
      ? (viteConfig as any)({
          command: 'serve',
          mode: 'test',
          isPreview: false,
          isSsrBuild: false,
        })
      : viteConfig

    expect(config.server).toMatchObject({
      host: '127.0.0.1',
      hmr: false,
    })
  })

  it('uses available CPU parallelism for Vitest workers instead of a fixed low cap', async () => {
    const originalVitestEnv = process.env.VITEST
    delete process.env.VITEST

    vi.resetModules()
    const { default: viteConfig } = await import('../../../vite.config.ts')

    process.env.VITEST = originalVitestEnv

    const config = typeof viteConfig === 'function'
      ? (viteConfig as any)({
          command: 'serve',
          mode: 'test',
          isPreview: false,
          isSsrBuild: false,
        })
      : viteConfig

    const expectedWorkers = Math.max(2, os.availableParallelism())
    expect(config.test?.maxWorkers).toBe(expectedWorkers)
  })
})
