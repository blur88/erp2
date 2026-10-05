import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export interface ReplayEvent {
  sessionId: string;
  userId: string;
  presentedGeneration: number;
  currentGeneration: number;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ReplayAuditWriter {
  async write(manager: EntityManager, event: ReplayEvent): Promise<void> {
    const auditLog = manager.create(AuditLog, {
      action: 'SESSION_REPLAY_REVOKED',
      entityType: 'auth_session',
      entityId: event.sessionId,
      userId: event.userId,
      description: 'Superseded refresh token presented outside its grace window; session revoked',
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: {
        presentedGeneration: event.presentedGeneration,
        currentGeneration: event.currentGeneration,
      },
    });
    await manager.save(auditLog);
  }
}
