// Client side of host-probe.sh: asks the host how many auth_sessions rows a
// user has. See that script for why the question cannot be answered here.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './config.mjs'

let counter = 0

export async function sessionCount(config, username) {
  const dir = join(config.scratch, 'probe')
  mkdirSync(dir, { recursive: true })
  const id = `${process.pid}-${Date.now()}-${(counter += 1)}`
  const req = join(dir, `${id}.req`)
  const res = join(dir, `${id}.res`)
  writeFileSync(req, `session-count ${username}\n`)
  const deadline = Date.now() + 20000
  while (!existsSync(res)) {
    if (Date.now() > deadline) {
      rmSync(req, { force: true })
      throw new Error('host-probe.sh did not answer within 20 s; is it running against this scratch directory?')
    }
    await sleep(150)
  }
  const answer = readFileSync(res, 'utf8').trim()
  rmSync(res, { force: true })
  if (!/^\d+$/.test(answer)) throw new Error(`host probe answered "${answer}"`)
  return Number(answer)
}
