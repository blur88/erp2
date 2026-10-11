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

// --- what one invocation of the driver may be told ---------------------------------
import { stallOptions } from './lib/stall-cells.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = (overrides = {}) => ({ QA_STALL_CELL: 'H21', QA_STALL_KIND: 'recorded', ...overrides })

test('a recorded invocation runs the cell as the matrix has it, ten rounds, gated', () => {
  assert.deepEqual(stallOptions(env()), {
    cell: 'H21', kind: 'recorded', rounds: 10, settings: CELLS.H21,
    mechanism: { gate: true, barrierMs: 10000, nudgePath: '/inventory/products' },
  })
})

test('the mechanism is read from the environment', () => {
  const options = stallOptions(env({ QA_STALL_GATE: '0', QA_STALL_BARRIER_MS: '4000', QA_STALL_NUDGE_PATH: '/sales/orders', QA_STALL_ROUNDS: '3' }))
  assert.deepEqual(options.mechanism, { gate: false, barrierMs: 4000, nudgePath: '/sales/orders' })
  assert.equal(options.rounds, 3)
})

test('calibration may change the hold and force the probe on; the cell table is not touched', () => {
  const options = stallOptions(env({ QA_STALL_KIND: 'calibration', QA_STALL_HOLD_MS: '12000', QA_STALL_PROBE: '1' }))
  assert.deepEqual(options.settings, { ...CELLS.H21, holdMs: 12000, probe: true })
  assert.equal(CELLS.H21.holdMs, 21000)
})

for (const [name, overrides, message] of [
  ['a hold override', { QA_STALL_HOLD_MS: '12000' }, /QA_STALL_HOLD_MS.*calibration/],
  ['a probe override', { QA_STALL_PROBE: '1' }, /QA_STALL_PROBE.*calibration/],
]) {
  test(`a recorded invocation refuses ${name}`, () => {
    assert.throws(() => stallOptions(env(overrides)), message)
  })
}

for (const [name, overrides, message] of [
  ['an unknown cell', { QA_STALL_CELL: 'H13' }, /unknown cell/],
  ['no kind', { QA_STALL_KIND: undefined }, /QA_STALL_KIND/],
  ['a kind that is neither', { QA_STALL_KIND: 'practice' }, /QA_STALL_KIND/],
  ['zero rounds', { QA_STALL_ROUNDS: '0' }, /QA_STALL_ROUNDS/],
  ['a gate that is not 0 or 1', { QA_STALL_GATE: 'yes' }, /QA_STALL_GATE/],
  ['a nudge path that is not a path', { QA_STALL_NUDGE_PATH: 'inventory' }, /QA_STALL_NUDGE_PATH/],
]) {
  test(`${name} is refused`, () => {
    assert.throws(() => stallOptions(env(overrides)), message)
  })
}

test('the driver itself refuses a hold override on a recorded invocation, before it needs a stack', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./diagnose-stall.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, QA_STALL_CELL: 'H21', QA_STALL_KIND: 'recorded', QA_STALL_HOLD_MS: '12000' },
    encoding: 'utf8',
  })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /QA_STALL_HOLD_MS/)
})
