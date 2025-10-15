import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUnusedPurchasingTables1761500000000 implements MigrationInterface {
  name = 'RemoveUnusedPurchasingTables1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`
      ALTER TABLE "purchase_requisition_items" DROP CONSTRAINT "FK_01cab29f22bfe09ab5b3e31d1db";
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_requisition_items" DROP CONSTRAINT "FK_f97d2a263031a7e93ff12926418";
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_requisitions" DROP CONSTRAINT "FK_01c53630b9f108ad9dcb8adad62";
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_requisitions" DROP CONSTRAINT "FK_2b7704263b78d1b8064114de753";
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_requisitions" DROP CONSTRAINT "FK_7b1612323f328b0af8ff417abba";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoice_items" DROP CONSTRAINT "FK_0417373b3f8262f9add081a4358";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoice_items" DROP CONSTRAINT "FK_2d232e67516d9c5f78d62271784";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoice_items" DROP CONSTRAINT "FK_60be98681ba15dcbe9816b3906e";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoices" DROP CONSTRAINT "FK_0016dff0b38af08f4aaa9d940a6";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoices" DROP CONSTRAINT "FK_168e7c684224348b06c850df46c";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoices" DROP CONSTRAINT "FK_199e65e5227ed250170bb4d6441";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoices" DROP CONSTRAINT "FK_b733ef16ed2da98e06afa4f23a7";
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_invoices" DROP CONSTRAINT "FK_dd9988ab94e4dcaa16206ab05e2";
    `);

    // Drop the tables
    await queryRunner.query(`DROP TABLE "purchase_requisition_items"`);
    await queryRunner.query(`DROP TABLE "purchase_requisitions"`);
    await queryRunner.query(`DROP TABLE "supplier_invoice_items"`);
    await queryRunner.query(`DROP TABLE "supplier_invoices"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreation of tables would be complex, so we'll just note that this migration is not easily reversible
    throw new Error("This migration cannot be automatically reversed. Please restore from backup if needed.");
  }
}