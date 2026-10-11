// The matrix of the replay stall runs (#1370). One source for a cell's
// settings: the driver and stall-cell.sh read them here and nowhere else.
// docs/modules/auth/REPLAY_STALL_PROTOCOL.md is the authority this is pinned to.
//
// `build` says which branch a cell runs on: `main` is the evidence branch
// (frontend/src identical to the pinned main commit), `control` the branch with
// the pending token commit reverted. `probe` installs the timer-lateness probe
// in every tab of the round.
const cell = (build, tabs, holdMs, graceSeconds, cpuWorkers, probe) => ({ build, tabs, holdMs, graceSeconds, cpuWorkers, probe })

export const CELLS = {
  'C-unfixed': cell('control', 20, 12000, 5, 0, false),
  'C-main': cell('main', 20, 12000, 5, 0, false),
  H12: cell('main', 20, 12000, 5, 0, false),
  H21: cell('main', 20, 21000, 5, 0, false),
  T30: cell('main', 30, 0, 5, 0, true),
  T40: cell('main', 40, 0, 5, 0, true),
  G60: cell('main', 20, 21000, 60, 0, false),
  P: cell('main', 20, 0, 5, 8, true),
  X: cell('main', 30, 21000, 60, 0, true),
}

export const HOLD_CELLS = Object.keys(CELLS).filter((id) => CELLS[id].holdMs > 0)

export function cellSettings(id) {
  if (!Object.hasOwn(CELLS, id)) throw new Error(`unknown cell '${id}'`)
  return CELLS[id]
}

const DEFAULT_BARRIER_MS = 10000
const DEFAULT_NUDGE_PATH = '/inventory/products'

const wholeNumber = (name, text, min) => {
  const n = Number(text)
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be a whole number of at least ${min}, not '${text}'`)
  return n
}

/**
 * What one invocation of the driver is told, from its environment. A recorded
 * invocation runs its cell exactly as the table has it: the hold and the probe
 * can be overridden only while calibrating, so no recorded round can run under
 * a setting the matrix does not name. The mechanism (gate, barrier, nudge) is
 * the frozen one, passed in by stall-cell.sh.
 */
export function stallOptions(env) {
  const kind = env.QA_STALL_KIND
  if (kind !== 'calibration' && kind !== 'recorded') throw new Error(`QA_STALL_KIND must be 'calibration' or 'recorded', not '${kind}'`)
  const cell = env.QA_STALL_CELL
  const settings = { ...cellSettings(cell) }
  for (const name of ['QA_STALL_HOLD_MS', 'QA_STALL_PROBE']) {
    if (env[name] !== undefined && kind !== 'calibration') throw new Error(`${name} is honoured only when QA_STALL_KIND is calibration`)
  }
  if (env.QA_STALL_HOLD_MS !== undefined) settings.holdMs = wholeNumber('QA_STALL_HOLD_MS', env.QA_STALL_HOLD_MS, 0)
  if (env.QA_STALL_PROBE !== undefined) {
    if (env.QA_STALL_PROBE !== '1') throw new Error("QA_STALL_PROBE can only be '1'")
    settings.probe = true
  }
  const gate = env.QA_STALL_GATE ?? '1'
  if (gate !== '0' && gate !== '1') throw new Error(`QA_STALL_GATE must be 0 or 1, not '${gate}'`)
  const nudgePath = env.QA_STALL_NUDGE_PATH ?? DEFAULT_NUDGE_PATH
  if (!/^\/[a-z0-9/-]+$/.test(nudgePath)) throw new Error(`QA_STALL_NUDGE_PATH must be a path inside the application, not '${nudgePath}'`)
  return {
    cell,
    kind,
    rounds: env.QA_STALL_ROUNDS === undefined ? 10 : wholeNumber('QA_STALL_ROUNDS', env.QA_STALL_ROUNDS, 1),
    settings,
    mechanism: {
      gate: gate === '1',
      barrierMs: env.QA_STALL_BARRIER_MS === undefined ? DEFAULT_BARRIER_MS : wholeNumber('QA_STALL_BARRIER_MS', env.QA_STALL_BARRIER_MS, 0),
      nudgePath,
    },
  }
}
