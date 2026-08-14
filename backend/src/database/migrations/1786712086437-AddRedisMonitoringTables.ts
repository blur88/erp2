import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRedisMonitoringTables1786712086437 implements MigrationInterface {
    name = 'AddRedisMonitoringTables1786712086437'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "redis_alert_state" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "redisRunId" character varying(255) NOT NULL, "pressureState" character varying(32) NOT NULL DEFAULT 'insufficient-samples', "activeEpisode" jsonb, "recentEpisodes" jsonb NOT NULL DEFAULT '[]'::jsonb, "oomBaselineValue" bigint, "oomObservedValue" bigint, "oomAcknowledgedValue" bigint, "oomIncidentStartedAt" TIMESTAMP WITH TIME ZONE, "oomLastIncreaseAt" TIMESTAMP WITH TIME ZONE, "oomUnacknowledgedDelta" bigint NOT NULL DEFAULT '0', "oomLastAcknowledgedAt" TIMESTAMP WITH TIME ZONE, "oomLastAcknowledgedBy" character varying(255), "oomLastAcknowledgedByLabel" character varying(255), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d6d5077be8e240930145a3da3cd" UNIQUE ("redisRunId"), CONSTRAINT "PK_b493b0aa9ff5c6585e9a977c889" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "redis_memory_samples" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "instanceId" character varying(255) NOT NULL, "sampledAt" TIMESTAMP WITH TIME ZONE NOT NULL, "ok" boolean NOT NULL, "failureReason" character varying(32), "usedBytes" bigint, "maxBytes" bigint, "utilizationPercent" numeric(6,2), "evictedKeys" bigint, "oomErrors" bigint, CONSTRAINT "PK_2a34a17f9c1093ee069fd304bb5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ebd027bf06b9c20ae77903a593" ON "redis_memory_samples"  ("sampledAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_56eb0a0ddb8a1bb363d418c6bf" ON "redis_memory_samples"  ("instanceId", "sampledAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_56eb0a0ddb8a1bb363d418c6bf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ebd027bf06b9c20ae77903a593"`);
        await queryRunner.query(`DROP TABLE "redis_memory_samples"`);
        await queryRunner.query(`DROP TABLE "redis_alert_state"`);
    }

}
