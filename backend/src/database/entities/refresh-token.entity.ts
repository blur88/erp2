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
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { User } from './user.entity';
import type { AuthSession } from './auth-session.entity';

/**
 * RefreshToken entity for JWT refresh token management
 * Stores hashed refresh tokens with expiry and device tracking
 */
@Entity('refresh_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['userId'])
@Index(['expiresAt'])
@Index(['sessionId', 'generation'], { unique: true })
@Check(`("supersededAt" IS NULL) = ("graceUntil" IS NULL)`)
export class RefreshToken extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
    comment: 'SHA-256 hash of the refresh token',
  })
  @IsString()
  tokenHash: string;

  @Column({
    type: 'uuid',
    comment: 'Foreign key to users table',
  })
  @IsUUID()
  userId: string;

  @Column({
    type: 'uuid',
    comment: 'Foreign key to auth_sessions table',
  })
  @IsUUID()
  sessionId: string;

  @Column({
    type: 'int',
    comment: 'Generation number within the session',
  })
  @IsInt()
  generation: number;

  @Column({
    type: 'timestamptz',
    comment: 'Timestamp when token was issued',
  })
  @IsDate()
  issuedAt: Date;

  @Column({
    type: 'timestamptz',
    comment: 'Token expiration timestamp',
  })
  @IsDate()
  expiresAt: Date;

  @Column({
    type: 'varchar',
    length: 32,
    comment: 'Key ID used to sign the token',
  })
  @IsString()
  keyId: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when token was superseded by rotation',
  })
  @IsOptional()
  @IsDate()
  supersededAt?: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp until which superseded token can recover',
  })
  @IsOptional()
  @IsDate()
  graceUntil?: Date | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Device user agent for audit tracking',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IP address for audit tracking',
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  // Relationships
  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne('AuthSession', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: AuthSession;

  // Virtual field to check if token is expired
  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }
}
