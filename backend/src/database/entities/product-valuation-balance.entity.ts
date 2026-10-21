import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Product } from "./product.entity";

@Entity("product_valuation_balances")
@Check(
  "CHK_product_valuation_balance_method",
  "\"method\" IN ('AVERAGE', 'FIFO')",
)
@Index("IDX_product_valuation_balances_method", ["method"])
export class ProductValuationBalance {
  @PrimaryColumn({ type: "uuid" })
  productId: string;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  quantityOnHand: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  valueOnHand: string;

  @Column({ type: "varchar", length: 10 })
  method: "AVERAGE" | "FIFO";

  @Column({ type: "uuid", nullable: true })
  lastEntryId: string | null;

  @UpdateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date;

  @OneToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({
    name: "productId",
    foreignKeyConstraintName: "FK_product_valuation_balance_product",
  })
  product: Product;
}
