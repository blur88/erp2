// What the figures were measured on: results.json records it beside them.
import { cpus, totalmem, release } from 'node:os'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

export function machine() {
  const disks = []
  if (existsSync('/sys/block')) {
    for (const name of readdirSync('/sys/block')) {
      if (/^(loop|ram|zram|dm-|sr|nbd)/.test(name)) continue
      const flag = `/sys/block/${name}/queue/rotational`
      if (!existsSync(flag)) continue
      const rotational = readFileSync(flag, 'utf8').trim() === '1'
      disks.push({ name, rotational, kind: rotational ? 'spinning disk' : 'SSD or other non-rotational' })
    }
  }
  return {
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    memoryGiB: Math.round((totalmem() / 2 ** 30) * 10) / 10,
    kernel: release(),
    disks,
  }
}

/** The `erp-build` value of the page the ingress serves, or null. */
export async function servedBuild(base) {
  const response = await fetch(`${base}/`)
  const html = await response.text()
  const m = /name="erp-build" content="([^"]*)"/.exec(html)
  return m ? m[1] : null
}
