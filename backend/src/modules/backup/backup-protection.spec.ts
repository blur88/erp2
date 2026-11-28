import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeRpo, readLocalCopy, RPO_BREACH_MINUTES, RPO_WARNING_MINUTES } from './backup-protection';

describe('computeRpo (#2115)', () => {
  // Recovery point 10:15:00.123 UTC, as the attempt started at that instant.
  const recoveryPoint = '20261128T101500123Z';
  const at = (minutes: number, extraMs = 0) =>
    new Date(new Date('2026-11-28T10:15:00.123Z').getTime() + minutes * 60_000 + extraMs);

  it('uses the 45 and 60 minute thresholds', () => {
    expect(RPO_WARNING_MINUTES).toBe(45);
    expect(RPO_BREACH_MINUTES).toBe(60);
  });

  it('is healthy under 45 minutes', () => {
    expect(computeRpo(recoveryPoint, at(0))).toMatchObject({ state: 'healthy', ageMinutes: 0, recoveryPoint });
    expect(computeRpo(recoveryPoint, at(44, 59_999))).toMatchObject({ state: 'healthy', ageMinutes: 44 });
  });

  it('is a warning from 45 up to under 60 minutes', () => {
    expect(computeRpo(recoveryPoint, at(45))).toMatchObject({ state: 'warning', ageMinutes: 45 });
    expect(computeRpo(recoveryPoint, at(59, 59_999))).toMatchObject({ state: 'warning', ageMinutes: 59 });
  });

  it('is an RPO breach from 60 minutes', () => {
    expect(computeRpo(recoveryPoint, at(60))).toMatchObject({ state: 'breach', ageMinutes: 60 });
    expect(computeRpo(recoveryPoint, at(600))).toMatchObject({ state: 'breach', ageMinutes: 600 });
  });

  it('is unknown when there is no Verified Backup, with no age', () => {
    expect(computeRpo(null, at(0))).toEqual({ state: 'unknown', ageMinutes: null, recoveryPoint: null });
  });

  it('is unknown when the recovery point lies in the future (the clock went back)', () => {
    expect(computeRpo(recoveryPoint, at(-1))).toEqual({ state: 'unknown', ageMinutes: null, recoveryPoint });
  });
});

describe('readLocalCopy (#2115)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-copy-status-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const complete = (name: string) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, 'backup.tar.age'), 'ciphertext');
  };

  it('reports the newest local copy that holds an archive', async () => {
    complete('20261128T090000000Z');
    complete('20261128T101500123Z');
    fs.mkdirSync(path.join(root, '20261128T110000000Z'));
    fs.mkdirSync(path.join(root, '.tmp', '20261128T120000000Z'), { recursive: true });
    await expect(readLocalCopy(root)).resolves.toEqual({ state: 'present', recoveryPoint: '20261128T101500123Z' });
  });

  it('is absent when the directory holds no complete local copy', async () => {
    fs.mkdirSync(path.join(root, '.tmp'));
    await expect(readLocalCopy(root)).resolves.toEqual({ state: 'absent', recoveryPoint: null });
  });

  it('is absent when the directory does not exist yet', async () => {
    await expect(readLocalCopy(path.join(root, 'missing'))).resolves.toEqual({ state: 'absent', recoveryPoint: null });
  });

  it('is unavailable when the directory cannot be read, never absent', async () => {
    const notADirectory = path.join(root, 'file');
    fs.writeFileSync(notADirectory, 'x');
    await expect(readLocalCopy(notADirectory)).resolves.toEqual({ state: 'unavailable', recoveryPoint: null });
  });
});
