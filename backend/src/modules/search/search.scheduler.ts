import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

const RETENTION_DAYS = 90;

@Injectable()
export class SearchScheduler {
  private readonly logger = new Logger(SearchScheduler.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleRetentionCleanup(): Promise<void> {
    this.logger.log('Starting search analytics retention cleanup');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const clickResult: { id: string }[] = await queryRunner.query(
        `DELETE FROM search_clicks WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         RETURNING id`,
      );
      const clicksDeleted = clickResult.length;

      const queryResult: { id: string }[] = await queryRunner.query(
        `DELETE FROM search_queries WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         RETURNING id`,
      );
      const queriesDeleted = queryResult.length;

      await queryRunner.commitTransaction();
      this.logger.log(
        `Retention cleanup complete: ${clicksDeleted} clicks, ${queriesDeleted} queries deleted`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction().catch((rollbackError: Error) => {
        this.logger.error(
          'Rollback failed during retention cleanup',
          rollbackError.stack,
        );
      });
      this.logger.error(
        'Search analytics retention cleanup failed',
        (error as Error).stack,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
