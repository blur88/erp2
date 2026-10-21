import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { InventoryReconciliationService } from '../src/modules/inventory/valuation/inventory-reconciliation.service';

let app: INestApplication; let ds: DataSource; let service: InventoryReconciliationService;
let categoryId:string; let productId:string; let reconciliationId:string|null=null; let keepFixture=false;
beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();ds=app.get(DataSource);service=app.get(InventoryReconciliationService);});
beforeEach(async()=>{
  categoryId=randomUUID();productId=randomUUID();keepFixture=false;
  await ds.query(`INSERT INTO categories (id,name,slug) VALUES ($1,$2,$3)`,[categoryId,`rec-${categoryId}`,`rec-${categoryId}`]);
  await ds.query(`INSERT INTO products (id,name,slug,type,"baseCost","stockQuantity","categoryId") VALUES ($1,$2,$3,'Stocked Product',2,2,$4)`,[productId,`rec-${productId}`,`rec-${productId}`,categoryId]);
  await ds.query(`INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,2,0,2,2,2,now())`,[productId]);
});
afterEach(async()=>{
  if(!keepFixture){
    if(reconciliationId){await ds.query(`UPDATE inventory_reconciliations SET status='proposed',"approvedByUserId"=NULL,"approvedAt"=NULL,"contentHash"=NULL WHERE id=$1 AND status='approved'`,[reconciliationId]);await ds.query(`DELETE FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=$1`,[reconciliationId]);await ds.query(`DELETE FROM inventory_opening_position_batches WHERE "positionId" IN (SELECT id FROM inventory_opening_positions WHERE "reconciliationId"=$1)`,[reconciliationId]);await ds.query(`DELETE FROM inventory_opening_positions WHERE "reconciliationId"=$1`,[reconciliationId]);await ds.query(`DELETE FROM inventory_reconciliations WHERE id=$1`,[reconciliationId]);reconciliationId=null;}
    await ds.query(`DELETE FROM purchase_cost_history WHERE "productId"=$1`,[productId]);await ds.query(`DELETE FROM products WHERE id=$1`,[productId]);await ds.query(`DELETE FROM categories WHERE id=$1`,[categoryId]);
  }
});afterAll(async()=>app.close());

