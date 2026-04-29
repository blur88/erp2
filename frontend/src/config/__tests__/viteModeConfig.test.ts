// @vitest-environment node

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

  it('uses 2 Vitest workers with a 5120 MB heap cap in test mode', async () => {
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

    expect(config.test?.maxWorkers).toBe(2)
    expect(config.test?.execArgv).toEqual(['--max-old-space-size=5120'])
  })
})
