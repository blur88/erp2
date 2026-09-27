/**
 * Cron isolation for e2e-booted apps (#1311).
 *
 * Every suite boots the full AppModule against the shared test database. If
 * ScheduleModule registered @Cron handlers here, the hourly backup cleanup
 * would lazily INSERT a backup_retention_settings row at hh:00, the 02:00
 * cleanups would delete rows, and the leak check's verdict would depend on the
 * wall clock rather than on suite behaviour.
 *
 * createScheduleOptions() turns cron registration off under NODE_ENV=test.
 * This asserts the effect on a real boot, not just the options object: a
 * booted test app has no cron jobs in its SchedulerRegistry at all.
 *
 * No HTTP requests are made, so the suite leaves no audit_logs/search_queries
 * traces for the leak check to find.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AppModule } from "../src/app.module";

describe("Cron isolation (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("runs under NODE_ENV=test, the condition that disables cron", () => {
    // Guards the assertion below from passing for the wrong reason: if the
    // suite ran under another NODE_ENV, an empty registry would mean
    // something else is broken, not that isolation works.
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("registers no cron jobs in a booted test app", () => {
    const registry = app.get(SchedulerRegistry);
    // Compare names, not size, so a failure lists which handlers leaked in.
    expect([...registry.getCronJobs().keys()]).toEqual([]);
  });
});
