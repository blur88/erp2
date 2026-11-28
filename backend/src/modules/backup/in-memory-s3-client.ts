import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3ClientLike } from './backup-storage';

/** Test double for the S3 client: it receives the real SDK command objects. */
export type InMemoryOperation = 'put' | 'get' | 'head' | 'list';

export class InMemoryS3Client implements S3ClientLike {
  readonly objects = new Map<string, Buffer>();
  /** Every successful put, in order, to assert manifest-last publishing. */
  readonly putOrder: string[] = [];
  /** Page size for ListObjectsV2, to exercise pagination. */
  pageSize = 1000;
  /** Return different bytes from GetObject, to simulate a corrupted read-back. */
  corruptReads = false;
  /**
   * Called before each operation. Throwing simulates a storage failure; a
   * promise that never settles simulates a hung request, which the abort signal
   * then cuts short, as the SDK does.
   */
  hook: ((operation: InMemoryOperation, key: string) => void | Promise<void>) | null = null;

  async send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<any> {
    const signal = options?.abortSignal;
    if (command instanceof PutObjectCommand) {
      const key = String(command.input.Key);
      await this.beforeOperation('put', key, signal);
      const bytes = await collect(command.input.Body as Readable);
      if (bytes.length !== command.input.ContentLength) throw new Error('content length mismatch');
      this.objects.set(key, bytes);
      this.putOrder.push(key);
      return {};
    }
    if (command instanceof HeadObjectCommand) {
      const key = String(command.input.Key);
      await this.beforeOperation('head', key, signal);
      const bytes = this.objects.get(key);
      if (!bytes) throw notFound();
      return { ContentLength: bytes.length };
    }
    if (command instanceof GetObjectCommand) {
      const key = String(command.input.Key);
      await this.beforeOperation('get', key, signal);
      const bytes = this.objects.get(key);
      if (!bytes) throw notFound();
      const served = this.corruptReads ? Buffer.concat([bytes, Buffer.from('x')]) : bytes;
      return { Body: Readable.from([served]) };
    }
    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? '';
      await this.beforeOperation('list', prefix, signal);
      const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = command.input.ContinuationToken ? Number(command.input.ContinuationToken) : 0;
      const page = keys.slice(start, start + this.pageSize);
      const next = start + this.pageSize;
      const truncated = next < keys.length;
      return {
        Contents: page.map((key) => ({ Key: key, Size: this.objects.get(key)!.length })),
        IsTruncated: truncated,
        NextContinuationToken: truncated ? String(next) : undefined,
      };
    }
    throw new Error(`unsupported command ${(command as object)?.constructor?.name}`);
  }

  private async beforeOperation(operation: InMemoryOperation, key: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    if (!this.hook) return;
    const aborted = new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
    });
    aborted.catch(() => undefined);
    await Promise.race([Promise.resolve(this.hook(operation, key)), aborted]);
  }
}

async function collect(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function notFound(): Error {
  const error = new Error('NotFound') as Error & { name: string; $metadata: { httpStatusCode: number } };
  error.name = 'NotFound';
  error.$metadata = { httpStatusCode: 404 };
  return error;
}
