// #2018: every explicit local COPY/ADD source in the backend, frontend and NGINX
// Dockerfiles must be tracked in Git and kept by the build context's
// .dockerignore. The checker and its coverage limits are documented in
// fixtures/dockerfile-sources.js. No Docker: fixture repositories are built in a
// temporary directory with real `git add`, so .gitignore behaves as in a checkout.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const {
  parseInstructions, parseCopyOperands, parseDockerignore, dockerignoreMatch, checkDockerfile, formatProblem,
} = require('./fixtures/dockerfile-sources');

const repo = path.resolve(__dirname, '../..');

// Build contexts the repository ships. Compose and the release workflow are
// checked against this table below, so a new image or a moved context fails
// there instead of silently escaping the check.
const IMAGES = [
  { dockerfile: 'backend/Dockerfile', context: 'backend' },
  { dockerfile: 'frontend/Dockerfile', context: 'frontend' },
  { dockerfile: 'nginx/Dockerfile', context: 'nginx' },
];

// Broad copies the static check cannot verify file by file (see the coverage
// limits). Pinned so a new one is a conscious decision, not an unnoticed gap.
const KNOWN_BROAD_COPIES = ['backend/Dockerfile: .', 'frontend/Dockerfile: .'];

function sh(cwd, command, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr}`);
}

// files: { 'nginx/Dockerfile': '...' }. `add` is what `git add` receives (a
// plain add honours .gitignore, exactly like a developer's `git add .`);
// `force` is added with -f.
function fixtureRepo(t, files, { add = ['.'], force = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dockerfile-sources-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  sh(root, 'git', ['init', '-q']);
  sh(root, 'git', ['add', '--', ...add]);
  if (force.length) sh(root, 'git', ['add', '-f', '--', ...force]);
  return root;
}

const check = (root, dockerfile = 'nginx/Dockerfile', context) => checkDockerfile({ repoRoot: root, dockerfile, context });
const messages = result => result.problems.map(formatProblem);

describe('Dockerfile parsing', () => {
  test('joins continuations, skips comments inside them and keeps every source', () => {
    const [copy] = parseInstructions([
      'FROM scratch',
      'COPY a.conf b.conf \\',
      '    # a comment in the middle of a continuation',
      '    c.conf /etc/nginx/',
    ].join('\n')).filter(i => i.keyword === 'COPY');
    assert.equal(copy.line, 2);
    assert.deepEqual(parseCopyOperands(copy.rest).words, ['a.conf', 'b.conf', 'c.conf', '/etc/nginx/']);
  });

  test('reads --chown, --chmod and --from as flags, not sources', () => {
    const { flags, words } = parseCopyOperands('--from=builder --chown=nestjs:nodejs --chmod=755 /app/dist ./dist');
    assert.deepEqual(flags, { from: 'builder', chown: 'nestjs:nodejs', chmod: '755' });
    assert.deepEqual(words, ['/app/dist', './dist']);
  });

  test('reads the JSON array form, including a source with a space', () => {
    assert.deepEqual(parseCopyOperands('["my file.txt", "b.txt", "/dest/"]').words, ['my file.txt', 'b.txt', '/dest/']);
    assert.match(parseCopyOperands('["a.txt", ').error, /JSON/);
  });

  test('keeps a quoted shell-form source together', () => {
    assert.deepEqual(parseCopyOperands('"my file.txt" /dest/').words, ['my file.txt', '/dest/']);
  });

  test('does not read heredoc bodies as instructions', () => {
    const instructions = parseInstructions([
      'FROM scratch',
      'RUN <<EOF',
      'COPY not-an-instruction.txt /x',
      'EOF',
      'COPY real.txt /y',
    ].join('\n'));
    assert.deepEqual(instructions.map(i => i.keyword), ['FROM', 'RUN', 'COPY']);
    assert.equal(instructions[2].rest, 'real.txt /y');
  });

  test('honours an escape parser directive', () => {
    const [copy] = parseInstructions('# escape=`\nCOPY a.txt `\n  /dest/').filter(i => i.keyword === 'COPY');
    assert.deepEqual(parseCopyOperands(copy.rest).words, ['a.txt', '/dest/']);
  });
});

describe('.dockerignore matching', () => {
  const excludedBy = (ignore, file) => dockerignoreMatch(parseDockerignore(ignore), file)?.text ?? null;

  test('anchors patterns at the context root, as Docker does', () => {
    assert.equal(excludedBy('*.pem', 'a.pem'), '*.pem');
    assert.equal(excludedBy('*.pem', 'certs/a.pem'), null, '`*.pem` does not reach subdirectories');
    assert.equal(excludedBy('**/*.pem', 'certs/a.pem'), '**/*.pem');
    assert.equal(excludedBy('**/*.pem', 'a.pem'), '**/*.pem');
  });

  test('a matching directory excludes everything beneath it', () => {
    assert.equal(excludedBy('secrets', 'secrets/deep/key'), 'secrets');
  });

  test('a later ! pattern re-includes, an earlier one does not', () => {
    assert.equal(excludedBy('*.md\n!package.json', 'package.json'), null);
    assert.equal(excludedBy('*.md\n!README.md', 'README.md'), null);
    assert.equal(excludedBy('!README.md\n*.md', 'README.md'), '*.md');
  });

  test('ignores comments and blank lines', () => {
    assert.equal(excludedBy('# *.pem\n\n', 'a.pem'), null);
  });
});

describe('local COPY sources must be tracked', () => {
  test('regression #1975: an ignored .pem named by an explicit COPY fails, naming Dockerfile, source and reason', t => {
    const root = fixtureRepo(t, {
      '.gitignore': '*.pem\n',
      'nginx/Dockerfile': 'FROM scratch\nCOPY dhparam-ffdhe2048.pem /etc/nginx/\n',
      'nginx/dhparam-ffdhe2048.pem': 'dh params',
    });
    const result = check(root);
    assert.equal(result.problems.length, 1);
    const [problem] = result.problems;
    assert.equal(problem.dockerfile, 'nginx/Dockerfile');
    assert.equal(problem.source, 'dhparam-ffdhe2048.pem');
    assert.equal(problem.line, 2);
    assert.match(problem.reason, /^is not tracked in Git: /);
    assert.match(problem.reason, /ignored by \.gitignore:1 `\*\.pem`/);
    assert.match(problem.reason, /nginx\/dhparam-ffdhe2048\.pem/);
    assert.match(formatProblem(problem), /^nginx\/Dockerfile:2: local COPY\/ADD source "dhparam-ffdhe2048\.pem" /);
  });

  test('the same file passes once it is tracked (git add -f)', t => {
    const root = fixtureRepo(t, {
      '.gitignore': '*.pem\n',
      'nginx/Dockerfile': 'FROM scratch\nCOPY dhparam-ffdhe2048.pem /etc/nginx/\n',
      'nginx/dhparam-ffdhe2048.pem': 'dh params',
    }, { force: ['nginx/dhparam-ffdhe2048.pem'] });
    assert.deepEqual(messages(check(root)), []);
  });

  test('a file that exists but was never added fails with an add-it reason', t => {
    const root = fixtureRepo(t, {
      'nginx/Dockerfile': 'FROM scratch\nCOPY new.conf /etc/nginx/\n',
      'nginx/new.conf': 'x',
    }, { add: ['nginx/Dockerfile'] });
    const [problem] = check(root).problems;
    assert.equal(problem.source, 'new.conf');
    assert.match(problem.reason, /^is not tracked in Git: nginx\/new\.conf exists in the working tree but was never added to Git/);
    assert.doesNotMatch(problem.reason, /ignored by/);
  });

  test('a file that does not exist fails', t => {
    const root = fixtureRepo(t, { 'nginx/Dockerfile': 'FROM scratch\nCOPY missing.conf /etc/nginx/\n' });
    assert.match(check(root).problems[0].reason, /it does not exist in the build context/);
  });

  test('every source of a multi-source COPY is checked, across a continuation and with flags', t => {
    const root = fixtureRepo(t, {
      '.gitignore': '*.pem\n',
      'nginx/Dockerfile': 'FROM scratch\nCOPY --chown=1:1 --chmod=644 a.conf \\\n    b.pem \\\n    c.conf /etc/nginx/\n',
      'nginx/a.conf': '', 'nginx/b.pem': '', 'nginx/c.conf': '',
    });
    const result = check(root);
    assert.deepEqual(result.problems.map(p => p.source), ['b.pem']);
    assert.deepEqual(result.checked.map(c => c.source), ['a.conf', 'c.conf']);
  });

  test('JSON array COPY is checked, ADD is checked, and a leading slash is relative to the context', t => {
    const root = fixtureRepo(t, {
      '.gitignore': '*.pem\n',
      'nginx/Dockerfile': 'FROM scratch\nCOPY ["ok.conf", "x.pem", "/etc/nginx/"]\nADD /abs.conf /etc/\n',
      'nginx/ok.conf': '', 'nginx/x.pem': '', 'nginx/abs.conf': '',
    });
    const result = check(root);
    assert.deepEqual(result.problems.map(p => p.source), ['x.pem']);
    assert.deepEqual(result.checked.map(c => c.files[0]), ['ok.conf', 'abs.conf']);
  });

  test('tracked files are found relative to the build context, not the repository root', t => {
    const root = fixtureRepo(t, {
      'app.conf': 'at the repo root only',
      'img/Dockerfile': 'FROM scratch\nCOPY app.conf /etc/\n',
    });
    assert.match(check(root, 'img/Dockerfile').problems[0].reason, /it does not exist in the build context/);
  });

  test('a source that climbs out of the context, or uses a variable, is reported rather than skipped', t => {
    const root = fixtureRepo(t, {
      'nginx/Dockerfile': 'FROM scratch\nARG F=a.conf\nCOPY ../outside.conf /x/\nCOPY $F /y/\n',
      'outside.conf': '', 'nginx/a.conf': '',
    });
    const reasons = check(root).problems.map(p => `${p.source}: ${p.reason}`);
    assert.equal(reasons.length, 2);
    assert.match(reasons[0], /^\.\.\/outside\.conf: points outside the build context/);
    assert.match(reasons[1], /^\$F: contains a variable/);
  });
});

describe('wildcard sources', () => {
  const dockerfile = 'FROM scratch\nCOPY package*.json ./\n';

  test('expand against tracked files', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': dockerfile, 'app/package.json': '{}', 'app/package-lock.json': '{}', 'app/package-notes.txt': '',
    });
    const result = check(root, 'app/Dockerfile');
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.checked[0].files.sort(), ['package-lock.json', 'package.json']);
  });

  test('fail when nothing tracked matches, and say when the only match is ignored', t => {
    const root = fixtureRepo(t, {
      '.gitignore': 'package*.json\n', 'app/Dockerfile': dockerfile, 'app/package.json': '{}',
    });
    const [problem] = check(root, 'app/Dockerfile').problems;
    assert.match(problem.reason, /^matches no tracked file: app\/package\.json exists in the working tree but is ignored by/);
    assert.match(problem.reason, /ignored by \.gitignore:1 `package\*\.json`/);
  });

  test('fail when every tracked match is excluded by the .dockerignore', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': dockerfile, 'app/package.json': '{}', 'app/.dockerignore': 'package*.json\n',
    });
    assert.match(check(root, 'app/Dockerfile').problems[0].reason, /matches only tracked files that are excluded .*app\/\.dockerignore:1 `package\*\.json`/);
  });

  test('pass when the .dockerignore re-includes the match', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': dockerfile, 'app/package.json': '{}', 'app/.dockerignore': '*.json\n!package.json\n',
    });
    assert.deepEqual(check(root, 'app/Dockerfile').problems, []);
  });
});

describe('.dockerignore exclusion of explicit sources', () => {
  test('a tracked source that the context ignores fails, naming the file and the pattern', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': 'FROM scratch\nCOPY server.pem /etc/\n',
      'app/server.pem': '',
      'app/.dockerignore': '# keep keys out\n*.pem\n',
    }, { force: ['app/server.pem'] });
    const [problem] = check(root, 'app/Dockerfile').problems;
    assert.equal(problem.source, 'server.pem');
    assert.match(problem.reason, /excluded from the build context by app\/\.dockerignore:2 `\*\.pem`/);
  });

  test('prefers <Dockerfile>.dockerignore over .dockerignore', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': 'FROM scratch\nCOPY a.conf /etc/\n',
      'app/a.conf': '',
      'app/.dockerignore': 'a.conf\n',
      'app/Dockerfile.dockerignore': '# nothing excluded\n',
    });
    assert.deepEqual(check(root, 'app/Dockerfile').problems, []);
  });

  test('a build with no .dockerignore (nginx/) excludes nothing', t => {
    const root = fixtureRepo(t, { 'nginx/Dockerfile': 'FROM scratch\nCOPY a.conf /etc/\n', 'nginx/a.conf': '' });
    assert.deepEqual(check(root).problems, []);
  });
});

describe('inputs that are not build-context files', () => {
  test('COPY --from=<stage or image>, remote ADD and heredoc COPY pass without any local file', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': [
        'FROM node AS builder',
        'FROM scratch',
        'COPY --from=builder --chown=1:1 /app/dist ./dist',
        'COPY --from=0 /app/package.json ./package.json',
        'COPY --from=alpine:3.23 /etc/os-release /os-release',
        'ADD https://example.com/tool.tar.gz /opt/',
        'COPY <<EOF /etc/hello',
        'hello',
        'EOF',
      ].join('\n'),
    });
    const result = check(root, 'app/Dockerfile');
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.checked, []);
  });

  test('a stage copy is not mistaken for a local one when a same-named local file is ignored', t => {
    const root = fixtureRepo(t, {
      '.gitignore': 'dist\n',
      'app/Dockerfile': 'FROM node AS builder\nFROM scratch\nCOPY --from=builder /app/dist ./dist\n',
      'app/dist': 'ignored artefact',
    });
    assert.deepEqual(check(root, 'app/Dockerfile').problems, []);
  });
});

describe('broad copies (coverage limit)', () => {
  test('COPY . . and directory sources are reported as broad, not verified file by file', t => {
    const root = fixtureRepo(t, {
      '.gitignore': '*.pem\n',
      'app/Dockerfile': 'FROM scratch\nCOPY . .\nCOPY src ./src\n',
      'app/src/main.ts': '', 'app/src/leak.pem': '',
    });
    const result = check(root, 'app/Dockerfile');
    assert.deepEqual(result.problems, [], 'an ignored file under a broad copy is the documented blind spot');
    assert.deepEqual(result.broad.map(b => b.directory), ['.', 'src']);
  });

  test('a broad copy of a context with nothing tracked still fails', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': 'FROM scratch\nCOPY src ./src\n',
      'app/src/main.ts': '',
    }, { add: ['app/Dockerfile'] });
    assert.match(check(root, 'app/Dockerfile').problems[0].reason, /not tracked in Git/);
  });

  test('COPY . . fails when the .dockerignore leaves nothing', t => {
    const root = fixtureRepo(t, {
      'app/Dockerfile': 'FROM scratch\nCOPY . .\n', 'app/.dockerignore': '*\n',
    });
    assert.match(check(root, 'app/Dockerfile').problems[0].reason, /holds no tracked file that the \.dockerignore keeps/);
  });
});

describe('this repository', () => {
  const results = IMAGES.map(image => check(repo, image.dockerfile, image.context));

  test('every explicit local COPY source in the backend, frontend and NGINX Dockerfiles is tracked and kept', () => {
    assert.deepEqual(results.flatMap(messages), []);
  });

  test('actually inspects sources (guards against a parser that finds nothing)', () => {
    const nginx = results[2];
    assert.ok(nginx.checked.length >= 10, `expected the NGINX COPY sources, found ${nginx.checked.length}`);
    const sources = nginx.checked.map(c => c.source);
    assert.ok(sources.includes('tls-intermediate.conf'));
    assert.ok(sources.includes('production-templates/servers.conf.template'));
    assert.ok(results[0].checked.some(c => c.files.includes('package-lock.json')), 'backend package*.json must expand');
  });

  test('the broad copies are exactly the known ones', () => {
    const broad = results.flatMap(r => r.broad.map(b => `${b.dockerfile}: ${b.directory}`));
    assert.deepEqual(broad, KNOWN_BROAD_COPIES,
      'a new broad copy is not verified file by file; review the coverage limits in fixtures/dockerfile-sources.js, then update KNOWN_BROAD_COPIES');
  });

  test('every tracked Dockerfile is covered by IMAGES', () => {
    const listed = spawnSync('git', ['ls-files', '-z', '--', '*Dockerfile*'], { cwd: repo, encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    const tracked = listed.stdout.split('\0').filter(f => /(^|\/)Dockerfile(\.[^/]*)?$/.test(f));
    assert.deepEqual(tracked.sort(), IMAGES.map(i => i.dockerfile).sort(),
      'add the new Dockerfile and its build context to IMAGES');
  });

  test('Compose and the release workflow build each image from the context assumed here', () => {
    const expected = new Set(IMAGES.map(i => `${i.context}|${i.dockerfile}`));
    const composeFiles = fs.readdirSync(repo).filter(f => /^docker-compose.*\.ya?ml$/.test(f));
    assert.ok(composeFiles.includes('docker-compose.yml'));
    const builds = [];
    for (const file of composeFiles) {
      const doc = YAML.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
      for (const [name, service] of Object.entries(doc.services || {})) {
        if (!service.build) continue;
        const build = typeof service.build === 'string' ? { context: service.build } : service.build;
        const context = path.posix.normalize(build.context);
        builds.push({ where: `${file} service ${name}`, key: `${context}|${path.posix.join(context, build.dockerfile || 'Dockerfile')}` });
      }
    }
    const workflow = YAML.parse(fs.readFileSync(path.join(repo, '.github/workflows/release.yml'), 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
      for (const step of job.steps || []) {
        if (!String(step.uses || '').startsWith('docker/build-push-action')) continue;
        const context = path.posix.normalize(step.with.context);
        builds.push({ where: `release.yml ${jobName}: ${step.name}`, key: `${context}|${path.posix.join(context, step.with.file ? path.posix.relative(context, step.with.file) : 'Dockerfile')}` });
      }
    }
    assert.ok(builds.length >= 6, `expected three Compose and three release builds, found ${builds.length}`);
    for (const { where, key } of builds) assert.ok(expected.has(key), `${where} builds ${key}, which IMAGES does not describe`);
  });
});
