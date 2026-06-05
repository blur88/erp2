import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSearchAnalyticsTables1774245930223 implements MigrationInterface {
  name = "AddSearchAnalyticsTables1774245930223";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "search_queries" ("id" uuid NOT NULL, "query" character varying(500) NOT NULL, "user_id" uuid NOT NULL, "result_count" integer NOT NULL, "execution_time_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2945172d2d9a9f6b2339dd036e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4981129d48833f45cc3e70f06b" ON "search_queries" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b3f9a7099bd43b431de8e95dca" ON "search_queries" ("result_count", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65121ce59bf1c4494a6dba198f" ON "search_queries" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "search_clicks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "search_query_id" uuid, "query" character varying(500) NOT NULL, "result_type" character varying(100) NOT NULL, "result_id" character varying(255) NOT NULL, "result_label" character varying(255), "position" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_93b47d43bd22156a7208dcc8a3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ccac1b7ddd1b101f17845a6ce" ON "search_clicks" ("search_query_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8dc36f8afc4975f27074d0bf5c" ON "search_clicks" ("created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "search_clicks" ADD CONSTRAINT "FK_2ccac1b7ddd1b101f17845a6ced" FOREIGN KEY ("search_query_id") REFERENCES "search_queries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_clicks" DROP CONSTRAINT "FK_2ccac1b7ddd1b101f17845a6ced"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8dc36f8afc4975f27074d0bf5c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2ccac1b7ddd1b101f17845a6ce"`,
    );
    await queryRunner.query(`DROP TABLE "search_clicks"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_65121ce59bf1c4494a6dba198f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b3f9a7099bd43b431de8e95dca"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4981129d48833f45cc3e70f06b"`,
    );
    await queryRunner.query(`DROP TABLE "search_queries"`);
  }
}
