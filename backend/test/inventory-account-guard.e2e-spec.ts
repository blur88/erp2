import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { deactivateValuationForTest } from './utils/valuation-fixture';

let app:INestApplication;let ds:DataSource;let entryIds:string[]=[];let categoryId:string;let productId:string;
beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();ds=app.get(DataSource);});
beforeEach(async()=>{entryIds=[];categoryId=randomUUID();productId=randomUUID();await ds.query(`INSERT INTO categories (id,name,slug) VALUES ($1,$2,$3)`,[categoryId,`guard-${categoryId}`,`guard-${categoryId}`]);await ds.query(`INSERT INTO products (id,name,slug,type,"baseCost","stockQuantity","categoryId") VALUES ($1,$2,$3,'Stocked Product',1,0,$4)`,[productId,`guard-${productId}`,`guard-${productId}`,categoryId]);});
afterEach(async()=>{await deactivateValuationForTest(ds);for(const id of entryIds)await ds.query(`DELETE FROM journal_entry WHERE id=$1`,[id]);await ds.query(`DELETE FROM products WHERE id=$1`,[productId]);await ds.query(`DELETE FROM categories WHERE id=$1`,[categoryId]);});afterAll(async()=>app.close());
async function makeEntry(withInventory:boolean,backed=true){const id=randomUUID();entryIds.push(id);const [a]=await ds.query(`SELECT * FROM accounting_settings WHERE id=true`);const equity=a.openingBalanceEquityAccountId;await ds.transaction(async m=>{await m.query(`INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'guard-test','OPENING_BALANCE','Guard test','test')`,[id,`JG-${id}`,randomUUID()]);if(withInventory){await m.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,0,0),($1,$3,0,0)`,[id,a.inventoryAccountId,equity]);if(backed) await m.query(`INSERT INTO stock_valuation_entries ("productId",kind,method,quantity,value,"runningQuantity","runningValue","journalEntryId") VALUES ($1,'method_change','AVERAGE',0,0,0,0,$2)`,[productId,id]);}else await m.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,[id,equity,a.cashAccountId]);});return id;}

describe('inventory control account guard',()=>{
  it('rejects raw unbacked inventory postings and finalized-entry appends; clears membership at commit',async()=>{
    await ds.query(`UPDATE inventory_valuation_state SET status='active',"activatedAt"=now() WHERE id=true`);
    await expect(makeEntry(true,false).then(()=>{throw new Error('expected commit to fail')})).rejects.toThrow(/without valuation or reconciliation backing/i);
    const id=await makeEntry(true);
    const [markers]=await ds.query(`SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,[id]);expect(markers.n).toBe(0);
    await expect(ds.query(`INSERT INTO journal_entry_open_postings ("entryId") VALUES ($1)`,[id])).rejects.toThrow(/written only by the journal entry trigger/i);
    await expect(ds.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,[id,(await ds.query(`SELECT "cashAccountId" FROM accounting_settings WHERE id=true`))[0].cashAccountId])).rejects.toThrow(/finalized/i);
    const [settings]=await ds.query(`SELECT "cashAccountId","inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`);
    await expect(ds.query(`UPDATE accounting_settings SET "inventoryAccountId"=$1 WHERE id=true`,[settings.cashAccountId])).rejects.toThrow(/cannot be changed/i);
    const lines=await ds.query(`SELECT id,"accountId" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,[id]);
    const equityLine=lines.find((line:any)=>line.accountId!==settings.inventoryAccountId);
    await expect(ds.query(`UPDATE journal_entry_line SET debit=1 WHERE id=$1`,[equityLine.id])).rejects.toThrow(/protected inventory posting/i);
    await expect(ds.query(`DELETE FROM journal_entry_line WHERE id=$1`,[equityLine.id])).rejects.toThrow(/protected inventory posting/i);
    await expect(ds.query(`DELETE FROM journal_entry WHERE id=$1`,[id])).rejects.toThrow(/protected inventory posting/i);
    await expect(ds.query(`TRUNCATE journal_entry_line CASCADE`)).rejects.toThrow(/TRUNCATE is forbidden/i);
    for(const sessionScope of [true,false]) {
      const error=await ds.transaction(async m=>{
        await m.query('SAVEPOINT forged_marker');
        await m.query(`SELECT set_config('erp.journal_entries_created_in_tx',$1,$2)`,[id,sessionScope]);
        let message='';
        try { await m.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,[id,settings.cashAccountId]); }
        catch(err:any) { message=err.message; }
        await m.query('ROLLBACK TO SAVEPOINT forged_marker');
        await m.query(`SELECT set_config('erp.journal_entries_created_in_tx','',false)`);
        await m.query('RELEASE SAVEPOINT forged_marker');
        return message;
      });
      expect(error).toMatch(/finalized/i);
    }
    await ds.query(`VACUUM (FREEZE) journal_entry, journal_entry_line`);
    await expect(ds.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,[id,settings.cashAccountId])).rejects.toThrow(/finalized/i);
    await ds.transaction(async m=>{
      const rolled=randomUUID();
      await m.query('SAVEPOINT rollback_entry');
      await m.query(`INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'savepoint','OPENING_BALANCE','rolled savepoint','test')`,[rolled,`JR-${rolled}`,randomUUID()]);
      await m.query('SAVEPOINT protect_marker');
      await expect(m.query(`UPDATE journal_entry_open_postings SET "entryId"=$1 WHERE "entryId"=$2`,[randomUUID(),rolled])).rejects.toThrow(/cannot be changed/i);
      await m.query('ROLLBACK TO SAVEPOINT protect_marker');
      await m.query('SAVEPOINT delete_marker');
      await expect(m.query(`DELETE FROM journal_entry_open_postings WHERE "entryId"=$1`,[rolled])).rejects.toThrow(/cannot be deleted directly/i);
      await m.query('ROLLBACK TO SAVEPOINT delete_marker');
      await m.query('ROLLBACK TO SAVEPOINT rollback_entry');
      const [gone]=await m.query(`SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,[rolled]);expect(gone.n).toBe(0);
      const kept=randomUUID();
      await m.query('SAVEPOINT release_entry');
      await m.query(`INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'savepoint','OPENING_BALANCE','released savepoint','test')`,[kept,`JR-${kept}`,randomUUID()]);
      await m.query('RELEASE SAVEPOINT release_entry');
      await m.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,[kept,settings.cashAccountId]);
      await m.query(`INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,0,1)`,[kept,settings.openingBalanceEquityAccountId]);
      entryIds.push(kept);
    });
    const [accountingSettings]=await ds.query(`SELECT "cashAccountId" FROM accounting_settings WHERE id=true`);
    await expect(ds.query(`INSERT INTO journal_entry_open_postings ("entryId") VALUES ($1)`,[id])).rejects.toThrow(/written only by the journal entry trigger/i);
    expect(accountingSettings.cashAccountId).toBe(settings.cashAccountId);
  });
});
