import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BackupSchedule } from '../../database/entities/backup-schedule.entity';
import { createGlobalValidationPipe } from '../../common/validation/global-validation-pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BackupController } from './backup.controller';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

describe('Backup schedule HTTP validation (#1907)', () => {
  let app: INestApplication;
  const valid = {
    name: 'Nightly',
    frequency: 'daily',
    time: '02:30',
    databases: ['postgresql'],
    enabled: true,
    cronExpression: '0 4 * * 1-5',
  };

  beforeEach(async () => {
    const rows = new Map<string, BackupSchedule>();
    // Model persistence separately from loaded entities: mutating an entity
    // must not change stored state until save is called.
    const repository = {
      create: (dto) => ({ id: 'schedule-1', ...dto }),
      save: async (row) => {
        rows.set(row.id, structuredClone(row));
        return row;
      },
      find: async () => [...rows.values()].map((row) => structuredClone(row)),
      findOne: async ({ where: { id } }) =>
        rows.has(id) ? structuredClone(rows.get(id)) : null,
    };
    const queue = {
      upsertJobScheduler: jest.fn(async () => undefined),
      removeJobScheduler: jest.fn(async () => true),
    };
    const scheduler = new BackupSchedulerService(
      repository as any,
      queue as any,
      {} as BackupService,
      {
        scanOrphanedSchedulers: async () => ({
          orphans: [],
          unclassifiable: [],
          legacySkipped: [],
        }),
      } as any,
    );
    const module = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: {} },
        { provide: BackupSchedulerService, useValue: scheduler },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('POST rejects an invalid cron with 400 and creates no schedule', async () => {
    const response = await request(app.getHttpServer())
      .post('/backup/schedule')
      .send({ ...valid, cronExpression: '0 0 * * 1-5L' })
      .expect(400);
    expect(response.body.message).toContain('cronExpression');
    const list = await request(app.getHttpServer())
      .get('/backup/schedule/list')
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it.each(['post', 'patch'] as const)(
    '%s rejects invalid updates and preserves the saved schedule',
    async (method) => {
      const created = await request(app.getHttpServer())
        .post('/backup/schedule')
        .send(valid)
        .expect(201);
      await request(app.getHttpServer())
        [method](`/backup/schedule/${created.body.id}`)
        .send({ name: 'Changed', cronExpression: '0 0 31 2 *' })
        .expect(400);
      const saved = await request(app.getHttpServer())
        .get(`/backup/schedule/${created.body.id}`)
        .expect(200);
      expect(saved.body).toEqual(created.body);
    },
  );

  it('PATCH accepts a valid custom expression and persists the update', async () => {
    const created = await request(app.getHttpServer())
      .post('/backup/schedule')
      .send(valid)
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch(`/backup/schedule/${created.body.id}`)
      .send({ name: 'Morning', cronExpression: '0 6 * * *' })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Morning',
      cronExpression: '0 6 * * *',
      time: '02:30',
      frequency: 'daily',
      enabled: true,
    });
    const saved = await request(app.getHttpServer())
      .get(`/backup/schedule/${created.body.id}`)
      .expect(200);
    expect(saved.body).toEqual(updated.body);
  });
});
