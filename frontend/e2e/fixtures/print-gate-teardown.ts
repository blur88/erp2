import { rmSync } from 'node:fs'
import path from 'node:path'

const DESCRIPTOR_PATH =
  process.env.PRINT_GATE_DESCRIPTOR ??
  path.join(import.meta.dirname, '.print-gate-descriptor.json')

/**
 * Removes the descriptor only. The fixture ROWS are deliberately left in
 * place: the gate's database is disposable and torn down wholesale, and
 * deleting rows after a failure would destroy the state needed to reproduce
 * it.
 */
export default function globalTeardown() {
  rmSync(DESCRIPTOR_PATH, { force: true })
}
