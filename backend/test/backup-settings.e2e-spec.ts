import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { BackupSettings } from '../src/database/entities/backup-settings.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { E2E_ADMIN_PASSWORD, SHARED_E2E_NS, removeSuiteAdmin, seedSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * Backup settings routes (#2112), end to end against the migrated singleton.
 *
 * Only a real database shows the migration's seeded row, the singleton CHECK,
 * the pessimistic lock on update, and the audit row written next to the update.
 * Scheduling itself is off under NODE_ENV=test (createScheduleOptions), so the
 * timer behaviour is covered by backup-schedule.service.spec.ts instead.
 *
 * Shared-DB discipline (#1197): the singleton is changed, so its original values
 * are restored in afterAll. Audit rows are scoped to the suite's own admin.
 */
describe('Backup settings routes (e2e, #2112)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const runId = Date.now().toString(36);
  const adminUsername = `${SHARED_E2E_NS}_backup_admin_${runId}`;
  const staffUsername = `${SHARED_E2E_NS}_backup_staff_${runId}`;

  let adminId = '';
  let adminToken = '';
  let staffToken = '';
  let original: Record<string, unknown> = {};

  const defaults = {
    intervalMinutes: 30,
    retentionWindowHours: 24,
    retentionDailyCount: 7,
    retentionWeeklyCount: 4,
    retentionMonthlyCount: 12,
  };

  const login = async (username: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: E2E_ADMIN_PASSWORD });
    return res.body?.data?.accessToken ?? res.body?.accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminId = admin.id;
    adminToken = await login(adminUsername);

    await ds.query(`DELETE FROM users WHERE username = $1`, [staffUsername]);
    const users = ds.getRepository(User);
    await users.save(
      users.create({
        username: staffUsername,
        email: `${staffUsername}@test.example`,
        password: await bcrypt.hash(E2E_ADMIN_PASSWORD, 12),
        firstName: 'E2E',
        lastName: 'Staff',
        role: UserRole.SALES_STAFF,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );
    staffToken = await login(staffUsername);

    const row = await ds.getRepository(BackupSettings).findOneByOrFail({ id: true });
    original = { ...defaults, ...pick(row) };
  });

  afterAll(async () => {
    if (ds && original) {
      await ds.getRepository(BackupSettings).save({ id: true, ...(original as object) });
    }
    if (ds) {
      await removeSuiteTraces(ds, { userIds: [adminId], usernames: [adminUsername, staffUsername] });
      await removeSuiteAdmin(ds, adminUsername);
      await ds.query(`DELETE FROM users WHERE username = $1`, [staffUsername]);
    }
    await app?.close();
  });

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const put = (path: string, token: string, body: unknown) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(body as object);

  it('is admin-only', async () => {
    await get('/backups/settings', staffToken).expect(403);
    await put('/backups/settings', staffToken, defaults).expect(403);
    await request(app.getHttpServer()).get('/backups/settings').expect(401);
  });

  it('returns the stored settings, which the migration seeded with the spec defaults', async () => {
    const res = await get('/backups/settings', adminToken).expect(200);
    expect(res.body).toMatchObject({ state: 'valid', settings: original });
  });

  it('rejects an invalid update with 400, names the field, and keeps the stored row', async () => {
    const before = await get('/backups/settings', adminToken).expect(200);
    const res = await put('/backups/settings', adminToken, { ...defaults, intervalMinutes: 20 }).expect(400);

    expect(JSON.stringify(res.body)).toContain('intervalMinutes');
    const after = await get('/backups/settings', adminToken).expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('saves a valid update, shows it on read, and audits old and new values', async () => {
    const next = { ...defaults, intervalMinutes: 15, retentionMonthlyCount: 6 };
    const res = await put('/backups/settings', adminToken, next).expect(200);
    expect(res.body).toEqual(next);

    const read = await get('/backups/settings', adminToken).expect(200);
    expect(read.body).toMatchObject({ state: 'valid', settings: next });

    const audits = await ds.query(
      `SELECT "userId", "entityId", "oldValues", "newValues" FROM audit_logs
        WHERE action = 'BACKUP_SETTINGS_UPDATED' AND "userId" = $1`,
      [adminId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBeNull();
    expect(audits[0].oldValues).toMatchObject({ intervalMinutes: original.intervalMinutes });
    expect(audits[0].newValues).toMatchObject({ intervalMinutes: 15, retentionMonthlyCount: 6 });
  });

  it('reports scheduling as unavailable with a reason in this environment, and status still answers', async () => {
    const res = await get('/backups/status', adminToken).expect(200);
    expect(res.body.scheduling).toMatchObject({ state: 'unavailable' });
    expect(res.body.scheduling.reason).toEqual(expect.any(String));
  });

  it('keeps the audit trail to the one accepted change, not the rejected update', async () => {
    const rows = await ds.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'BACKUP_SETTINGS_UPDATED' AND "userId" = $1`,
      [adminId],
    );
    expect(rows[0].n).toBe(1);
  });
});

function pick(row: BackupSettings): Record<string, unknown> {
  return {
    intervalMinutes: row.intervalMinutes,
    retentionWindowHours: row.retentionWindowHours,
    retentionDailyCount: row.retentionDailyCount,
    retentionWeeklyCount: row.retentionWeeklyCount,
    retentionMonthlyCount: row.retentionMonthlyCount,
  };
}
