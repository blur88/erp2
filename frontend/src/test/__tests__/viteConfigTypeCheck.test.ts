import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const runTypeCheck = (includeUnknownTestOption: boolean) => {
  const root = process.cwd()
  const scratch = mkdtempSync(path.join(root, '.vite-config-type-check-'))

  try {
    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.test.json', 'tsconfig.node.json']) {
      copyFileSync(path.join(root, file), path.join(scratch, file))
    }

    const sourceConfig = readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
    const config = includeUnknownTestOption
      ? sourceConfig.replace(
          /^ {4}test: \{\n/m,
          '    test: {\n      unrecognizedTestOption: true,\n',
        )
      : sourceConfig

    writeFileSync(path.join(scratch, 'vite.config.ts'), config)
    mkdirSync(path.join(scratch, 'src', 'test'), { recursive: true })
    copyFileSync(
      path.join(root, 'src', 'test', 'appStoreRuntimeGuard.ts'),
      path.join(scratch, 'src', 'test', 'appStoreRuntimeGuard.ts'),
    )

    return spawnSync('npm', ['run', 'type-check:test'], {
      cwd: scratch,
      encoding: 'utf8',
      timeout: 180000,
      env: {
        ...process.env,
        PATH: [path.join(root, 'node_modules', '.bin'), process.env.PATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
    })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

describe('Vite and Vitest config type check', () => {
  it('accepts the checked-in config', () => {
    const result = runTypeCheck(false)

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
  }, 200000)

  it('rejects an unknown Vitest option', () => {
    const result = runTypeCheck(true)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(output).toContain('TS2353')
    expect(output).toContain('unrecognizedTestOption')
  }, 200000)
})
