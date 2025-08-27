import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { IsUUID, IsDate, IsOptional } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base entity class that provides common fields for all entities
 * - UUID primary key
 * - Audit timestamps (created, updated, deleted)
 * - Audit user tracking (createdBy, updatedBy)
 * - Soft delete support
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID(4)
  id: string;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @IsDate()
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @IsDate()
  updatedAt: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
  })
  @IsOptional()
  @IsDate()
  deletedAt?: Date;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who created this record',
  })
  @IsOptional()
  @IsUUID(4)
  createdBy?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who last updated this record',
  })
  @IsOptional()
  @IsUUID(4)
  updatedBy?: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}