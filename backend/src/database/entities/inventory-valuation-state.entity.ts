import { Check, Column, Entity, PrimaryColumn } from "typeorm";

export enum InventoryValuationStatus {
  INACTIVE = "inactive",
  ACTIVE = "active",
}

@Entity("inventory_valuation_state")
@Check("CHK_inventory_valuation_state_singleton", '"id" = true')
@Check(
  "CHK_inventory_valuation_state_status",
  "\"status\" IN ('inactive', 'active')",
)
export class InventoryValuationState {
  @PrimaryColumn({ type: "boolean", default: true })
  id: boolean;

  @Column({
    type: "varchar",
    length: 10,
    default: InventoryValuationStatus.INACTIVE,
  })
  status: InventoryValuationStatus;

  @Column({ type: "timestamptz", nullable: true })
  activatedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  pausedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  appliedReconciliationId: string | null;
}
