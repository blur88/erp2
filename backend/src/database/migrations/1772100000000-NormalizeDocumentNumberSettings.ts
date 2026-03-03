import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeDocumentNumberSettings1772100000000 implements MigrationInterface {
  name = 'NormalizeDocumentNumberSettings1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_number_settings"`);

    await queryRunner.query(`
      CREATE TABLE "document_number_settings" (
        "id"            uuid                   NOT NULL DEFAULT gen_random_uuid(),
        "documentName"  character varying(50)  NOT NULL,
        "prefix"        character varying(10)  NOT NULL,
        "paddingDigits" smallint               NOT NULL DEFAULT 3,
        "nextNumber"    integer                NOT NULL DEFAULT 1,
        "lastResetYear" smallint               NOT NULL,
        "isActive"      boolean                NOT NULL DEFAULT true,
        "createdAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        "deletedAt"     TIMESTAMP,
        CONSTRAINT "PK_document_number_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_number_settings_name" UNIQUE ("documentName")
      )
    `);

    const currentYear = new Date().getFullYear() % 100;
    const defaults = [
      { name: 'Sales Orders',     prefix: 'SO'  },
      { name: 'Invoices',         prefix: 'INV' },
      { name: 'Payments',         prefix: 'PAY' },
      { name: 'Purchase Orders',  prefix: 'PO'  },
      { name: 'Goods Received',   prefix: 'GRN' },
      { name: 'Vendor Payments',  prefix: 'VP'  },
      { name: 'Stock Adjustment', prefix: 'SA'  },
      { name: 'Journal Entries',  prefix: 'JE'  },
      { name: 'Expenses',         prefix: 'EXP' },
      { name: 'Settlements',      prefix: 'STL' },
      { name: 'Owner Equity',     prefix: 'EQ'  },
    ];

    for (const row of defaults) {
      await queryRunner.query(
        `INSERT INTO "document_number_settings"
          ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
         VALUES ($1, $2, 3, 1, $3)`,
        [row.name, row.prefix, currentYear],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_number_settings"`);

    await queryRunner.query(`
      CREATE TABLE "document_number_settings" (
        "id"             uuid      NOT NULL DEFAULT gen_random_uuid(),
        "configurations" jsonb     NOT NULL DEFAULT '[]',
        "isActive"       boolean   NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt"      TIMESTAMP,
        CONSTRAINT "PK_document_number_settings_old" PRIMARY KEY ("id")
      )
    `);
  }
}
