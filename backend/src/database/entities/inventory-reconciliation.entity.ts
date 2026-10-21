import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export enum InventoryReconciliationStatus { PROPOSED='proposed', APPROVED='approved', APPLIED='applied', ABORTED='aborted', SUPERSEDED='superseded' }
export enum InventoryCostEvidence { UNREVIEWED='unreviewed', SUPPORTED='supported', ACCEPTED_WITHOUT_EVIDENCE='accepted_without_evidence' }

@Entity('inventory_reconciliations')
@Check('chk_inventory_reconciliation_status', '"status" IN (\'proposed\',\'approved\',\'applied\',\'aborted\',\'superseded\')')
@Index('idx_inventory_reconciliations_status', ['status'])
export class InventoryReconciliation {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' }) id: string;
  @Column({type:'varchar',length:12,default:InventoryReconciliationStatus.PROPOSED}) status: InventoryReconciliationStatus;
  @Column({type:'uuid'}) preparedByUserId: string;
  @Column({type:'uuid',nullable:true}) approvedByUserId: string|null;
  @Column({type:'timestamptz',nullable:true}) approvedAt: Date|null;
  @Column({type:'varchar',length:64,nullable:true}) contentHash: string|null;
  @Column({type:'timestamptz',nullable:true}) cutoffAt: Date|null;
  @Column({type:'numeric',precision:15,scale:2}) controlAccountBalanceAtPreparation: string;
  @Column({type:'numeric',precision:15,scale:2,nullable:true}) controlAccountBalanceAtCutoff: string|null;
  @Column({type:'jsonb',default:()=>"'[]'::jsonb"}) openingBalanceEntries: unknown[];
  @Column({type:'numeric',precision:15,scale:2,default:() => "'0'::numeric"}) approvedTotalValue: string;
  @Column({type:'numeric',precision:15,scale:2,default:() => "'0'::numeric"}) difference: string;
  @Column({type:'text',nullable:true}) differenceExplanation: string|null;
  @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) snapshot: Record<string,unknown>;
  @Column({type:'uuid',nullable:true,unique:true}) correctingEntryId: string|null;
  @CreateDateColumn({type:'timestamptz'}) createdAt: Date;
}

@Entity('inventory_opening_positions')
@Check('chk_inventory_opening_position_uncovered', '"uncoveredQuantity" >= 0')
@Index('idx_inventory_opening_positions_reconciliation', ['reconciliationId'])
export class InventoryOpeningPosition {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' }) id: string;
  @Column({type:'uuid'}) reconciliationId: string;
  @Column({type:'uuid'}) productId: string;
  @Column({type:'numeric',precision:15,scale:4}) approvedQuantity: string;
  @Column({type:'numeric',precision:15,scale:2}) approvedValue: string;
  @Column({type:'numeric',precision:15,scale:4,default:() => "'0'::numeric"}) uncoveredQuantity: string;
  @Column({type:'numeric',precision:15,scale:4,nullable:true}) uncoveredUnitCost: string|null;
  @Column({type:'enum',enum:InventoryCostEvidence,enumName:'inventory_cost_evidence_enum',default:InventoryCostEvidence.UNREVIEWED}) uncoveredCostEvidence: InventoryCostEvidence;
  @Column({type:'text',nullable:true}) evidence: string|null;
  @Column({type:'text',nullable:true}) uncertainties: string|null;
  @Column({type:'text',nullable:true}) valuationChangeExplanation: string|null;
}

@Entity('inventory_opening_position_batches')
@Check('chk_inventory_opening_position_batch_release', '"releaseQuantity" >= 0 AND "releaseQuantity" <= "remainingQuantity"')
@Check('chk_inventory_opening_position_batch_release_reason', '"releaseQuantity" = 0 OR length(trim("releaseReason")) > 0')
@Index('idx_inventory_opening_position_batches_position', ['positionId'])
export class InventoryOpeningPositionBatch {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' }) id: string;
  @Column({type:'uuid'}) positionId: string;
  @Column({type:'uuid'}) batchId: string;
  @Column({type:'numeric',precision:15,scale:4}) remainingQuantity: string;
  @Column({type:'numeric',precision:15,scale:4}) landedCost: string;
  @Column({type:'enum',enum:InventoryCostEvidence,enumName:'inventory_cost_evidence_enum',default:InventoryCostEvidence.UNREVIEWED}) costEvidence: InventoryCostEvidence;
  @Column({type:'text',nullable:true}) note: string|null;
  @Column({type:'numeric',precision:15,scale:4,default:() => "'0'::numeric"}) releaseQuantity: string;
  @Column({type:'text',nullable:true}) releaseReason: string|null;
}

@Entity('inventory_cutover_batch_releases')
@Check('inventory_cutover_batch_releases_quantity_check', '"quantity" > 0')
export class InventoryCutoverBatchRelease {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' }) id: string;
  @Column({type:'uuid'}) reconciliationId: string;
  @Column({type:'uuid'}) batchId: string;
  @Column({type:'numeric',precision:15,scale:4}) quantity: string;
  @Column({type:'text'}) reason: string;
  @CreateDateColumn({type:'timestamptz'}) createdAt: Date;
}

@Entity('inventory_reconciliation_journal_lines')
@Check('chk_inventory_reconciliation_journal_line_sign', 'debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0)')
@Index('idx_inventory_reconciliation_journal_lines_reconciliation', ['reconciliationId'])
export class InventoryReconciliationJournalLine {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' }) id: string;
  @Column({type:'uuid'}) reconciliationId: string;
  @Column({type:'uuid'}) accountId: string;
  @Column({type:'numeric',precision:15,scale:2,default:() => "'0'::numeric"}) debit: string;
  @Column({type:'numeric',precision:15,scale:2,default:() => "'0'::numeric"}) credit: string;
  @Column({type:'text'}) explanation: string;
}
