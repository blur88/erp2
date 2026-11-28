#!/usr/bin/env node
/**
 * Storage helper for the Backup lifecycle CI job (#2111). It runs inside the
 * production backend image, which already ships @aws-sdk/client-s3, so the
 * job needs no AWS CLI and no extra image. Credentials come from the
 * environment, and only object names and sizes are printed.
 *
 * Commands:
 *   create-bucket                       versioned bucket with Object Lock and 14-day COMPLIANCE default
 *   list <prefix>                       JSON array of {key, size}
 *   head <key>                          JSON {size}; exit 3 when the object is missing
 *   get <key> [destFile]                object bytes to stdout, or written to destFile (no pipe)
 *   put <key> <srcFile>                 uploads a local file (used to seed a controlled expired Backup, #2114)
 *   watch-kill <archiveKey> <manifestKey>
 *                                       SIGKILLs the application once the archive is visible and the
 *                                       manifest is not: an interrupted publish (exit 0), or exit 2 when
 *                                       the manifest appeared first, or exit 1 on timeout
 */
const fs = require('node:fs');
const { S3Client, CreateBucketCommand, PutBucketVersioningCommand, PutObjectLockConfigurationCommand,
  ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const { pipeline } = require('node:stream/promises');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function head(key) {
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(result.ContentLength) };
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') return null;
    throw error;
  }
}

function findApplicationPid() {
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      if (fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8').includes('dist/main')) return Number(entry);
    } catch {
      // The process exited while it was being read.
    }
  }
  throw new Error('application process not found');
}

async function watchKill(archiveKey, manifestKey) {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (await head(manifestKey)) return 2;
    if (await head(archiveKey)) {
      const pid = findApplicationPid();
      process.kill(pid, 'SIGKILL');
      console.log(`killed ${pid}`);
      return 0;
    }
    await sleep(20);
  }
  return 1;
}

async function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case 'create-bucket': {
      // Idempotent: an existing bucket we own counts as created, so this doubles as a readiness probe.
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
      } catch (error) {
        if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') throw error;
      }
      await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
      await client.send(new PutObjectLockConfigurationCommand({
        Bucket: bucket,
        ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 14 } } },
      }));
      return 0;
    }
    case 'list': {
      const objects = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: args[0], ContinuationToken: token }));
        for (const item of page.Contents ?? []) objects.push({ key: item.Key, size: Number(item.Size) });
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      process.stdout.write(JSON.stringify(objects));
      return 0;
    }
    case 'head': {
      const found = await head(args[0]);
      if (!found) return 3;
      process.stdout.write(JSON.stringify(found));
      return 0;
    }
    case 'put': {
      if (!args[0] || !args[1]) return 64;
      const { size } = fs.statSync(args[1]);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: args[0],
        Body: fs.createReadStream(args[1]),
        ContentLength: size,
      }));
      return 0;
    }
    case 'get': {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: args[0] }));
      if (args[1]) {
        await pipeline(result.Body, fs.createWriteStream(args[1], { mode: 0o600 }));
        return 0;
      }
      for await (const chunk of result.Body) process.stdout.write(chunk);
      return 0;
    }
    case 'watch-kill':
      return watchKill(args[0], args[1]);
    default:
      process.stderr.write(`unknown command: ${command}\n`);
      return 64;
  }
}

// exitCode, not process.exit(): exit() can truncate large piped stdout (object bytes).
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`s3-helper failed: ${error.name}\n`);
    process.exitCode = 1;
  },
);
