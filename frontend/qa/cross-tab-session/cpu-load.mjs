#!/usr/bin/env node
// Busy workers for the processor cell of the stall runs (#1370): N threads that
// do nothing but spin, until the process is killed. Processor pressure only: it
// allocates nothing and touches no disk.
//
//   node cpu-load.mjs <workers>     1 to 64
//
// Started and stopped by host-probe.sh, in a container of its own.
import { Worker } from 'node:worker_threads'

const workers = Number(process.argv[2])
if (!Number.isInteger(workers) || workers < 1 || workers > 64) {
  console.error('usage: cpu-load.mjs <workers>   (1 to 64)')
  process.exit(2)
}
for (let i = 0; i < workers; i += 1) new Worker('for (;;) {}', { eval: true })
console.log(`cpu-load: ${workers} workers busy`)
