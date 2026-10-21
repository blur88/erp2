import { MigrationInterface, QueryRunner } from "typeorm";

export class RestrictCostingMethods1792600000000 implements MigrationInterface {
  name = "RestrictCostingMethods1792600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const unsupported: Array<{ id: string; costingMethod: string }> =
      await queryRunner.query(`
      SELECT id, "costingMethod"
        FROM regional_settings
       WHERE "costingMethod" NOT IN ('AVERAGE', 'FIFO')
       ORDER BY id
    `);

    if (unsupported.length) {
      const details = unsupported
        .map(
          ({ id, costingMethod }) =>
            `Unsupported costing method "${costingMethod}" in regional_settings ${id}`,
        )
        .join("\n");
      throw new Error(
        `${details}: resolve before deploying (#1398 P4 stage 1)`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "regional_settings"
      ADD CONSTRAINT "CHK_regional_settings_costing_method"
      CHECK ("costingMethod" IN ('AVERAGE', 'FIFO'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regional_settings" DROP CONSTRAINT "CHK_regional_settings_costing_method"`,
    );
  }
}
