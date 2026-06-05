import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { IsString, IsDate, IsOptional, IsUUID } from "class-validator";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

/**
 * RefreshToken entity for JWT refresh token management
 * Stores hashed refresh tokens with expiry and device tracking
 */
@Entity("refresh_tokens")
@Index(["tokenHash"], { unique: true })
@Index(["userId"])
@Index(["expiresAt"])
export class RefreshToken extends BaseEntity {
  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    comment: "SHA-256 hash of the refresh token",
  })
  @IsString()
  tokenHash: string;

  @Column({
    type: "uuid",
    comment: "Foreign key to users table",
  })
  @IsUUID()
  userId: string;

  @Column({
    type: "timestamptz",
    comment: "Token expiration timestamp",
  })
  @IsDate()
  expiresAt: Date;

  @Column({
    type: "text",
    nullable: true,
    comment: "Device user agent for audit tracking",
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @Column({
    type: "varchar",
    length: 45,
    nullable: true,
    comment: "IP address for audit tracking",
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  // Relationships
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  // Virtual field to check if token is expired
  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }
}
