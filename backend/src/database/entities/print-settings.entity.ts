import { Entity, Column } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("print_settings")
export class PrintSettings extends BaseEntity {
  // Common Header Settings
  @Column({ type: "varchar", length: 500, nullable: true })
  logoUrl: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  companyName: string;

  @Column({ type: "text", nullable: true })
  address: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  city: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  state: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  postalCode: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  phone: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  website: string;

  @Column({ type: "text", nullable: true })
  miscInfo: string;

  // Sales Document Footer
  @Column({ type: "text", nullable: true })
  salesPerPageFooter: string;

  @Column({ type: "text", nullable: true })
  salesEndOfDocFooter: string;

  // Purchasing Document Footer
  @Column({ type: "text", nullable: true })
  purchasingPerPageFooter: string;

  @Column({ type: "text", nullable: true })
  purchasingEndOfDocFooter: string;

  // Inventory Document Footer
  @Column({ type: "text", nullable: true })
  inventoryPerPageFooter: string;

  @Column({ type: "text", nullable: true })
  inventoryEndOfDocFooter: string;

  // Report Document Footer
  @Column({ type: "text", nullable: true })
  reportPerPageFooter: string;

  @Column({ type: "text", nullable: true })
  reportEndOfDocFooter: string;

  // Template Settings
  @Column({ type: "jsonb", nullable: true })
  salesOrderTemplate: object;

  @Column({ type: "jsonb", nullable: true })
  invoiceTemplate: object;

  @Column({ type: "jsonb", nullable: true })
  paymentReceiptTemplate: object;

  @Column({ type: "jsonb", nullable: true })
  purchaseOrderTemplate: object;

  @Column({ type: "jsonb", nullable: true })
  grnTemplate: object;

  @Column({ type: "jsonb", nullable: true })
  vendorPaymentTemplate: object;
}
