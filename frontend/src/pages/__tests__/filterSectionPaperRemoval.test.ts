import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const filesToKeepFlat = [
  'src/pages/settings/BackupManagement.tsx',
  'src/pages/inventory/CategoriesPage.tsx',
]

describe('filter sections use flat wrappers', () => {
  it.each(filesToKeepFlat)('does not use the legacy Paper wrapper in %s', (relativePath) => {
    const source = readFileSync(resolve(import.meta.dirname, '../../../', relativePath), 'utf8')

    expect(source).not.toContain('<Paper sx={{ p: 2, mb: 3 }}>')
  })
})
