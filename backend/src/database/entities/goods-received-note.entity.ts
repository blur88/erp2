import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Supplier } from "./supplier.entity";
import { GoodsReceivedNoteItem } from "./goods-received-note-item.entity";

export enum GrnStatus {
  DRAFT = "draft",
  RECEIVED = "received",
}

/**
 * Goods Received Note (GRN) entity for tracking receipt of goods from suppliers
 * Links to purchase orders and tracks quality inspection results
 */
@Entity("goods_received_notes")
@Index(["grnNumber"], { unique: true })
@Index(["purchaseOrderId"])
@Index(["supplierId"])
@Index(["status"])
@Index(["receivedDate"])
export class GoodsReceivedNote extends BaseEntity {
  @Column({
    type: "varchar",
    length: 30,
    unique: true,
    comment: "Unique GRN number",
  })
  @IsString()
  @MaxLength(30)
  grnNumber: string;

  @Column({
    type: "enum",
    enum: GrnStatus,
    default: GrnStatus.DRAFT,
    comment: "GRN status",
  })
  @IsEnum(GrnStatus)
  status: GrnStatus;

  @Column({
    type: "date",
    comment: "Date goods were received",
  })
  @IsDate()
  receivedDate: Date;

  // Totals
  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment: "Total quantity received",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  totalQuantityReceived: number;

  // Foreign Keys
  @Column({
    type: "uuid",
    nullable: true,
    comment: "Related purchase order ID",
  })
  @IsOptional()
  purchaseOrderId?: string;

  @Column({
    type: "uuid",
    comment: "Supplier ID",
  })
  supplierId: string;

  // Relationships
  @ManyToOne(
    () => PurchaseOrder,
    (purchaseOrder) => purchaseOrder.goodsReceivedNotes,
    {
      onDelete: "SET NULL",
      nullable: true,
      eager: true,
    },
  )
  @JoinColumn({ name: "purchaseOrderId" })
  purchaseOrder?: PurchaseOrder;

  @ManyToOne(() => Supplier, (supplier) => supplier.goodsReceivedNotes, {
    onDelete: "RESTRICT",
    eager: true,
  })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @OneToMany(() => GoodsReceivedNoteItem, (item) => item.grn, {
    cascade: true,
    eager: false,
  })
  items: GoodsReceivedNoteItem[];

  // Computed properties
  get isFullyReceived(): boolean {
    // Check if all items in the GRN have been received
    return (
      this.items &&
      this.items.every((item) => item.receivedQuantity >= item.orderedQuantity)
    );
  }

  get isPartiallyReceived(): boolean {
    // Check if some items have been received but not all
    return (
      this.items &&
      this.items.some((item) => item.receivedQuantity > 0) &&
      !this.isFullyReceived
    );
  }

  get receivedPercentage(): number {
    // Calculate percentage based on items received vs ordered
    if (!this.items || this.items.length === 0) return 0;

    const totalOrdered = this.items.reduce(
      (sum, item) => sum + Number(item.orderedQuantity || 0),
      0,
    );
    const totalReceived = this.items.reduce(
      (sum, item) => sum + Number(item.receivedQuantity || 0),
      0,
    );

    return totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
  }

  // Hooks
  @BeforeInsert()
  generateGrnNumber() {
    // GRN number will be set by the service using sequential numbering
    // This hook is kept for backward compatibility but does nothing
    // if grnNumber is already set by the service
  }

  @BeforeInsert()
  calculateTotals() {
    // Calculate total quantity received from items relation
    if (this.items && this.items.length > 0) {
      this.totalQuantityReceived = this.items.reduce(
        (sum, item) => sum + Number(item.receivedQuantity || 0),
        0,
      );
    }
  }

  // Helper methods
  updateStatus(): void {
    // Simplified status logic - only DRAFT or RECEIVED
    if (this.receivedDate) {
      this.status = GrnStatus.RECEIVED;
    } else {
      this.status = GrnStatus.DRAFT;
    }
  }

  // Get summary for reporting
  getSummary(): {
    itemCount: number;
    totalReceived: number;
    receivedPercentage: number;
  } {
    return {
      itemCount: this.items?.length || 0,
      totalReceived: Number(this.totalQuantityReceived),
      receivedPercentage: this.receivedPercentage,
    };
  }

  // Get items with variance (received != ordered)
  getItemsWithVariance(): Array<{
    productId: string;
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    variance: number;
  }> {
    if (!this.items) return [];

    return this.items
      .filter(
        (item) =>
          Number(item.receivedQuantity || 0) !==
          Number(item.orderedQuantity || 0),
      )
      .map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        orderedQuantity: Number(item.orderedQuantity || 0),
        receivedQuantity: Number(item.receivedQuantity || 0),
        variance:
          Number(item.receivedQuantity || 0) -
          Number(item.orderedQuantity || 0),
      }));
  }
}
