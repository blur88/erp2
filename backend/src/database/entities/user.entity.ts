import { Entity, Column, Index } from "typeorm";
import {
  IsEmail,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsPhoneNumber,
} from "class-validator";
import { BaseEntity } from "./base.entity";

export enum UserRole {
  ADMIN = "admin",
  MANAGER = "manager",
  SALES_STAFF = "sales_staff",
  INVENTORY_STAFF = "inventory_staff",
  PROCUREMENT_STAFF = "procurement_staff",
}

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
}

/**
 * User entity for authentication and user management
 * Supports role-based access control and user activity tracking
 */
@Entity("users")
@Index(["email"], { unique: true })
@Index(["username"], { unique: true })
@Index(["role", "status"])
@Index(["isActive", "status"])
export class User extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
    comment: "Unique username for login",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @Column({
    type: "varchar",
    length: 100,
    unique: true,
    nullable: true,
    comment: "User email address",
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @Column({
    type: "varchar",
    length: 255,
    comment: "Hashed password",
  })
  @IsString()
  @MinLength(6)
  password: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    comment: "User first name",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    comment: "User last name",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @Column({
    type: "varchar",
    length: 20,
    nullable: true,
    comment: "User phone number",
  })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.SALES_STAFF,
    comment: "User role for access control",
  })
  @IsEnum(UserRole)
  role: UserRole;

  @Column({
    type: "enum",
    enum: UserStatus,
    default: UserStatus.ACTIVE,
    comment: "User account status",
  })
  @IsEnum(UserStatus)
  status: UserStatus;

  @Column({
    type: "boolean",
    default: true,
    comment: "Whether the user account is active",
  })
  @IsBoolean()
  declare isActive: boolean;

  @Column({
    type: "timestamptz",
    nullable: true,
    comment: "Last login timestamp",
  })
  @IsOptional()
  lastLoginAt?: Date;

  @Column({
    type: "varchar",
    length: 45,
    nullable: true,
    comment: "Last login IP address",
  })
  @IsOptional()
  @IsString()
  lastLoginIp?: string;

  @Column({
    type: "int",
    default: 0,
    comment: "Number of failed login attempts",
  })
  failedLoginAttempts: number;

  @Column({
    type: "timestamptz",
    nullable: true,
    comment: "Account locked until this timestamp",
  })
  @IsOptional()
  lockedUntil?: Date;

  @Column({
    type: "text",
    nullable: true,
    comment: "User profile notes or description",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: "boolean",
    default: false,
    comment: "Whether user must change password before accessing app",
  })
  @IsBoolean()
  requiresPasswordChange: boolean;

  // Relationships
  // salesOrders relationship removed - createdByUser field removed from SalesOrder entity

  // Virtual fields
  get fullName(): string {
    const firstName = this.firstName || "";
    const lastName = this.lastName || "";
    return `${firstName} ${lastName}`.trim();
  }

  get isLocked(): boolean {
    return this.lockedUntil && this.lockedUntil > new Date();
  }
}
