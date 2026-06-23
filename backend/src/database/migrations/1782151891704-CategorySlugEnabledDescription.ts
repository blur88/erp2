import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategorySlugEnabledDescription1782151891704 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add columns (slug nullable initially, no unique index yet)
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "slug" character varying(140)`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "isEnabled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "description" text`);

    // 2. Hard-restore soft-deleted categories BEFORE backfill so they get slugs too.
    await queryRunner.query(
      `UPDATE "categories" SET "deletedAt" = NULL, "isActive" = true WHERE "deletedAt" IS NOT NULL OR "isActive" = false`,
    );

    // 3. Deterministic slug backfill with collision suffixing (base, base-1, base-2, ...)
    const rows: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT "id", "name" FROM "categories" ORDER BY "createdAt" ASC`,
    );
    const used = new Set<string>();
    const slugify = (input: string): string => {
      const safe = (input || '').slice(0, 256).toLowerCase();
      let result = '';
      let prevDash = false;
      for (const ch of safe) {
        const code = ch.charCodeAt(0);
        if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
          result += ch;
          prevDash = false;
        } else if (ch === ' ' || ch === '-' || ch === '_') {
          if (!prevDash) { result += '-'; prevDash = true; }
        }
      }
      let start = 0; let end = result.length;
      while (start < end && result[start] === '-') start++;
      while (end > start && result[end - 1] === '-') end--;
      const truncated = result.slice(start, end) || 'entity';
      return truncated.slice(0, 130); // leave room for collision suffix
    };
    for (const row of rows) {
      const base = slugify(row.name);
      let slug = base;
      let counter = 1;
      while (used.has(slug)) {
        slug = `${base}-${counter++}`;
      }
      used.add(slug);
      await queryRunner.query(`UPDATE "categories" SET "slug" = $1 WHERE "id" = $2`, [slug, row.id]);
    }

    // 4. Enforce NOT NULL + unique index after backfill
    await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_categories_slug" ON "categories" ("slug")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_categories_slug"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "isEnabled"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "slug"`);
  }
}
