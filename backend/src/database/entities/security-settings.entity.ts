import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('security_settings')
export class SecuritySettings extends BaseEntity {
  /**
   * Auto-logout timeout in minutes (0 = disabled)
   * @default 60
   */
  @Column({ type: 'int', default: 60 })
  autoLogoutTimeout: number;

  /**
   * Warning time before auto-logout in minutes
   * @default 2
   */
  @Column({ type: 'int', default: 2 })
  autoLogoutWarningTime: number;

  /**
   * Failed login attempts threshold before account lockout
   * @default 5
   */
  @Column({ type: 'int', default: 5 })
  failedLoginThreshold: number;

  /**
   * Account lockout duration in minutes
   * @default 30
   */
  @Column({ type: 'int', default: 30 })
  lockoutDuration: number;

  /**
   * Minimum password length
   * @default 8
   */
  @Column({ type: 'int', default: 8 })
  minPasswordLength: number;

  /**
   * Require uppercase letter in password
   * @default true
   */
  @Column({ type: 'boolean', default: true })
  requireUppercase: boolean;

  /**
   * Require lowercase letter in password
   * @default true
   */
  @Column({ type: 'boolean', default: true })
  requireLowercase: boolean;

  /**
   * Require number in password
   * @default true
   */
  @Column({ type: 'boolean', default: true })
  requireNumber: boolean;

  /**
   * Require special character in password
   * @default true
   */
  @Column({ type: 'boolean', default: true })
  requireSpecialChar: boolean;

  /**
   * Access token expiry in minutes
   * @default 15
   */
  @Column({ type: 'int', default: 15 })
  accessTokenExpiry: number;

  /**
   * Refresh token expiry in days
   * @default 7
   */
  @Column({ type: 'int', default: 7 })
  refreshTokenExpiry: number;

  /**
   * Hour for daily token cleanup (0-23)
   * @default 2
   */
  @Column({ type: 'int', default: 2 })
  tokenCleanupHour: number;
}
