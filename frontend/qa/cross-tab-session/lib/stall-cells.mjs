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
