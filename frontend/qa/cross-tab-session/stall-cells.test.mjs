// The matrix of the replay stall runs (#1370), as data. The protocol
// (docs/modules/auth/REPLAY_STALL_PROTOCOL.md) is the authority; this pins the
// table the driver and stall-cell.sh read to it.
//
//   node --test frontend/qa/cross-tab-session/stall-cells.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CELLS, HOLD_CELLS, cellSettings } from './lib/stall-cells.mjs'

test("the matrix is the protocol's", () => {
  assert.deepEqual(CELLS, {
    'C-unfixed': { build: 'control', tabs: 20, holdMs: 12000, graceSeconds: 5, cpuWorkers: 0, probe: false },
    'C-main': { build: 'main', tabs: 20, holdMs: 12000, graceSeconds: 5, cpuWorkers: 0, probe: false },
    H12: { build: 'main', tabs: 20, holdMs: 12000, graceSeconds: 5, cpuWorkers: 0, probe: false },
    H21: { build: 'main', tabs: 20, holdMs: 21000, graceSeconds: 5, cpuWorkers: 0, probe: false },
    T30: { build: 'main', tabs: 30, holdMs: 0, graceSeconds: 5, cpuWorkers: 0, probe: true },
    T40: { build: 'main', tabs: 40, holdMs: 0, graceSeconds: 5, cpuWorkers: 0, probe: true },
    G60: { build: 'main', tabs: 20, holdMs: 21000, graceSeconds: 60, cpuWorkers: 0, probe: false },
    P: { build: 'main', tabs: 20, holdMs: 0, graceSeconds: 5, cpuWorkers: 8, probe: true },
    X: { build: 'main', tabs: 30, holdMs: 21000, graceSeconds: 60, cpuWorkers: 0, probe: true },
  })
})

test('the two halves of the control differ in the build only', () => {
  const { build: a, ...unfixed } = CELLS['C-unfixed']
  const { build: b, ...main } = CELLS['C-main']
  assert.deepEqual(unfixed, main)
  assert.notEqual(a, b)
})

test('the hold cells are the ones with a hold', () => {
  assert.deepEqual(HOLD_CELLS, ['C-unfixed', 'C-main', 'H12', 'H21', 'G60', 'X'])
})

test('an unknown cell is an error', () => {
  assert.throws(() => cellSettings('H13'), /unknown cell/)
  assert.deepEqual(cellSettings('P'), CELLS.P)
})
