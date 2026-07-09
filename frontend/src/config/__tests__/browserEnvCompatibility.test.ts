// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const frontendRoot = path.resolve(__dirname, '../../..')

const readFrontendFile = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), 'utf8')

describe('browser env compatibility', () => {
  it('avoids process.env in the redux store', () => {
    expect(readFrontendFile('src/store/index.ts')).not.toMatch(/process\.env/)
  })

  it('avoids process.env in PurchaseOrdersPage', () => {
    expect(readFrontendFile('src/pages/purchasing/PurchaseOrdersPage.tsx')).not.toMatch(/process\.env/)
  })
})
