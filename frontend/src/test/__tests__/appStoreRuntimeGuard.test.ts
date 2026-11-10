import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { it, expect } from 'vitest'

it('blocks application store evaluation in both configured projects', () => {
  const root = process.cwd()
  const scratch = mkdtempSync(path.join(root, '.store-guard-'))
  try {
    for (const verdict of ['reject', 'accept', 'no-tests', 'bypass']) {
      const config = path.join(scratch, 'vitest.config.ts')
      writeFileSync(
        config,
        `import original from '../vite.config.ts';
export default async (env) => {
 const config = await original(env);
 return { ...config, test: { ...config.test, projects: config.test.projects.map(project => ({ ...project, plugins: ${verdict === 'bypass' ? '[]' : 'project.plugins'}, test: { ...project.test, include: ['src/test/store-guard-fixtures/${verdict === 'no-tests' ? 'no-tests.reject' : '*.' + verdict}.fixture.ts'] } })) } };
};`,
      )
      for (const project of ['node', 'jsdom']) {
        const report = path.join(scratch, 'results.json')
        const result = spawnSync(
          process.execPath,
          [
            'node_modules/vitest/vitest.mjs',
            'run',
            '--config',
            config,
            '--project',
            project,
            '--disableConsoleIntercept',
            '--reporter=json',
            '--outputFile',
            report,
          ],
          { cwd: root, encoding: 'utf8', timeout: 180000 },
        )
        expect(result.error).toBeUndefined()
        const results = JSON.parse(readFileSync(report, 'utf8'))
        expect(results.testResults.length).toBe(
          verdict === 'reject' ? 14 : verdict === 'accept' ? 8 : 1,
        )
        for (const file of results.testResults) {
          if (verdict === 'reject' || verdict === 'no-tests') {
            if (file.name.includes('no-tests.')) {
              expect(result.stdout + result.stderr).toContain(
                'ERP_APP_STORE_EVALUATION_BLOCKED',
              )
            } else {
              expect(JSON.stringify(file), file.name).toContain(
                'ERP_APP_STORE_EVALUATION_BLOCKED',
              )
            }
            expect(file.status, file.name).toBe('failed')
            if (file.name.endsWith('/caught-test.reject.fixture.ts')) {
              expect(file.assertionResults).toHaveLength(1)
              expect(file.assertionResults[0].status, file.name).toBe('failed')
              expect(
                file.assertionResults[0].failureMessages.join('\n'),
              ).toContain('ERP_APP_STORE_EVALUATION_BLOCKED')
            }
          } else {
            expect(file.status, JSON.stringify(file)).toBe('passed')
          }
        }
        expect(result.status).toBe(
          verdict === 'reject' || verdict === 'no-tests' ? 1 : 0,
        )
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}, 750000)
