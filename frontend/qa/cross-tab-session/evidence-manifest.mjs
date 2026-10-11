#!/usr/bin/env node
// The manifest of the evidence the stall runs (#1370) keep outside the
// repository. The files stay on the QA host; the manifest is committed, so a
// reference in the record stays checkable wherever the files are.
//
//   node evidence-manifest.mjs <evidence-root> <out-file>
//   node evidence-manifest.mjs <evidence-root> --verify <manifest>
//
// One line per file, sorted: <cell>\t<path relative to the root>\t<bytes>\t<sha256>.
// The cell is the first directory of the path (`calibration` for calibration).
//
// It refuses to write a manifest (exit 3, files named) if any file holds a
// token: a JSON `accessToken` or `refreshToken` with a string value, or a
// JWT-shaped string. The evidence is meant to hold fingerprints, generations,
// session ids and times and nothing else. `--verify` exits 1 on any file whose
// size or hash differs from the manifest's, or that is missing.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKEN_KEY = /"(accessToken|refreshToken)"\s*:\s*"[^"]+"/g
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g

/** What in `text` looks like a token: one entry per find, naming its kind and never its value. */
export function findTokens(text) {
  const found = []
  for (const match of text.matchAll(TOKEN_KEY)) found.push(`a ${match[1]} value`)
  for (const _ of text.matchAll(JWT)) found.push('a JWT-shaped string')
  return found
}

function filesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) out.push(path)
    }
  }
  walk(root)
  return out.sort()
}

function lineFor(root, path) {
  const bytes = readFileSync(path)
  const rel = relative(root, path).split(sep).join('/')
  return {
    rel,
    tokens: findTokens(bytes.toString('utf8')),
    line: `${rel.split('/')[0]}\t${rel}\t${statSync(path).size}\t${createHash('sha256').update(bytes).digest('hex')}`,
  }
}

function main(args) {
  const [root, second, third] = args
  if (!root || !second || (second === '--verify' && !third)) {
    console.error('usage: evidence-manifest.mjs <evidence-root> <out-file>\n       evidence-manifest.mjs <evidence-root> --verify <manifest>')
    return 2
  }
  if (second === '--verify') {
    let differing = 0
    for (const expected of readFileSync(third, 'utf8').split('\n').filter(Boolean)) {
      const rel = expected.split('\t')[1]
      let actual = null
      try {
        actual = lineFor(root, join(root, rel)).line
      } catch {
        actual = null
      }
      if (actual !== expected) {
        differing += 1
        console.error(`${actual === null ? 'missing' : 'differs'}: ${rel}`)
      }
    }
    if (differing === 0) console.log('every file matches the manifest')
    return differing === 0 ? 0 : 1
  }
  const entries = filesUnder(root).map((path) => lineFor(root, path))
  const withTokens = entries.filter((entry) => entry.tokens.length > 0)
  if (withTokens.length > 0) {
    for (const entry of withTokens) console.error(`holds a token, no manifest written: ${entry.rel} (${entry.tokens.length} found, first: ${entry.tokens[0]})`)
    return 3
  }
  writeFileSync(second, entries.map((entry) => `${entry.line}\n`).join(''))
  console.log(`${entries.length} files listed in ${second}`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
