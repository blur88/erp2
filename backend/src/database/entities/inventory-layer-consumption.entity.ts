import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { InventoryCostLayer } from "./inventory-cost-layer.entity";
import { StockValuationEntry } from "./stock-valuation-entry.entity";

@Entity("inventory_layer_consumptions")
@Check("CHK_inventory_layer_consumption_quantity_positive", '"quantity" > 0')
@Index("IDX_inventory_layer_consumptions_layer", ["layerId", "createdAt"])
@Index("IDX_inventory_layer_consumptions_entry", ["entryId"])
export class InventoryLayerConsumption {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  layerId: string;

  @Column({ type: "uuid" })
  entryId: string;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  quantity: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  value: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @ManyToOne(() => InventoryCostLayer, { onDelete: "RESTRICT" })
  @JoinColumn({
    name: "layerId",
    foreignKeyConstraintName: "FK_inventory_layer_consumption_layer",
  })
  layer: InventoryCostLayer;

  @ManyToOne(() => StockValuationEntry, { onDelete: "RESTRICT" })
  @JoinColumn({
    name: "entryId",
    foreignKeyConstraintName: "FK_inventory_layer_consumption_entry",
  })
  entry: StockValuationEntry;
}
