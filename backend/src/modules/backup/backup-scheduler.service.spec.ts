import { Queue } from "bullmq";
import { Repository } from "typeorm";
import { BackupSchedule } from "@database/entities/backup-schedule.entity";
import { BackupSchedulerService } from "./backup-scheduler.service";
import { BackupService } from "./backup.service";

describe("BackupSchedulerService", () => {
  let schedule: BackupSchedule;
  let scheduleRepository: jest.Mocked<Repository<BackupSchedule>>;
  let backupQueue: jest.Mocked<Queue>;
  let service: BackupSchedulerService;

  beforeEach(() => {
    schedule = {
      id: "schedule-1",
      name: "Nightly",
      enabled: true,
      frequency: "daily",
      time: "02:30",
      databases: ["erp"],
      includeSettings: true,
    } as BackupSchedule;

    scheduleRepository = {
      create: jest.fn().mockReturnValue(schedule),
      save: jest.fn().mockResolvedValue(schedule),
    } as unknown as jest.Mocked<Repository<BackupSchedule>>;

    backupQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      removeRepeatable: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Queue>;

    service = new BackupSchedulerService(
      scheduleRepository,
      backupQueue,
      {} as BackupService,
    );
  });

  it("registers enabled schedules with BullMQ repeat.pattern", async () => {
    await service.createSchedule({
      name: "Nightly",
      enabled: true,
      frequency: "daily",
      time: "02:30",
      databases: ["erp"],
      includeSettings: true,
    });

    expect(backupQueue.add).toHaveBeenCalledWith(
      "create-backup",
      expect.objectContaining({
        scheduleId: "schedule-1",
      }),
      {
        repeat: {
          pattern: "30 02 * * *",
        },
        jobId: "schedule-schedule-1",
      },
    );
  });

  it("removes schedule from queue using removeRepeatable with matching pattern and jobId", async () => {
    scheduleRepository.findOne = jest.fn().mockResolvedValue(schedule);
    scheduleRepository.remove = jest.fn().mockResolvedValue(undefined);

    await service.remove("schedule-1");

    expect(backupQueue.removeRepeatable).toHaveBeenCalledWith("create-backup", {
      pattern: "30 02 * * *",
      jobId: "schedule-schedule-1",
    });
  });
});
