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
} from 'typeorm';
import { IsUUID, IsDate, IsOptional, IsBoolean } from 'class-validator';

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
  readonly createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @IsDate()
  readonly updatedAt: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
  })
  @IsOptional()
  @IsDate()
  readonly deletedAt?: Date;

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

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who deleted this record',
  })
  @IsOptional()
  @IsUUID(4)
  deletedBy?: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Soft delete flag for performance queries',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'varchar',
    length: 256,
    nullable: true,
    comment: 'SHA-256 hash for audit trail integrity',
  })
  @IsOptional()
  auditHash?: string;

  @BeforeInsert()
  async beforeInsert() {
    // Set default values
    if (this.isActive === undefined) {
      this.isActive = true;
    }
    
    // Generate audit hash for integrity
    await this.generateAuditHash();
  }

  @BeforeUpdate()
  async beforeUpdate() {
    // Update audit hash
    await this.generateAuditHash();
  }

  /**
   * Generate SHA-256 hash of audit fields for integrity verification
   */
  private async generateAuditHash(): Promise<void> {
    try {
      const crypto = await import('crypto');
      const auditData = {
        id: this.id,
        createdAt: this.createdAt?.toISOString(),
        createdBy: this.createdBy,
        updatedAt: this.updatedAt?.toISOString(),
        updatedBy: this.updatedBy,
        deletedAt: this.deletedAt?.toISOString(),
        deletedBy: this.deletedBy,
        isActive: this.isActive,
      };
      
      this.auditHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(auditData))
        .digest('hex');
    } catch (error) {
      // Fallback if crypto is not available
      this.auditHash = undefined;
    }
  }

  /**
   * Verify audit hash integrity
   */
  async verifyAuditHash(): Promise<boolean> {
    if (!this.auditHash) return true; // Skip verification if no hash
    
    const originalHash = this.auditHash;
    await this.generateAuditHash();
    const currentHash = this.auditHash;
    
    // Restore original hash
    this.auditHash = originalHash;
    
    return originalHash === currentHash;
  }
}