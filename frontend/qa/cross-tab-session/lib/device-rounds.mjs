// Pure: what the ingress access log holds for each round of the device
// acceptance (device/restored-window.js).
//
// A round sends two markers, `device-<kind>-<ms>-in` and `-out`, on
// /manifest.json, which no limiter meters. What lies between them, from the
// address that sent them, is what the limiters decided while the round ran.
// This is diagnostic: whether the round passed is the device's own measurement.
import { attribute } from '../../../../nginx/access-log.mjs'
import { diagnostics, limiterZoneOf, windowBetween } from './ingress-log.mjs'

const OPENING = /^(device-(.+)-\d+)-in$/

export function deviceRounds(entries) {
  const openings = entries.filter((e) => e.qaId && OPENING.test(e.qaId)).sort((a, b) => a.startMs - b.startMs)
  return openings.map((opening) => {
    const [, id, kind] = OPENING.exec(opening.qaId)
    const window = windowBetween(entries, `${id}-in`, `${id}-out`)
    // Without the closing marker the round's end is not known, and a window
    // closed by guess would count another round's requests.
    if (!window) return { id, kind, clientAddr: opening.remoteAddr, closed: false }
    const api = window.entries.filter((e) => limiterZoneOf(e.method, e.uri) !== null)
    const statuses = {}
    for (const e of api) statuses[e.status] = (statuses[e.status] ?? 0) + 1
    return {
      id,
      kind,
      clientAddr: window.clientAddr,
      closed: true,
      apiRequests: api.length,
      statuses,
      refused: api
        .filter((e) => e.status === 429)
        .map((e) => ({ method: e.method, uri: String(e.uri).split('?')[0], by: attribute(e), zone: limiterZoneOf(e.method, e.uri) })),
      diagnostics: diagnostics(api),
    }
  })
}
