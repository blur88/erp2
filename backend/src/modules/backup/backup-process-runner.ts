import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

export interface ProcessSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Write stdout to this file, created with mode 0600. */
  stdoutPath?: string;
  /** Return stdout as text. Only for small output such as `tar -tf` listings. */
  captureStdout?: boolean;
}

export interface ProcessResult {
  stdout: string;
}

export interface ProcessRunner {
  /**
   * Runs one child process. Resolves when it exits with status 0. Rejects with
   * ProcessFailedError on a non-zero exit, or with the abort reason once the
   * child has been killed and has closed. Resolving or rejecting therefore
   * always means the child is gone.
   */
  run(spec: ProcessSpec, signal: AbortSignal): Promise<ProcessResult>;
}

export class ProcessFailedError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderrTail: string,
  ) {
    super(`${command} exited with status ${exitCode ?? 'unknown'}`);
    this.name = 'ProcessFailedError';
  }
}

const STDERR_TAIL_BYTES = 4096;

/** Real child processes. Abort sends SIGKILL and waits for the child to close. */
export const spawnProcessRunner: ProcessRunner = {
  async run(spec: ProcessSpec, signal: AbortSignal): Promise<ProcessResult> {
    if (signal.aborted) throw signal.reason ?? new Error('aborted');

    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });

    let captured = '';
    let outputDone: Promise<void>;
    if (spec.stdoutPath) {
      const out = fs.createWriteStream(spec.stdoutPath, { mode: 0o600, flags: 'wx' });
      outputDone = pipeline(child.stdout, out).catch(() => undefined);
    } else if (spec.captureStdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        captured += chunk.toString('utf8');
      });
      outputDone = new Promise((resolve) => child.stdout.once('close', () => resolve()));
    } else {
      child.stdout.resume();
      outputDone = new Promise((resolve) => child.stdout.once('close', () => resolve()));
    }

    const exited = new Promise<{ code: number | null; spawnError?: Error }>((resolve) => {
      child.once('error', (spawnError) => resolve({ code: null, spawnError }));
      child.once('close', (code) => resolve({ code }));
    });

    const onAbort = () => {
      child.kill('SIGKILL');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();

    let outcome: { code: number | null; spawnError?: Error };
    try {
      outcome = await exited;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    await outputDone;

    if (signal.aborted) throw signal.reason ?? new Error('aborted');
    if (outcome.spawnError) throw new ProcessFailedError(spec.command, null, outcome.spawnError.message);
    if (outcome.code !== 0) throw new ProcessFailedError(spec.command, outcome.code, stderr);
    return { stdout: captured };
  },
};
