import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import { stmt } from '../statementTokens'

/**
 * statement.css is authoritative for token VALUES (spec §3). This suite does
 * not compare values — there is only one copy of them. It asserts the TS
 * handles and the CSS declarations name the same properties, which is the only
 * remaining failure mode: a typo'd `var(--stmt-inkk)` falls back silently to
 * an inherited colour rather than erroring.
 *
 * Expected and actual come from independent sources — the compiled TS module
 * and the raw stylesheet text — so this can genuinely fail.
 */
const CSS = readFileSync(
  path.join(__dirname, '..', 'statement.css'),
  'utf8',
)

/** Property names declared anywhere in the stylesheet, e.g. `--stmt-ink`. */
const declared = new Set(
  [...CSS.matchAll(/(--stmt-[a-z-]+)\s*:/g)].map((m) => m[1]),
)

/** Property names referenced by the TS handles, e.g. `--stmt-ink`. */
const referenced = new Set(
  Object.values(stmt).map((v) => {
    const m = /^var\((--stmt-[a-z-]+)\)$/.exec(v)
    if (!m) throw new Error(`handle is not a bare var() reference: ${v}`)
    return m[1]
  }),
)

describe('statement tokens', () => {
  it('declares at least one token', () => {
    expect(declared.size).toBeGreaterThan(0)
  })

  it('every TS handle names a property statement.css declares', () => {
    const missing = [...referenced].filter((p) => !declared.has(p)).sort()
    expect(missing, `handles with no CSS declaration: ${missing.join(', ')}`).toEqual([])
  })

  it('every declared token has a TS handle', () => {
    const orphans = [...declared].filter((p) => !referenced.has(p)).sort()
    expect(orphans, `CSS tokens with no TS handle: ${orphans.join(', ')}`).toEqual([])
  })

  it('exposes no raw colour values (statement.css is authoritative)', () => {
    for (const [name, value] of Object.entries(stmt)) {
      expect(value, `${name} must be a var() reference, not a literal`).toMatch(
        /^var\(--stmt-[a-z-]+\)$/,
      )
    }
  })

  it('remaps colour tokens under print media', () => {
    const printBlock = /@media print\s*\{([\s\S]*)\}/.exec(CSS)?.[1] ?? ''
    expect(printBlock).toMatch(/--stmt-paper\s*:/)
    expect(printBlock).toMatch(/--stmt-ink\s*:/)
    expect(printBlock).toMatch(/--stmt-negative\s*:/)
    expect(printBlock).toMatch(/--stmt-accent\s*:/)
  })
})
