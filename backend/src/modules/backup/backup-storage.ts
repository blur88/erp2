import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BackupConfig } from './backup.config';
import { BackupStorageUnavailableError } from './backup.types';

export interface StoredObject {
  key: string;
  size: number;
}

/** The only storage operations the Backup module needs. */
export interface BackupStorage {
  /** Size of an object, or null when it does not exist. Other failures are unavailable. */
  head(key: string, signal?: AbortSignal): Promise<{ size: number } | null>;
  put(key: string, body: Readable, size: number, signal?: AbortSignal): Promise<void>;
  /** Streams an object's bytes. The caller consumes the stream. */
  get(key: string, signal?: AbortSignal): Promise<Readable>;
  /** Every object under a prefix, across all pages. */
  listAll(prefix: string, signal?: AbortSignal): Promise<StoredObject[]>;
}

/** The subset of the SDK client this adapter uses. Tests supply an in-memory one. */
export interface S3ClientLike {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<any>;
}

const isNotFound = (error: any): boolean =>
  error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;

/**
 * S3 adapter (#2111). Checksums are only computed when a service requires them,
 * because some S3-compatible servers reject the SDK's default CRC headers.
 */
export class S3BackupStorage implements BackupStorage {
  constructor(
    private readonly client: S3ClientLike,
    private readonly bucket: string,
  ) {}

  static fromConfig(config: BackupConfig['s3']): S3BackupStorage {
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new S3BackupStorage(client, config.bucket);
  }

  async head(key: string, signal?: AbortSignal): Promise<{ size: number } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: signal },
      );
      return { size: Number(result.ContentLength ?? 0) };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw this.unavailable(error);
    }
  }

  async put(key: string, body: Readable, size: number, signal?: AbortSignal): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentLength: size }),
        { abortSignal: signal },
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async get(key: string, signal?: AbortSignal): Promise<Readable> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: signal },
      );
      return result.Body as Readable;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async listAll(prefix: string, signal?: AbortSignal): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
      let page: any;
      try {
        page = await this.client.send(
          new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
          { abortSignal: signal },
        );
      } catch (error) {
        throw this.unavailable(error);
      }
      for (const item of page.Contents ?? []) {
        if (typeof item.Key === 'string') objects.push({ key: item.Key, size: Number(item.Size ?? 0) });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) {
        throw new BackupStorageUnavailableError('storage returned a truncated listing without a token');
      }
    } while (token);
    return objects;
  }

  /** Error text from the SDK is dropped: it can carry endpoints and request details. */
  private unavailable(error: any): BackupStorageUnavailableError {
    return new BackupStorageUnavailableError(`Backup storage request failed (${error?.name ?? 'unknown'})`);
  }
}

/** Reads a whole object as text. Used for manifests only, which are small. */
export async function readText(storage: BackupStorage, key: string, signal?: AbortSignal): Promise<string> {
  const body = await storage.get(key, signal);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
