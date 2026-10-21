import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CostingMethodChangeService } from '../src/modules/inventory/valuation/costing-method-change.service';
import { activateValuationForTest, deactivateValuationForTest } from './utils/valuation-fixture';

let app: INestApplication;
let ds: DataSource;
let service: CostingMethodChangeService;
let productId: string;
let categoryId: string;
let originalMethod: string;
let changeId: string | null = null;

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication(); await app.init();
  ds = app.get(DataSource); service = app.get(CostingMethodChangeService);
});
beforeEach(async () => {
  const [settings] = await ds.query(`SELECT "costingMethod" FROM regional_settings ORDER BY "createdAt" LIMIT 1`);
  originalMethod = settings.costingMethod;
  await ds.query(`UPDATE regional_settings SET "costingMethod"='AVERAGE'`);
  categoryId = randomUUID(); productId = randomUUID();
  await ds.query(`INSERT INTO categories (id,name,slug) VALUES ($1,$2,$3)`,[categoryId,`mc-${categoryId}`,`mc-${categoryId}`]);
  await ds.query(`INSERT INTO products (id,name,slug,type,"baseCost","stockQuantity","categoryId") VALUES ($1,$2,$3,'Stocked Product',1,3,$4)`,[productId,`mc-${productId}`,`mc-${productId}`,categoryId]);
  await ds.query(`INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,10,0,10,1,1,now()-interval '1 day'),($1,10,0,10,2,2,now())`,[productId]);
});
afterEach(async () => {
  await deactivateValuationForTest(ds);
  if (changeId) { await ds.query(`DELETE FROM costing_method_change_products WHERE "changeId"=$1`,[changeId]); await ds.query(`DELETE FROM costing_method_changes WHERE id=$1`,[changeId]); changeId=null; }
  await ds.query(`DELETE FROM purchase_cost_history WHERE "productId"=$1`,[productId]);
  await ds.query(`DELETE FROM products WHERE id=$1`,[productId]);
  await ds.query(`DELETE FROM categories WHERE id=$1`,[categoryId]);
  await ds.query(`UPDATE regional_settings SET "costingMethod"=$1`,[originalMethod]);
});
afterAll(async () => app.close());

describe('Costing method changes', () => {
  it('applies an approved method change only while valuation is paused and preserves total value', async () => {
    await activateValuationForTest(ds, { method: 'AVERAGE', products: [{ productId, quantity: '3.0000', value: '10.00' }] });
    const [dateRow]=await ds.query(`SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur','YYYY-MM-DD') AS today`); const today=dateRow.today;
    const preparer={userId:'00000000-0000-4000-8000-000000000001'};
    const record=await service.propose({toMethod:'FIFO',effectiveDate:today,explanation:'Approved conversion'},preparer);
    changeId=record.id;
    await service.approve(record.id,{userId:'00000000-0000-4000-8000-000000000002'});
    await expect(ds.transaction((m)=>service.applyApproved(m,record.id))).rejects.toThrow(/must be paused/i);
    const entriesBefore=await ds.query(`SELECT id,kind,method,quantity::text,value::text FROM stock_valuation_entries WHERE "productId"=$1 ORDER BY "createdAt",id`,[productId]);
    await ds.query(`UPDATE inventory_valuation_state SET "pausedAt"=now() WHERE id=true`);
    await ds.transaction((m)=>service.applyApproved(m,record.id));
    const [balance]=await ds.query(`SELECT method,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,[productId]);
    expect(balance).toEqual({method:'FIFO',value:'10.00'});
    const after=await ds.query(`SELECT id,kind,method,quantity::text,value::text FROM stock_valuation_entries WHERE "productId"=$1 AND kind<>'method_change' ORDER BY "createdAt",id`,[productId]);
    expect(after).toEqual(entriesBefore);
    const layers=await ds.query(`SELECT "remainingQuantity"::text AS quantity,"remainingValue"::text AS value,"sourceEntryId" FROM inventory_cost_layers WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "createdAt",id`,[productId]);
    expect(layers.map((row:any)=>row.value)).toEqual(['3.33','6.67']);
    const [methodEntry]=await ds.query(`SELECT id FROM stock_valuation_entries WHERE "productId"=$1 AND kind='method_change'`,[productId]);
    expect(layers.every((layer:any)=>layer.sourceEntryId===methodEntry.id)).toBe(true);
  });

  it('snapshots preview and requires a different approver; edits clear approval', async () => {
    await activateValuationForTest(ds,{method:'AVERAGE',products:[{productId,quantity:'3.0000',value:'10.00'}]});
    const effectiveDate = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const preparer={userId:'00000000-0000-4000-8000-000000000001'};
    const record=await service.propose({toMethod:'FIFO',effectiveDate,explanation:'Documented costing change'},preparer);
    changeId=record.id;
    expect(record.products[0].layersAfter.map((layer:any)=>layer.value)).toEqual(['3.33','6.67']);
    await expect(service.approve(record.id,preparer)).rejects.toThrow('The approver must be a different user from the preparer.');
    const approved=await service.approve(record.id,{userId:'00000000-0000-4000-8000-000000000002'});
    expect(approved.status).toBe('approved');
    const edited=await service.edit(record.id,{explanation:'Updated explanation'},preparer);
    expect(edited.status).toBe('proposed'); expect(edited.contentHash).toBeNull(); expect(edited.approvedByUserId).toBeNull();
  });
});
