import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddShippingToInvoices1765202591252 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "invoices",
      new TableColumn({
        name: "shippingAmount",
        type: "decimal",
        precision: 15,
        scale: 4,
        default: 0,
        comment: "Shipping/freight charges",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("invoices", "shippingAmount");
  }
}
