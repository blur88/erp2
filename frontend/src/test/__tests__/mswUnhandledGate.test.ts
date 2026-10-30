import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { it, expect } from 'vitest'

it('reports absorbed requests after tests and after failed suite setup', () => {
  const root = process.cwd()
  const scratch = mkdtempSync(path.join(root, '.msw-guard-'))
  try {
    const config = path.join(scratch, 'vitest.config.ts')
    writeFileSync(config, `import original from '../vite.config.ts';
export default async (env) => {
 const config = await original(env);
 return {
   ...config,
   test: {
     ...config.test,
     projects: config.test.projects
       .filter(p => p.test.name === 'node')
       .map(p => ({
         ...p,
         test: {
           ...p.test,
           include: ['src/test/msw-guard-fixtures/*.fixture.ts'],
         },
       })),
   },
 };
};`)
    const report = path.join(scratch, 'results.json')
    const result = spawnSync(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', '--config', config,
      '--reporter=json', '--reporter=default', '--outputFile', report,
    ], { cwd: root, encoding: 'utf8', timeout: 180000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const results = JSON.parse(readFileSync(report, 'utf8'))
    expect(results.testResults).toHaveLength(2)
    const output = JSON.stringify(results) + result.stdout + result.stderr
    expect(output).toContain('Unhandled MSW requests:')
    for (const request of [
      'GET http://localhost:3001/__gate_get__',
      'POST http://localhost:3001/__gate_post__',
    ]) expect(output).toContain(request)
    expect(output).toMatch(/Unhandled MSW requests:\nGET http:\/\/localhost:3001\/__gate_setup__/)
    const requests = results.testResults.find((file: { name: string }) => file.name.endsWith('/requests.fixture.ts'))
    expect(requests.assertionResults[0].status).toBe('failed')
    expect(requests.assertionResults[0].failureMessages.join('\n')).toContain('Unhandled MSW requests:')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}, 200000)
