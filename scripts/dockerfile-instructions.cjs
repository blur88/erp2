'use strict';

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

function dockerStages(dockerfile) {
  const stages = [];
  const aliases = new Map();
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
    if (opcode?.toUpperCase() === 'FROM') {
      const [, base, alias] = /^(?:--\S+\s+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/i.exec(args) ?? [];
      if (!base) continue;
      const baseImage = aliases.get(base.toLowerCase()) ?? base;
      if (alias) aliases.set(alias.toLowerCase(), baseImage);
      stages.push({ alias, baseImage, runCommands: [] });
    }
    if (opcode?.toUpperCase() === 'RUN' && stages.length) {
      stages.at(-1).runCommands.push(args.replace(/^(?:--\S+[ \t]+)*/, '').trim());
    }
  }
  // An unclosed heredoc may have hidden a later FROM instruction.
  return heredocs.length ? [] : stages;
}

module.exports = { dockerStages };
