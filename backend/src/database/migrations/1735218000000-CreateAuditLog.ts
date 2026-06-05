import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateAuditLog1735218000000 implements MigrationInterface {
  name = "CreateAuditLog1735218000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_logs table
    await queryRunner.createTable(
      new Table({
        name: "audit_logs",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userId",
            type: "varchar",
            length: "100",
          },
          {
            name: "username",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "action",
            type: "varchar",
            length: "50",
          },
          {
            name: "entityType",
            type: "varchar",
            length: "100",
          },
          {
            name: "entityId",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
          },
          {
            name: "oldValues",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "newValues",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "ipAddress",
            type: "varchar",
            length: "45",
            isNullable: true,
          },
          {
            name: "userAgent",
            type: "text",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "deletedAt",
            type: "timestamptz",
            isNullable: true,
          },
          {
            name: "isActive",
            type: "boolean",
            default: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_action",
        columnNames: ["action"],
      }),
    );

    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_entityType",
        columnNames: ["entityType"],
      }),
    );

    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_entityId",
        columnNames: ["entityId"],
      }),
    );

    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_userId",
        columnNames: ["userId"],
      }),
    );

    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_createdAt",
        columnNames: ["createdAt"],
      }),
    );

    // Composite index for common queries
    await queryRunner.createIndex(
      "audit_logs",
      new TableIndex({
        name: "IDX_audit_logs_entityType_entityId",
        columnNames: ["entityType", "entityId"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex(
      "audit_logs",
      "IDX_audit_logs_entityType_entityId",
    );
    await queryRunner.dropIndex("audit_logs", "IDX_audit_logs_createdAt");
    await queryRunner.dropIndex("audit_logs", "IDX_audit_logs_userId");
    await queryRunner.dropIndex("audit_logs", "IDX_audit_logs_entityId");
    await queryRunner.dropIndex("audit_logs", "IDX_audit_logs_entityType");
    await queryRunner.dropIndex("audit_logs", "IDX_audit_logs_action");

    // Drop table
    await queryRunner.dropTable("audit_logs");
  }
}
