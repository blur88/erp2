import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryOpeningPostingType1792852800000 implements MigrationInterface {
  name = 'AddInventoryOpeningPostingType1792852800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'INVENTORY_OPENING'`);
    await queryRunner.query(`ALTER TYPE "public"."journal_entry_sourcetype_enum" ADD VALUE IF NOT EXISTS 'PRODUCT'`);
  }

  async down(): Promise<void> {
    throw new Error('PostgreSQL enum values are not removed in down migrations');
  }
}
