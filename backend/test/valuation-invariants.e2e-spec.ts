import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { seedCategory } from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAMES, removeSuiteAdmin, seedSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import { deactivateValuationForTest } from './utils/valuation-fixture';

dotenv.config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), quiet: true });
const scriptPath = fileURLToPath(new URL('../scripts/check-inventory-valuation-invariants.sql', import.meta.url));
const USERNAME = E2E_ADMIN_USERNAMES.stockUnreceive;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe('inventory valuation invariant report',()=>{
  let app:INestApplication;let ds:DataSource;let token:string;let categoryId:string;let originalMethod:string;
  const productIds:string[]=[];const auth=()=>({Authorization:`Bearer ${token}`});
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();configureTestAppValidation(app);await app.init();ds=app.get(DataSource);
    await seedSuiteAdmin(ds,USERNAME);categoryId=(await seedCategory(ds,`valuation-invariants-${RUN}`)).id;
    const [settings]=await ds.query(`SELECT "costingMethod" FROM regional_settings ORDER BY "createdAt" LIMIT 1`);originalMethod=settings.costingMethod;
    const login=await request(app.getHttpServer()).post('/auth/login').set(...SESSION_PROTOCOL).send({usernameOrEmail:USERNAME,password:E2E_ADMIN_PASSWORD}).expect(200);token=login.body?.data?.accessToken??login.body?.accessToken;
  });
  afterEach(async()=>{if(ds?.isInitialized){await deactivateValuationForTest(ds);if(productIds.length){const movements=await ds.query(`SELECT id FROM stock_movements WHERE "productId"=ANY($1)`,[productIds]);const entries=await ds.query(`SELECT id FROM journal_entry WHERE "sourceEventId"=ANY($1)`,[movements.length?movements.map((r:any)=>r.id):['00000000-0000-0000-0000-000000000000']]);await ds.query(`DELETE FROM journal_entry WHERE id=ANY($1)`,[entries.map((r:any)=>r.id)]);}await ds.query(`UPDATE regional_settings SET "costingMethod"=$1`,[originalMethod]);}});
  afterAll(async()=>{
    if(ds?.isInitialized){const zero='00000000-0000-0000-0000-000000000000';const movements=await ds.query(`SELECT id FROM stock_movements WHERE "productId"=ANY($1)`,[productIds.length?productIds:[zero]]);const entries=await ds.query(`SELECT id FROM journal_entry WHERE "sourceEventId"=ANY($1)`,[movements.length?movements.map((r:any)=>r.id):[zero]]);await ds.query(`DELETE FROM journal_entry WHERE id=ANY($1)`,[entries.map((r:any)=>r.id)]);await removeSuiteTraces(ds,{usernames:[USERNAME],entityIds:[categoryId,...productIds,...movements.map((r:any)=>r.id)]});await resetSuiteBusinessRows(ds,{categoryIds:[categoryId],productIds});await removeSuiteAdmin(ds,USERNAME);}await app.close();
  });
  it.each(['AVERAGE','FIFO'] as const)('reports all five invariants under %s',async(method)=>{
    await ds.query(`UPDATE regional_settings SET "costingMethod"=$1`,[method]);
    await ds.query(`UPDATE inventory_valuation_state SET status='active',"activatedAt"=now(),"pausedAt"=NULL WHERE id=true`);
    const response=await request(app.getHttpServer()).post('/inventory/products').set(auth()).send({name:`Invariant ${method} ${RUN}`,categoryId,type:'Stocked Product',stockQuantity:2,baseCost:10}).expect(201);
    const productId=(response.body.data??response.body).id;productIds.push(productId);
    const sql=readFileSync(scriptPath,'utf8');
    const output=execFileSync('docker',['run','--rm','--network','host','-i','-e','PGPASSWORD','postgres:18.3-alpine3.23','psql','-X','-At','-F','|','-h',process.env.DB_HOST||'localhost','-p',process.env.DB_PORT||'5432','-U',process.env.DB_USERNAME||'erp_user','-d',process.env.DB_DATABASE||'erp_db_test','-f','-'],{input:sql,encoding:'utf8',env:{...process.env,PGPASSWORD:process.env.DB_PASSWORD}});
    const checks=output.trim().split('\n').filter((line)=>/^[1-5]\|/.test(line));
    expect(checks).toHaveLength(5);
    expect(checks.every((line)=>line.includes('|PASS|'))).toBe(true);
  });
});
