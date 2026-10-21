import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum CostingMethodChangeStatus { PROPOSED='proposed', APPROVED='approved', APPLIED='applied', WITHDRAWN='withdrawn' }

@Entity('costing_method_changes')
@Check('CHK_costing_method_change_methods', '"fromMethod" IN (\'AVERAGE\', \'FIFO\') AND "toMethod" IN (\'AVERAGE\', \'FIFO\') AND "fromMethod" <> "toMethod"')
@Check('CHK_costing_method_change_status', '"status" IN (\'proposed\', \'approved\', \'applied\', \'withdrawn\')')
@Index('IDX_costing_method_changes_status', ['status'])
export class CostingMethodChange {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 10 }) fromMethod: 'AVERAGE' | 'FIFO';
  @Column({ type: 'varchar', length: 10 }) toMethod: 'AVERAGE' | 'FIFO';
  @Column({ type: 'date' }) requestedEffectiveDate: string;
  @Column({ type: 'varchar', length: 12, default: CostingMethodChangeStatus.PROPOSED }) status: CostingMethodChangeStatus;
  @Column({ type: 'uuid' }) preparedByUserId: string;
  @Column({ type: 'uuid', nullable: true }) approvedByUserId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) contentHash: string | null;
  @Column({ type: 'timestamptz' }) snapshotTakenAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) appliedAt: Date | null;
  @Column({ type: 'date', nullable: true }) appliedDate: string | null;
  @Column({ type: 'uuid', nullable: true }) appliedByUserId: string | null;
  @Column({ type: 'text' }) explanation: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('costing_method_change_products')
@Index('IDX_costing_method_change_products_change', ['changeId'])
export class CostingMethodChangeProduct {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) changeId: string;
  @Column({ type: 'uuid' }) productId: string;
  @Column({ type: 'varchar', length: 10 }) method: 'AVERAGE' | 'FIFO';
  @Column({ type: 'numeric', precision: 15, scale: 4 }) quantity: string;
  @Column({ type: 'numeric', precision: 15, scale: 2 }) valueBefore: string;
  @Column({ type: 'numeric', precision: 15, scale: 2 }) valueAfter: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) layersBefore: unknown[];
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) batchesBefore: unknown[];
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) layersAfter: unknown[];
  @Column({ type: 'timestamptz', nullable: true }) supersededAt: Date | null;
}
