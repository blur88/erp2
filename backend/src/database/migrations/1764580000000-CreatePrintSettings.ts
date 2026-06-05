import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreatePrintSettings1764580000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "print_settings",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          // Common Header Settings
          {
            name: "logoUrl",
            type: "varchar",
            length: "500",
            isNullable: true,
          },
          {
            name: "companyName",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "address",
            type: "text",
            isNullable: true,
          },
          {
            name: "phone",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "email",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "website",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "miscInfo",
            type: "text",
            isNullable: true,
          },
          // Sales Document Footer
          {
            name: "salesPerPageFooter",
            type: "text",
            isNullable: true,
          },
          {
            name: "salesEndOfDocFooter",
            type: "text",
            isNullable: true,
          },
          // Purchasing Document Footer
          {
            name: "purchasingPerPageFooter",
            type: "text",
            isNullable: true,
          },
          {
            name: "purchasingEndOfDocFooter",
            type: "text",
            isNullable: true,
          },
          // Inventory Document Footer
          {
            name: "inventoryPerPageFooter",
            type: "text",
            isNullable: true,
          },
          {
            name: "inventoryEndOfDocFooter",
            type: "text",
            isNullable: true,
          },
          // Report Document Footer
          {
            name: "reportPerPageFooter",
            type: "text",
            isNullable: true,
          },
          {
            name: "reportEndOfDocFooter",
            type: "text",
            isNullable: true,
          },
          // Template Settings (JSONB for flexible configuration)
          {
            name: "salesOrderTemplate",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "invoiceTemplate",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "paymentReceiptTemplate",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "purchaseOrderTemplate",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "grnTemplate",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "vendorPaymentTemplate",
            type: "jsonb",
            isNullable: true,
          },
          // Audit fields
          {
            name: "isActive",
            type: "boolean",
            default: true,
            isNullable: false,
          },
          {
            name: "createdBy",
            type: "varchar",
            length: "255",
            default: "'system'",
            isNullable: false,
          },
          {
            name: "updatedBy",
            type: "varchar",
            length: "255",
            default: "'system'",
            isNullable: false,
          },
          {
            name: "createdAt",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updatedAt",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "deletedAt",
            type: "timestamptz",
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create index on isActive for performance
    await queryRunner.query(
      `CREATE INDEX "IDX_print_settings_is_active" ON "print_settings" ("isActive")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("print_settings");
  }
}
