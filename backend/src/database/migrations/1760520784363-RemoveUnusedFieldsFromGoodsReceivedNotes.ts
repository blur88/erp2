import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedFieldsFromGoodsReceivedNotes1760520784363 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove unused logistics/delivery fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "inspectedDate"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "expectedDate"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "deliveryReference"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "vehicleDetails"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "driverName"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "driverContact"`);

        // Remove unused quality control fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "qualityInspected"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "inspectorName"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "inspectionNotes"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "qualityTestResults"`);

        // Remove unused notes fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "notes"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "internalNotes"`);

        // Remove unused JSON data fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "itemsReceived"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "attachments"`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "metadata"`);

        // Remove redundant quantity field
        await queryRunner.query(`ALTER TABLE "goods_received_notes" DROP COLUMN IF EXISTS "totalQuantityOrdered"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back logistics/delivery fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "inspectedDate" date`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "expectedDate" date`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "deliveryReference" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "vehicleDetails" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "driverName" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "driverContact" character varying(20)`);

        // Add back quality control fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "qualityInspected" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "inspectorName" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "inspectionNotes" text`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "qualityTestResults" json`);

        // Add back notes fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "notes" text`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "internalNotes" text`);

        // Add back JSON data fields
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "itemsReceived" json NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "attachments" json`);
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "metadata" json`);

        // Add back redundant quantity field
        await queryRunner.query(`ALTER TABLE "goods_received_notes" ADD "totalQuantityOrdered" numeric(15,4) NOT NULL DEFAULT '0'`);
    }

}
