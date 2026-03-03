import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerEquityDocumentNumberSetting1772200000000 implements MigrationInterface {
  name = 'AddOwnerEquityDocumentNumberSetting1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const currentYear = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ($1, $2, 3, 1, $3)
       ON CONFLICT ("documentName") DO NOTHING`,
      ['Owner Equity', 'EQ', currentYear],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "document_number_settings" WHERE "documentName" = 'Owner Equity'`,
    );
  }
}
