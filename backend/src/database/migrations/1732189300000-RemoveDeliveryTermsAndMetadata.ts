import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class RemoveDeliveryTermsAndMetadata1732189300000 implements MigrationInterface {
  name = "RemoveDeliveryTermsAndMetadata1732189300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop columns using raw SQL with IF EXISTS
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryTerms"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "metadata"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate columns in reverse order
    await queryRunner.addColumn(
      "purchase_orders",
      new TableColumn({
        name: "metadata",
        type: "json",
        isNullable: true,
        comment: "Additional order metadata",
      }),
    );

    await queryRunner.addColumn(
      "purchase_orders",
      new TableColumn({
        name: "deliveryTerms",
        type: "text",
        isNullable: true,
        comment: "Delivery terms (FOB, CIF, etc.)",
      }),
    );
  }
}
