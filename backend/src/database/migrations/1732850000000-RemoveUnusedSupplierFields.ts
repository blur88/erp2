import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUnusedSupplierFields1732850000000 implements MigrationInterface {
  name = 'RemoveUnusedSupplierFields1732850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove unused columns from suppliers table
    // Fields being removed: contactTitle, alternativePhone, fax, taxId,
    // address, city, state, postalCode, country, currency, categories, certifications, metadata

    // Check and drop columns if they exist
    const columns = [
      'contactTitle',
      'alternativePhone',
      'fax',
      'taxId',
      'address',
      'city',
      'state',
      'postalCode',
      'country',
      'currency',
      'categories',
      'certifications',
      'metadata',
    ];

    for (const column of columns) {
      const hasColumn = await queryRunner.hasColumn('suppliers', column);
      if (hasColumn) {
        await queryRunner.dropColumn('suppliers', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the columns if needed (for rollback)
    await queryRunner.query(`
      ALTER TABLE "suppliers"
      ADD COLUMN IF NOT EXISTS "contactTitle" varchar(100),
      ADD COLUMN IF NOT EXISTS "alternativePhone" varchar(20),
      ADD COLUMN IF NOT EXISTS "fax" varchar(20),
      ADD COLUMN IF NOT EXISTS "taxId" varchar(30),
      ADD COLUMN IF NOT EXISTS "address" text,
      ADD COLUMN IF NOT EXISTS "city" varchar(100),
      ADD COLUMN IF NOT EXISTS "state" varchar(100),
      ADD COLUMN IF NOT EXISTS "postalCode" varchar(20),
      ADD COLUMN IF NOT EXISTS "country" varchar(100),
      ADD COLUMN IF NOT EXISTS "currency" varchar(10) DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS "categories" json,
      ADD COLUMN IF NOT EXISTS "certifications" json,
      ADD COLUMN IF NOT EXISTS "metadata" json
    `);
  }
}
