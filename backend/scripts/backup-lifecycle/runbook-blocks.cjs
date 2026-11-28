#!/usr/bin/env node
// Prints the bash blocks of one runbook section, in order, as one script (#2113).
//
// The Restore drill runs the runbook's own commands, not a copy of them. A section
// starts at its `## ` heading and ends at the next `## ` heading. Every ```bash fence
// inside it is printed. A section with no bash blocks is an error, so a renamed
// heading cannot quietly run nothing.
//
// Usage: node runbook-blocks.cjs <runbook.md> "<## Heading text>"
'use strict';

const fs = require('node:fs');

function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`heading not found: ${heading}`);
  const blocks = [];
  let inBlock = false;
  let current = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inBlock && /^## /.test(line)) break;
    if (!inBlock && line.trim() === '```bash') {
      inBlock = true;
      current = [];
    } else if (inBlock && line.trim() === '```') {
      inBlock = false;
      blocks.push(current.join('\n'));
    } else if (inBlock) {
      current.push(line);
    }
  }
  if (blocks.length === 0) throw new Error(`no bash blocks under: ${heading}`);
  return blocks.join('\n');
}

if (require.main === module) {
  const [file, heading] = process.argv.slice(2);
  if (!file || !heading) {
    process.stderr.write('usage: runbook-blocks.cjs <runbook.md> "<## Heading>"\n');
    process.exit(2);
  }
  try {
    process.stdout.write(`${extractSection(fs.readFileSync(file, 'utf8'), heading)}\n`);
  } catch (error) {
    process.stderr.write(`runbook-blocks: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { extractSection };
