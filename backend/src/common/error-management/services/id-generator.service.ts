import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class IdGeneratorService {
  private readonly logger = new Logger(IdGeneratorService.name);

  generateRequestId(): string {
    try {
      return randomUUID();
    } catch {
      this.logger.warn('Failed to generate UUID, using fallback');
      return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
}
