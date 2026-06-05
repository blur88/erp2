import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { IsUUID, IsDate, IsOptional, IsBoolean } from "class-validator";

/**
 * Base entity class that provides common fields for all entities
 * - UUID primary key
 * - Audit timestamps (created, updated, deleted)
 * - Audit user tracking (createdBy, updatedBy)
 * - Soft delete support
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  @IsOptional()
  @IsUUID(4)
  id: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  @IsOptional()
  @IsDate()
  readonly createdAt: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  @IsOptional()
  @IsDate()
  readonly updatedAt: Date;

  @DeleteDateColumn({
    type: "timestamptz",
    nullable: true,
  })
  @IsOptional()
  @IsDate()
  readonly deletedAt?: Date;

  @Column({
    type: "boolean",
    default: true,
    comment: "Soft delete flag for performance queries",
  })
  @IsOptional()
  @IsBoolean()
  isActive: boolean;

  @BeforeInsert()
  async beforeInsert() {
    // Set default values
    if (this.isActive === undefined) {
      this.isActive = true;
    }
  }

  @BeforeUpdate()
  async beforeUpdate() {
    // No audit hash generation needed
  }
}
