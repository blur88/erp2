import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import {
  IsString,
  IsDate,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { User } from './user.entity';

export type SessionRevokeReason = 'logout' | 'password_change' | 'replay' | 'key_retired';

@Entity('auth_sessions')
@Index(['userId'])
@Index(['expiresAt'])
@Check(`"revokeReason" IS NULL OR "revokeReason" IN ('logout','password_change','replay','key_retired')`)
@Check(`("revokedAt" IS NULL) = ("revokeReason" IS NULL)`)
export class AuthSession extends BaseEntity {
  @Column({
    type: 'uuid',
    comment: 'Foreign key to users table',
  })
  @IsUUID()
  userId: string;

  @Column({
    type: 'int',
    default: 1,
    comment: 'Current generation of refresh token',
  })
  @IsInt()
  generation: number;

  @Column({
    type: 'timestamptz',
    comment: 'Session expiration timestamp',
  })
  @IsDate()
  expiresAt: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when session was revoked',
  })
  @IsOptional()
  @IsDate()
  revokedAt?: Date | null;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: 'Reason for session revocation',
  })
  @IsOptional()
  @IsString()
  revokeReason?: SessionRevokeReason | null;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether session was created with rememberMe option',
  })
  @IsBoolean()
  rememberMe: boolean;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IP address where session was created',
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Device user agent where session was created',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  // Relationships
  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
