import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuthSessions1791192423011 implements MigrationInterface {
    name = 'AddAuthSessions1791192423011'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "refresh_tokens"`);
        await queryRunner.query(`CREATE TABLE "auth_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "userId" uuid NOT NULL, "generation" integer NOT NULL DEFAULT '1', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokeReason" character varying(32), "rememberMe" boolean NOT NULL DEFAULT false, "ipAddress" character varying(45), "deviceInfo" text, CONSTRAINT "CHK_973ce06ae3eda6e708e923e629" CHECK (("revokedAt" IS NULL) = ("revokeReason" IS NULL)), CONSTRAINT "CHK_0293bf5fe77fee9896b1165314" CHECK ("revokeReason" IS NULL OR "revokeReason" IN ('logout','password_change','replay','key_retired')), CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."userId" IS 'Foreign key to users table'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."generation" IS 'Current generation of refresh token'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."expiresAt" IS 'Session expiration timestamp'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."revokedAt" IS 'Timestamp when session was revoked'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."revokeReason" IS 'Reason for session revocation'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."rememberMe" IS 'Whether session was created with rememberMe option'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."ipAddress" IS 'IP address where session was created'`);
        await queryRunner.query(`COMMENT ON COLUMN "auth_sessions"."deviceInfo" IS 'Device user agent where session was created'`);
        await queryRunner.query(`CREATE INDEX "IDX_4d5b325649caf1628a6e2e2be1" ON "auth_sessions" ("expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_925b24d7fc2f9324ce972aee02" ON "auth_sessions" ("userId")`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "sessionId" uuid NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."sessionId" IS 'Foreign key to auth_sessions table'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "generation" integer NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."generation" IS 'Generation number within the session'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."issuedAt" IS 'Timestamp when token was issued'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "keyId" character varying(32) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."keyId" IS 'Key ID used to sign the token'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "supersededAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."supersededAt" IS 'Timestamp when token was superseded by rotation'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "graceUntil" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."graceUntil" IS 'Timestamp until which superseded token can recover'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b64ca787f54f75cb631d675f03" ON "refresh_tokens" ("sessionId", "generation")`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "CHK_a62312d90640dd322f9dbc4798" CHECK (("supersededAt" IS NULL) = ("graceUntil" IS NULL))`);
        await queryRunner.query(`ALTER TABLE "auth_sessions" ADD CONSTRAINT "FK_925b24d7fc2f9324ce972aee025" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_b25a58a00578bd1b7a01623d2dd" FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "refresh_tokens"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_b25a58a00578bd1b7a01623d2dd"`);
        await queryRunner.query(`ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_925b24d7fc2f9324ce972aee025"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "CHK_a62312d90640dd322f9dbc4798"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b64ca787f54f75cb631d675f03"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."graceUntil" IS 'Timestamp until which superseded token can recover'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "graceUntil"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."supersededAt" IS 'Timestamp when token was superseded by rotation'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "supersededAt"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."keyId" IS 'Key ID used to sign the token'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "keyId"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."issuedAt" IS 'Timestamp when token was issued'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "issuedAt"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."generation" IS 'Generation number within the session'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "generation"`);
        await queryRunner.query(`COMMENT ON COLUMN "refresh_tokens"."sessionId" IS 'Foreign key to auth_sessions table'`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "sessionId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_925b24d7fc2f9324ce972aee02"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4d5b325649caf1628a6e2e2be1"`);
        await queryRunner.query(`DROP TABLE "auth_sessions"`);
    }
}
