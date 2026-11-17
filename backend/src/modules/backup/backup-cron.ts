import { BadRequestException } from '@nestjs/common';
import { defaultRepeatStrategy } from 'bullmq';

export function validateBackupCronExpression(expression: string): void {
  // Empty/null expressions select the generated frequency-based schedule.
  if (!expression) return;

  try {
    // Use BullMQ's own parser and options, including its pinned cron-parser.
    defaultRepeatStrategy(Date.now(), { pattern: expression });
  } catch {
    throw new BadRequestException('cronExpression must be a valid cron expression');
  }
}
