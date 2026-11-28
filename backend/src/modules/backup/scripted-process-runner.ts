import * as fs from 'node:fs';
import { ProcessFailedError, ProcessResult, ProcessRunner, ProcessSpec } from './backup-process-runner';

/**
 * Test double for child processes. Commands succeed by default and write
 * plausible output. Tests override one command at a time with `on`.
 */
export type ScriptedHandler = (spec: ProcessSpec, signal: AbortSignal) => Promise<ProcessResult> | ProcessResult;

export class ScriptedProcessRunner implements ProcessRunner {
  readonly calls: ProcessSpec[] = [];
  private readonly handlers = new Map<string, ScriptedHandler>();
  /** `tar -tf` listing returned by default. */
  listing = 'logos/\nlogos/logo.png\n';

  on(command: string, handler: ScriptedHandler): void {
    this.handlers.set(command, handler);
  }

  fail(command: string, exitCode = 1): void {
    this.on(command, () => {
      throw new ProcessFailedError(command, exitCode, 'scripted failure');
    });
  }

  async run(spec: ProcessSpec, signal: AbortSignal): Promise<ProcessResult> {
    this.calls.push(spec);
    if (signal.aborted) throw signal.reason ?? new Error('aborted');
    const override = this.handlers.get(this.keyFor(spec));
    if (override) return override(spec, signal);
    return this.defaultResult(spec);
  }

  /** `tar -tf` is keyed as tar-list, `tar -cf` with `-C` on uploads as tar-uploads, and so on. */
  keyFor(spec: ProcessSpec): string {
    if (spec.command === 'tar') {
      if (spec.args[0] === '-tf') return 'tar-list';
      if (spec.args.includes('erp_db.dump')) return 'tar-package';
      return 'tar-uploads';
    }
    return spec.command;
  }

  private defaultResult(spec: ProcessSpec): ProcessResult {
    const write = (content: string) => {
      if (spec.stdoutPath) fs.writeFileSync(spec.stdoutPath, content, { mode: 0o600 });
    };
    switch (this.keyFor(spec)) {
      case 'pg_dump':
        write('SCRIPTED-DUMP');
        return { stdout: '' };
      case 'pg_dumpall':
        write('CREATE ROLE erp_app;\n');
        return { stdout: '' };
      case 'tar-uploads':
        write('SCRIPTED-UPLOADS');
        return { stdout: '' };
      case 'tar-package':
        write('SCRIPTED-PLAINTEXT');
        return { stdout: '' };
      case 'tar-list':
        return { stdout: this.listing };
      case 'age': {
        const out = spec.args[spec.args.indexOf('-o') + 1];
        fs.writeFileSync(out, 'SCRIPTED-CIPHERTEXT', { mode: 0o600 });
        return { stdout: '' };
      }
      default:
        return { stdout: '' };
    }
  }
}
