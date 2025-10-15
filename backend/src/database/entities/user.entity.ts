import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsEmail,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsPhoneNumber,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { SalesOrder } from './sales-order.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Payment } from './payment.entity';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  SALES_STAFF = 'sales_staff',
  INVENTORY_STAFF = 'inventory_staff',
  PROCUREMENT_STAFF = 'procurement_staff',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

/**
 * User entity for authentication and user management
 * Supports role-based access control and user activity tracking
 */
@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
@Index(['role', 'status'])
@Index(['isActive', 'status'])
export class User extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Unique username for login',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'User email address',
  })
  @IsEmail()
  @MaxLength(100)
  email: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Hashed password',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'User first name',
  })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'User last name',
  })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'User phone number',
  })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.SALES_STAFF,
    comment: 'User role for access control',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
    comment: 'User account status',
  })
  @IsEnum(UserStatus)
  status: UserStatus;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the user account is active',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last login timestamp',
  })
  @IsOptional()
  lastLoginAt?: Date;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'Last login IP address',
  })
  @IsOptional()
  @IsString()
  lastLoginIp?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of failed login attempts',
  })
  failedLoginAttempts: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Account locked until this timestamp',
  })
  @IsOptional()
  lockedUntil?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'User profile notes or description',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Relationships
  @OneToMany(() => SalesOrder, (salesOrder) => salesOrder.createdByUser, {
    cascade: false,
  })
  salesOrders: SalesOrder[];

  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.createdByUser, {
    cascade: false,
  })
  purchaseOrders: PurchaseOrder[];

  @OneToMany(() => Payment, (payment) => payment.recordedByUser, {
    cascade: false,
  })
  payments: Payment[];

  // Virtual fields
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get isLocked(): boolean {
    return this.lockedUntil && this.lockedUntil > new Date();
  }
}