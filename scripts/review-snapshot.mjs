import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// Capture Git's final on-disk state without touching the caller's staging index.
export function snapshot(keyDirectory, round, baseline, ...selectedPaths) {
  if (!keyDirectory || !/^[1-9]\d*$/.test(String(Number(round))) || !baseline) {
    throw Error('Usage: snapshot <key-dir> <round> <baseline> [selected-new-path ...]');
  }
  const key = resolve(keyDirectory);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\n$/, '');
  const root = git('rev-parse', '--show-toplevel');
  const head = git('rev-parse', 'HEAD');
  const storage = [join(root, '.git'), git('rev-parse', '--path-format=absolute', '--git-dir'), git('rev-parse', '--path-format=absolute', '--git-common-dir')];
  const baselineSha = git('rev-parse', '--verify', '--end-of-options', `${baseline}^{commit}`);
  const number = String(Number(round)).padStart(2, '0');
  const reservationText = readFileSync(join(key, `round-${number}.started`), 'utf8');
  const reservedHead = reservationText.trim().startsWith('{')
    ? JSON.parse(reservationText).head
    : reservationText.match(/^head:\s*(\S+)\s*$/m)?.[1];
  if (reservedHead !== head) throw Error('snapshot HEAD differs from reserved head; reserve a new round');
  const patchPath = join(key, `review-round-${number}.patch`);
  const manifestPath = join(key, `review-round-${number}.snapshot.json`);
  if (existsSync(patchPath) || existsSync(manifestPath)) throw Error('snapshot already exists; reserve a new round');

  const within = (parent, child) => {
    const path = relative(parent, child);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
  };
  const paths = selectedPaths.map((path) => {
    const absolute = resolve(root, path);
    if (!within(root, absolute) || storage.some((directory) => within(directory, absolute) || within(absolute, directory)) || within(key, absolute) || within(absolute, key)) {
      throw Error(`selected path must be inside the worktree and exclude Git/review storage: ${path}`);
    }
    return relative(root, absolute);
  });
  const temporary = mkdtempSync(join(tmpdir(), 'review-snapshot-'));
  let createdPatch = false;
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index'), GIT_LITERAL_PATHSPECS: '1' };
    const run = (...args) => execFileSync('git', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    run('read-tree', head);
    run('add', '-u');
    if (paths.length) run('add', '--', ...paths);
    const tree = run('write-tree').toString('utf8').trim();
    const patch = run('diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', baselineSha, '--');
    const newFiles = run('diff', '--cached', '--name-only', '--diff-filter=A', '-z', head, '--').toString('utf8').split('\0').filter(Boolean);
    const changedFiles = run('diff', '--cached', '--name-only', '-z', head, '--').toString('utf8').split('\0').filter(Boolean);
    if (git('rev-parse', 'HEAD') !== head) throw Error('HEAD changed while capturing snapshot; reserve a new round');
    const manifest = {
      round: Number(round), head, baseline: baselineSha, tree,
      selectedPaths: paths, newFiles, changedFiles,
      patchSha256: createHash('sha256').update(patch).digest('hex'),
    };
    // Exclusive writes preserve old evidence and make concurrent publication fail closed.
    writeFileSync(patchPath, patch, { flag: 'wx' });
    createdPatch = true;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log(`${patchPath}\n${manifestPath}`);
  } catch (error) {
    if (createdPatch) rmSync(patchPath);
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
