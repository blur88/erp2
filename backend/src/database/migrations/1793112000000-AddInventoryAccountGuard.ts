import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryAccountGuard1793112000000 implements MigrationInterface {
  name = 'AddInventoryAccountGuard1793112000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE journal_entry_open_postings ("entryId" uuid PRIMARY KEY REFERENCES journal_entry(id) ON DELETE CASCADE)`);
    await q.query(`CREATE FUNCTION inventory_account_backing_check() RETURNS trigger AS $$
      DECLARE inv uuid; e uuid; deb numeric; cred numeric; pdeb numeric; pcred numeric; backed boolean;
      BEGIN
        IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NULL; END IF;
        inv := (SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true); e := NEW."entryId";
        IF TG_OP='INSERT' AND NEW."accountId" IS DISTINCT FROM inv THEN RETURN NULL; END IF;
        IF TG_OP='UPDATE' AND NEW."accountId" IS DISTINCT FROM inv AND OLD."accountId" IS DISTINCT FROM inv THEN RETURN NULL; END IF;
        SELECT COALESCE(SUM(debit),0),COALESCE(SUM(credit),0) INTO deb,cred FROM journal_entry_line WHERE "entryId"=e AND "accountId"=inv AND "deletedAt" IS NULL AND "isActive"=true;
        SELECT COALESCE(SUM(CASE WHEN value>0 THEN value ELSE 0 END),0),COALESCE(SUM(CASE WHEN value<0 THEN -value ELSE 0 END),0) INTO pdeb,pcred FROM stock_valuation_entries WHERE "journalEntryId"=e;
        backed := EXISTS(SELECT 1 FROM stock_valuation_entries WHERE "journalEntryId"=e) AND deb=pdeb AND cred=pcred;
        IF NOT backed THEN
          backed := EXISTS(SELECT 1 FROM inventory_reconciliations r WHERE r."correctingEntryId"=e AND r.status='applied') AND NOT EXISTS (
            (SELECT "accountId",debit,credit FROM journal_entry_line WHERE "entryId"=e AND "deletedAt" IS NULL AND "isActive"=true
             EXCEPT ALL SELECT "accountId",debit,credit FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=(SELECT id FROM inventory_reconciliations WHERE "correctingEntryId"=e AND status='applied'))
            UNION ALL
            (SELECT "accountId",debit,credit FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=(SELECT id FROM inventory_reconciliations WHERE "correctingEntryId"=e AND status='applied')
             EXCEPT ALL SELECT "accountId",debit,credit FROM journal_entry_line WHERE "entryId"=e AND "deletedAt" IS NULL AND "isActive"=true)
          );
        END IF;
        IF NOT backed THEN RAISE EXCEPTION 'journal entry % posts to the inventory control account without valuation or reconciliation backing',e USING ERRCODE='check_violation'; END IF;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE CONSTRAINT TRIGGER trg_journal_line_inventory_backing AFTER INSERT OR UPDATE ON journal_entry_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_account_backing_check()`);
    await q.query(`CREATE FUNCTION inventory_journal_line_protect() RETURNS trigger AS $$
      DECLARE inv uuid;
      BEGIN
        IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN COALESCE(NEW,OLD); END IF;
        inv := (SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true);
        IF EXISTS(SELECT 1 FROM journal_entry_line WHERE "entryId"=OLD."entryId" AND "accountId"=inv ) THEN RAISE EXCEPTION 'journal line % belongs to a protected inventory posting',OLD.id USING ERRCODE='check_violation'; END IF;
        IF TG_OP='UPDATE' AND NEW."accountId"=inv AND OLD."accountId"<>inv THEN RAISE EXCEPTION 'cannot move a journal line onto the inventory control account' USING ERRCODE='check_violation'; END IF;
        RETURN COALESCE(NEW,OLD);
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_journal_line_protect BEFORE UPDATE OR DELETE ON journal_entry_line FOR EACH ROW EXECUTE FUNCTION inventory_journal_line_protect()`);
    await q.query(`CREATE FUNCTION inventory_journal_entry_protect() RETURNS trigger AS $$
      DECLARE inv uuid;
      BEGIN
        IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN COALESCE(NEW,OLD); END IF;
        inv := (SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true);
        IF EXISTS(SELECT 1 FROM journal_entry_line WHERE "entryId"=OLD.id AND "accountId"=inv) THEN RAISE EXCEPTION 'journal entry % is a protected inventory posting',OLD.id USING ERRCODE='check_violation'; END IF;
        RETURN COALESCE(NEW,OLD);
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_journal_entry_protect BEFORE UPDATE OR DELETE ON journal_entry FOR EACH ROW EXECUTE FUNCTION inventory_journal_entry_protect()`);
    await q.query(`CREATE FUNCTION journal_entry_open_posting_mark() RETURNS trigger AS $$ BEGIN IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NEW; END IF; INSERT INTO journal_entry_open_postings("entryId") VALUES (NEW.id); RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_journal_entry_open_posting_mark AFTER INSERT ON journal_entry FOR EACH ROW EXECUTE FUNCTION journal_entry_open_posting_mark()`);
    await q.query(`CREATE FUNCTION journal_entry_open_posting_clear() RETURNS trigger AS $$ BEGIN DELETE FROM journal_entry_open_postings WHERE "entryId"=NEW."entryId"; RETURN NULL; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE CONSTRAINT TRIGGER trg_journal_entry_open_posting_clear AFTER INSERT ON journal_entry_open_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_open_posting_clear()`);
    await q.query(`CREATE FUNCTION journal_entry_open_posting_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'open-posting records cannot be changed' USING ERRCODE='check_violation'; END IF;
        IF TG_OP='INSERT' AND (pg_trigger_depth()<>2 OR NOT EXISTS(SELECT 1 FROM journal_entry e WHERE e.id=NEW."entryId" AND NOT EXISTS(SELECT 1 FROM journal_entry_line l WHERE l."entryId"=e.id))) THEN RAISE EXCEPTION 'open-posting records are written only by the journal entry trigger' USING ERRCODE='check_violation'; END IF;
        IF TG_OP='DELETE' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'open-posting records cannot be deleted directly' USING ERRCODE='check_violation'; END IF;
        RETURN COALESCE(NEW,OLD);
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_journal_entry_open_posting_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_open_postings FOR EACH ROW EXECUTE FUNCTION journal_entry_open_posting_guard()`);
    await q.query(`CREATE FUNCTION inventory_journal_line_no_append() RETURNS trigger AS $$
      DECLARE inv uuid; member boolean; has_inventory boolean;
      BEGIN
        IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NEW; END IF;
        inv := (SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true);
        IF inv IS NULL THEN RAISE EXCEPTION 'inventory control account is not configured' USING ERRCODE='check_violation'; END IF;
        SELECT EXISTS(SELECT 1 FROM journal_entry_open_postings WHERE "entryId"=NEW."entryId") INTO member;
        SELECT EXISTS(SELECT 1 FROM journal_entry_line WHERE "entryId"=NEW."entryId" AND "accountId"=inv) INTO has_inventory;
        IF member IS TRUE OR has_inventory IS FALSE THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'journal entry % is finalized; lines cannot be added to a protected inventory posting',NEW."entryId" USING ERRCODE='check_violation';
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_journal_line_no_append BEFORE INSERT ON journal_entry_line FOR EACH ROW EXECUTE FUNCTION inventory_journal_line_no_append()`);
    await q.query(`CREATE FUNCTION inventory_truncate_protect() RETURNS trigger AS $$ BEGIN IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NULL; END IF; RAISE EXCEPTION 'TRUNCATE is forbidden while inventory valuation is active' USING ERRCODE='check_violation'; END; $$ LANGUAGE plpgsql`);
    for(const table of ['journal_entry','journal_entry_line','stock_valuation_entries','inventory_layer_consumptions','inventory_cutover_batch_releases']) await q.query(`CREATE TRIGGER trg_inventory_truncate_protect BEFORE TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION inventory_truncate_protect()`);
    await q.query(`CREATE FUNCTION inventory_account_setting_protect() RETURNS trigger AS $$ BEGIN IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NEW; END IF; IF NEW."inventoryAccountId" IS DISTINCT FROM OLD."inventoryAccountId" THEN RAISE EXCEPTION 'inventory control account cannot be changed while valuation is active' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_account_setting_protect BEFORE UPDATE ON accounting_settings FOR EACH ROW EXECUTE FUNCTION inventory_account_setting_protect()`);
  }
  async down(q: QueryRunner): Promise<void> {
    for(const table of ['journal_entry','journal_entry_line','stock_valuation_entries','inventory_layer_consumptions','inventory_cutover_batch_releases']) await q.query(`DROP TRIGGER trg_inventory_truncate_protect ON ${table}`);
    for(const [trigger,table] of [['trg_inventory_account_setting_protect','accounting_settings'],['trg_inventory_journal_line_no_append','journal_entry_line'],['trg_inventory_journal_entry_protect','journal_entry'],['trg_inventory_journal_line_protect','journal_entry_line'],['trg_journal_entry_open_posting_mark','journal_entry'],['trg_journal_entry_open_posting_clear','journal_entry_open_postings'],['trg_journal_entry_open_posting_guard','journal_entry_open_postings'],['trg_journal_line_inventory_backing','journal_entry_line']]) await q.query(`DROP TRIGGER ${trigger} ON ${table}`);
    for(const fn of ['inventory_account_setting_protect','inventory_truncate_protect','inventory_journal_line_no_append','inventory_journal_entry_protect','inventory_journal_line_protect','journal_entry_open_posting_mark','journal_entry_open_posting_clear','journal_entry_open_posting_guard','inventory_account_backing_check']) await q.query(`DROP FUNCTION ${fn}()`);
    await q.query('DROP TABLE journal_entry_open_postings');
  }
}
