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
import { Product } from "./product.entity";
import { StockValuationEntry } from "./stock-valuation-entry.entity";

@Entity("inventory_cost_layers")
@Check(
  "CHK_inventory_cost_layer_remaining_quantity_nonnegative",
  '"remainingQuantity" >= 0',
)
@Check(
  "CHK_inventory_cost_layer_remaining_value_nonnegative",
  '"remainingValue" >= 0',
)
@Check(
  "CHK_inventory_cost_layer_empty_value",
  '"remainingQuantity" > 0 OR "remainingValue" = 0',
)
@Index("IDX_inventory_cost_layers_product", ["productId", "id"])
export class InventoryCostLayer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  productId: string;

  @Column({ type: "uuid", nullable: true })
  sourceEntryId: string | null;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  quantity: string;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  unitValue: string;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  remainingQuantity: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  remainingValue: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({
    name: "productId",
    foreignKeyConstraintName: "FK_inventory_cost_layer_product",
  })
  product: Product;

  @ManyToOne(() => StockValuationEntry, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({
    name: "sourceEntryId",
    foreignKeyConstraintName: "FK_inventory_cost_layer_source_entry",
  })
  sourceEntry: StockValuationEntry | null;
}
