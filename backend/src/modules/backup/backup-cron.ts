import { defaultRepeatStrategy } from 'bullmq';

export class InvalidBackupCronExpressionError extends Error {
  constructor() {
    super(
      'cronExpression must be a valid cron expression; correct it or clear it to use the schedule frequency',
    );
    this.name = 'InvalidBackupCronExpressionError';
  }
}

export function validateBackupCronExpression(expression: string): void {
  // Empty/null expressions select the generated frequency-based schedule.
  if (!expression) return;

  try {
    // Use BullMQ's own parser and options, including its pinned cron-parser.
    defaultRepeatStrategy(Date.now(), { pattern: expression });
  } catch {
    throw new InvalidBackupCronExpressionError();
  }
}
