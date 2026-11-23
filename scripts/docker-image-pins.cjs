'use strict';

// Resolve Dockerfile stage aliases and Docker Hub image references (#2039).
function dockerStageImages(dockerfile) {
  const aliases = new Map();
  const pattern = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/gim;
  return [...dockerfile.matchAll(pattern)].map(([, base, alias]) => {
    const image = aliases.get(base.toLowerCase()) ?? base;
    if (alias) aliases.set(alias.toLowerCase(), image);
    return image;
  });
}

function heredocDelimiters(instruction) {
  if (!/^(?:ONBUILD[ \t]+)?(?:ADD|COPY|RUN)[ \t]+/i.test(instruction)) return [];

  // Tokenize quoted words so a string containing << does not start a heredoc.
  const words = instruction.match(/(?:[^\s'"\\]+|\\.|'[^']*'|"(?:[^"\\]|\\.)*")+/g) ?? [];
  return words.flatMap((word) => {
    const match = /^\d*<<(-?)([^<]+)$/.exec(word);
    if (!match) return [];
    const [, stripTabs, delimiter] = match;
    const name = delimiter.replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"|\\(.)/g, (_, single, double, escaped) =>
      single ?? double?.replace(/\\(["\\$`])/g, '$1') ?? escaped,
    );
    return [{ name, stripTabs: stripTabs === '-' }];
  });
}

function finalStageRunCommands(dockerfile) {
  let commands = null;
  let instruction = '';
  let heredocs = [];
  const source = dockerfile.replace(/^\uFEFF/, '');
  const [directives] = /^(?:[ \t]*#[ \t]*(?:syntax|check|escape)[ \t]*=[^\r\n]*\r?\n)*/i.exec(source);
  const useBacktick = /^[ \t]*#[ \t]*escape[ \t]*=[ \t]*`[ \t]*\r?$/im.test(directives);
  const continuation = useBacktick ? /(?<!`)`[ \t]*$/ : /(?<!\\)\\[ \t]*$/;
  for (const line of source.split(/\r?\n/)) {
    if (heredocs.length) {
      const { name, stripTabs } = heredocs[0];
      if ((stripTabs ? line.replace(/^\t+/, '') : line) === name) heredocs.shift();
      continue;
    }
    if (/^\s*(?:#|$)/.test(line)) continue;
    const segment = line.replace(continuation, '');
    instruction += segment;
    if (segment !== line) continue;

    if (instruction.includes('<<')) heredocs = heredocDelimiters(instruction.trimStart());
    const [, opcode, args] = /^\s*(FROM|RUN)[ \t]+(.*)$/i.exec(instruction) ?? [];
    instruction = '';
    if (opcode?.toUpperCase() === 'FROM') commands = [];
    if (opcode?.toUpperCase() === 'RUN') {
      commands?.push(args.replace(/^(?:--\S+[ \t]+)*/, '').trim());
    }
  }
  // An unclosed heredoc may have hidden a later FROM instruction.
  return heredocs.length ? [] : commands ?? [];
}

function officialImagePin(image) {
  const pattern = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?(\w+):([\w.-]+)(?:@(sha256:[a-f0-9]{64}))?$/;
  const match = pattern.exec(image ?? '');
  if (!match) return;
  const [, repository, tag, pinnedDigest] = match;
  return { repository, tag, pinnedDigest };
}

module.exports = { dockerStageImages, finalStageRunCommands, officialImagePin };
