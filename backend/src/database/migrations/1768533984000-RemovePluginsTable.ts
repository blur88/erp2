import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration to remove the plugins table
 *
 * This migration drops the plugins table as the PluginsModule has been
 * permanently removed from the system.
 *
 * @migration RemovePluginsTable
 * @date 2026-01-16
 */
export class RemovePluginsTable1768533984000 implements MigrationInterface {
  name = "RemovePluginsTable1768533984000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the plugins table exists before dropping
    const tableExists = await queryRunner.hasTable("plugins");

    if (tableExists) {
      // Drop the plugins table
      await queryRunner.query(`DROP TABLE IF EXISTS "plugins" CASCADE`);
      console.log("✅ Successfully dropped plugins table");
    } else {
      console.log("ℹ️ Plugins table does not exist, skipping drop");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the plugins table structure for rollback support
    await queryRunner.query(`
      CREATE TABLE "plugins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "createdBy" character varying,
        "updatedBy" character varying,
        "identifier" character varying(100) NOT NULL,
        "name" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "version" character varying(20) NOT NULL,
        "type" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'installed',
        "isActive" boolean NOT NULL DEFAULT false,
        "author" character varying(200) NOT NULL,
        "license" character varying(100),
        "homepage" character varying(255),
        "repository" character varying(255),
        "iconUrl" character varying(255),
        "installedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastActivatedDate" TIMESTAMP WITH TIME ZONE,
        "lastUpdatedDate" TIMESTAMP WITH TIME ZONE,
        "installPath" character varying(500),
        "dependencies" json,
        "requirements" json,
        "configSchema" json,
        "config" json,
        "defaultConfig" json,
        "hooks" json,
        "endpoints" json,
        "uiComponents" json,
        "performanceMetrics" json,
        "usageStats" json,
        "lastError" text,
        "lastErrorAt" TIMESTAMP WITH TIME ZONE,
        "errorCount" integer NOT NULL DEFAULT 0,
        "tags" json,
        "media" json,
        "changelog" json,
        "metadata" json,
        CONSTRAINT "PK_plugins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plugins_identifier" UNIQUE ("identifier"),
        CONSTRAINT "UQ_plugins_name" UNIQUE ("name")
      )
    `);

    // Recreate indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_identifier" ON "plugins" ("identifier")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_name" ON "plugins" ("name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_status" ON "plugins" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_type" ON "plugins" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_isActive" ON "plugins" ("isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugins_installedDate" ON "plugins" ("installedDate")`,
    );

    console.log("✅ Successfully recreated plugins table (rollback)");
  }
}
