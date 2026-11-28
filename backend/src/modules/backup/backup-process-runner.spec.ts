import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProcessFailedError, spawnProcessRunner } from './backup-process-runner';

describe('spawnProcessRunner (#2111)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-runner-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes stdout to a 0600 file and resolves on exit status 0', async () => {
    const out = path.join(dir, 'out.bin');
    const controller = new AbortController();
    await spawnProcessRunner.run(
      { command: process.execPath, args: ['-e', "process.stdout.write('hello')"], stdoutPath: out },
      controller.signal,
    );
    expect(fs.readFileSync(out, 'utf8')).toBe('hello');
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
  });

  it('captures stdout when asked and rejects non-zero exits with the exit status', async () => {
    const controller = new AbortController();
    await expect(
      spawnProcessRunner.run(
        { command: process.execPath, args: ['-e', "process.stdout.write('listing')"], captureStdout: true },
        controller.signal,
      ),
    ).resolves.toEqual({ stdout: 'listing' });
    await expect(
      spawnProcessRunner.run(
        { command: process.execPath, args: ['-e', 'process.exit(3)'] },
        controller.signal,
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
  });

  it('kills a running child on abort and does not resolve until it has closed', async () => {
    const pidFile = path.join(dir, 'pid');
    const controller = new AbortController();
    const script = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;

    const run = spawnProcessRunner.run({ command: process.execPath, args: ['-e', script] }, controller.signal);
    await waitFor(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(isAlive(pid)).toBe(true);

    controller.abort(new Error('Timed out after 20 minutes'));
    await expect(run).rejects.toThrow('Timed out after 20 minutes');
    expect(isAlive(pid)).toBe(false);
  });

  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled before start'));
    await expect(
      spawnProcessRunner.run({ command: process.execPath, args: ['-e', ''] }, controller.signal),
    ).rejects.toThrow('cancelled before start');
  });

  it('reports a missing executable as a failed process, not a hang', async () => {
    const controller = new AbortController();
    await expect(
      spawnProcessRunner.run({ command: path.join(dir, 'no-such-binary'), args: [] }, controller.signal),
    ).rejects.toBeInstanceOf(ProcessFailedError);
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error('condition not met');
}