describe('Inventory reconciliation records',()=>{
  it('prefills batches, reports readiness failures, and protects approved content until reopen',async()=>{
    const rec=await service.create({userId:'00000000-0000-4000-8000-000000000001'});reconciliationId=rec.id;
    const position=rec.positions.find((p:any)=>p.productId===productId);
    expect(position).toMatchObject({approvedQuantity:'2.0000',approvedValue:'4.00',uncoveredQuantity:'0.0000'});
    expect(position.batches).toHaveLength(1);
    const readiness=await service.readiness(rec.id);
    expect(readiness.conditions.some((check:any)=>!check.ok)).toBe(true);
    expect(readiness.conditions.find((check:any)=>check.condition.includes('costs are reviewed')).ok).toBe(false);
    await ds.query(`UPDATE inventory_reconciliations SET status='approved' WHERE id=$1`,[rec.id]);
    await expect(ds.query(`UPDATE inventory_opening_positions SET "approvedValue"=5 WHERE id=$1`,[position.id])).rejects.toThrow(/immutable/i);
    await ds.query(`UPDATE inventory_reconciliations SET status='proposed',"approvedByUserId"=NULL,"approvedAt"=NULL,"contentHash"=NULL WHERE id=$1`,[rec.id]);
    await ds.query(`UPDATE inventory_opening_positions SET "approvedValue"=5 WHERE id=$1`,[position.id]);
  });

  it('requires a separate approver and approves only a fully reconciled snapshot',async()=>{
    const preparer='00000000-0000-4000-8000-000000000011';
    const approver='00000000-0000-4000-8000-000000000012';
    const rec=await service.create({userId:preparer});reconciliationId=rec.id;
    const position=rec.positions.find((p:any)=>p.productId===productId);
    const batch=position.batches[0];
    await service.patchPosition(rec.id,productId,{batches:[{batchId:batch.batchId,costEvidence:'supported'}]});
    const [accounts]=await ds.query(`SELECT "inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`);
    await service.putJournalLines(rec.id,[
      {accountId:accounts.inventoryAccountId,debit:'4.00',credit:'0.00',explanation:'Opening inventory'},
      {accountId:accounts.openingBalanceEquityAccountId,debit:'0.00',credit:'4.00',explanation:'Opening equity'},
    ]);
    await expect(service.approve(rec.id,{userId:preparer})).rejects.toThrow(/different user/i);
    const approved=await service.approve(rec.id,{userId:approver});
    expect(approved.status).toBe('approved');
    expect((await service.readiness(rec.id)).conditions.every((condition:any)=>condition.ok)).toBe(true);
    await expect(ds.query(`UPDATE inventory_reconciliation_journal_lines SET explanation='tampered' WHERE "reconciliationId"=$1`,[rec.id])).rejects.toThrow(/immutable/i);
    const reopened=await service.reopen(rec.id);
    expect(reopened.status).toBe('proposed');
    expect(reopened.contentHash).toBeNull();
  });

  it('reports each independent approval failure and keeps explanations out of the exact-difference test',async()=>{
    const preparer='00000000-0000-4000-8000-000000000021';
    const approver='00000000-0000-4000-8000-000000000022';
    const rec=await service.create({userId:preparer});reconciliationId=rec.id;
    const position=rec.positions.find((p:any)=>p.productId===productId);
    const batch=position.batches[0];
    await service.patchPosition(rec.id,productId,{batches:[{batchId:batch.batchId,costEvidence:'supported'}]});
    const [accounts]=await ds.query(`SELECT "inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`);
    await service.putJournalLines(rec.id,[
      {accountId:accounts.inventoryAccountId,debit:'5.00',credit:'0.00',explanation:'Inventory'},
      {accountId:accounts.openingBalanceEquityAccountId,debit:'0.00',credit:'5.00',explanation:'Equity'},
    ],'Explained difference');
    await expect(service.approve(rec.id,{userId:approver})).rejects.toThrow(/inventory control balance reconciles exactly/i);

    await service.putJournalLines(rec.id,[
      {accountId:accounts.inventoryAccountId,debit:'4.00',credit:'0.00',explanation:'Inventory'},
      {accountId:accounts.openingBalanceEquityAccountId,debit:'0.00',credit:'3.00',explanation:'Equity'},
    ]);
    await expect(service.approve(rec.id,{userId:approver})).rejects.toThrow(/journal lines balance/i);

    await service.putJournalLines(rec.id,[]);
    await service.patchPosition(rec.id,productId,{approvedQuantity:'3.0000'});
    await expect(service.approve(rec.id,{userId:approver})).rejects.toThrow(/approved quantity matches current stockQuantity/i);
  });

  it('prefills shortfalls and excesses, lists accepted evidence, and preserves aborted records',async()=>{
    await ds.query(`UPDATE products SET "stockQuantity"=3 WHERE id=$1`,[productId]);
    const rec=await service.create({userId:'00000000-0000-4000-8000-000000000031'});reconciliationId=rec.id;
    const position=rec.positions.find((p:any)=>p.productId===productId);
    expect(position.uncoveredQuantity).toBe('1.0000');
    expect((await service.preparationReport(rec.id)).unsupportedCosts).toHaveLength(2);
    await service.patchPosition(rec.id,productId,{uncoveredUnitCost:'2.0000',uncoveredCostEvidence:'accepted_without_evidence',evidence:'Accepted during cutover review',batches:[{batchId:position.batches[0].batchId,costEvidence:'accepted_without_evidence',note:'Supplier evidence unavailable'}]});
    const readiness=await service.readiness(rec.id);
    expect(readiness.acceptedWithoutEvidence).toEqual(expect.arrayContaining([
      {productId,batchId:position.batches[0].batchId,note:'Supplier evidence unavailable'},
      {productId,batchId:'shortfall',note:'Accepted during cutover review'},
    ]));
    await expect(ds.query(`UPDATE inventory_opening_position_batches SET "releaseQuantity"=3 WHERE "positionId"=$1`,[position.id])).rejects.toThrow();
    await expect(service.create({userId:'00000000-0000-4000-8000-000000000032'})).rejects.toThrow(/already exists/i);
    await service.abort(rec.id);
    expect((await service.findOne(rec.id)).positions).toHaveLength(1);
    keepFixture=true;
  });

  it('does not silently accept batch quantity in excess of current stock',async()=>{
    await ds.query(`UPDATE products SET "stockQuantity"=1 WHERE id=$1`,[productId]);
    const rec=await service.create({userId:'00000000-0000-4000-8000-000000000041'});reconciliationId=rec.id;
    const position=rec.positions.find((p:any)=>p.productId===productId);
    expect(position.approvedQuantity).toBe('1.0000');
    expect(position.batches[0].remainingQuantity).toBe('2.0000');
    const readiness=await service.readiness(rec.id);
    expect(readiness.conditions.find((condition:any)=>condition.condition.includes('batch releases'))?.ok).toBe(false);
    await expect(service.approve(rec.id,{userId:'00000000-0000-4000-8000-000000000042'})).rejects.toThrow(/batch releases and uncovered quantities/i);
  });
});
