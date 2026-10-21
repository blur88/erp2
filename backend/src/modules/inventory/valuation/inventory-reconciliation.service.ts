import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { contentHash } from './approval-hash';
import { formatMoney, formatScale4, mulMinor, quantizeToCents, toMinorUnits } from '../../../common/utils/money';

@Injectable()
export class InventoryReconciliationService {
  constructor(private readonly ds: DataSource) {}

  async create(user: {userId:string}) {
    return this.ds.transaction(async m => {
      const open=await m.query(`SELECT id FROM inventory_reconciliations WHERE status IN ('proposed','approved') LIMIT 1`);
      if(open.length) throw new ConflictException('An open inventory reconciliation already exists.');
      const [settings]=await m.query(`SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`);
      const accountId=settings?.inventoryAccountId;
      if(!accountId) throw new ConflictException('The inventory control account is not configured.');
      const [account]=await m.query(`SELECT COALESCE(SUM(l.debit-l.credit),0)::text AS balance FROM journal_entry_line l WHERE l."accountId"=$1 AND l."deletedAt" IS NULL AND l."isActive"=true`,[accountId]);
      const opening=await m.query(`SELECT e.id,l.debit::text,l.credit::text FROM journal_entry e JOIN journal_entry_line l ON l."entryId"=e.id WHERE l."accountId"=$1 AND e."postingType"='OPENING_BALANCE' AND l."deletedAt" IS NULL`,[accountId]);
      const products=await m.query(`SELECT id,"stockQuantity"::text AS quantity FROM products WHERE type='Stocked Product' AND "stockQuantity">0 ORDER BY id`);
      const snapshotProducts:any[]=[];
      const [header]=await m.query(`INSERT INTO inventory_reconciliations (status,"preparedByUserId","controlAccountBalanceAtPreparation","openingBalanceEntries",snapshot) VALUES ('proposed',$1,$2,$3::jsonb,'{}') RETURNING *`,[user.userId,account.balance,JSON.stringify(opening)]);
      for(const product of products){
        const batches=await m.query(`SELECT id,"remainingQuantity"::text AS quantity,"landedCost"::text AS cost FROM purchase_cost_history WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "receivedDate",id`,[product.id]);
        let covered=0n, value=0n;
        for(const b of batches){ covered+=toMinorUnits(b.quantity); value+=mulMinor(toMinorUnits(b.quantity),toMinorUnits(b.cost)); }
        value=quantizeToCents(value);
        const stock=toMinorUnits(product.quantity); const uncovered=stock>covered?stock-covered:0n;
        const [position]=await m.query(`INSERT INTO inventory_opening_positions ("reconciliationId","productId","approvedQuantity","approvedValue","uncoveredQuantity") VALUES ($1,$2,$3,$4,$5) RETURNING id`,[header.id,product.id,product.quantity,formatMoney(value),formatScale4(uncovered)]);
        for(const b of batches) await m.query(`INSERT INTO inventory_opening_position_batches ("positionId","batchId","remainingQuantity","landedCost") VALUES ($1,$2,$3,$4)`,[position.id,b.id,b.quantity,b.cost]);
        snapshotProducts.push({productId:product.id,stockQuantity:product.quantity,batches:batches.map((b:any)=>({batchId:b.id,remainingQuantity:b.quantity}))});
      }
      const snapshot={products:snapshotProducts,inventoryAccountId:accountId,controlAccountBalance:account.balance};
      await m.query(`UPDATE inventory_reconciliations SET snapshot=$2::jsonb WHERE id=$1`,[header.id,JSON.stringify(snapshot)]);
      await this.recalculate(m,header.id);
      return this.findOne(header.id,m);
    });
  }

  async patchPosition(id:string,productId:string,dto:any){
    return this.ds.transaction(async m=>{
      const h=await this.requireOpen(m,id);
      if(h.status==='approved') await this.reopenRow(m,id);
      const [p]=await m.query(`SELECT * FROM inventory_opening_positions WHERE "reconciliationId"=$1 AND "productId"=$2`,[id,productId]);
      if(!p) throw new NotFoundException('Opening position not found');
      await m.query(`UPDATE inventory_opening_positions SET "approvedQuantity"=COALESCE($2,"approvedQuantity"),"approvedValue"=COALESCE($3,"approvedValue"),"uncoveredQuantity"=COALESCE($4,"uncoveredQuantity"),"uncoveredUnitCost"=$5,"uncoveredCostEvidence"=COALESCE($6,"uncoveredCostEvidence"),evidence=COALESCE($7,evidence),uncertainties=$8,"valuationChangeExplanation"=$9 WHERE id=$1`,[p.id,dto.approvedQuantity??null,dto.approvedValue??null,dto.uncoveredQuantity??null,dto.uncoveredUnitCost??null,dto.uncoveredCostEvidence??null,dto.evidence??null,dto.uncertainties??null,dto.valuationChangeExplanation??null]);
      for(const b of dto.batches??[]) await m.query(`UPDATE inventory_opening_position_batches SET "costEvidence"=COALESCE($3,"costEvidence"),note=$4,"releaseQuantity"=COALESCE($5,"releaseQuantity"),"releaseReason"=$6 WHERE "positionId"=$1 AND "batchId"=$2`,[p.id,b.batchId,b.costEvidence??null,b.note??null,b.releaseQuantity??null,b.releaseReason??null]);
      await this.refreshSnapshot(m,id);
      return this.findOne(id,m);
    });
  }

  async putJournalLines(id:string,lines:any[],differenceExplanation?:string){
    return this.ds.transaction(async m=>{
      const h=await this.requireOpen(m,id); if(h.status==='approved') await this.reopenRow(m,id);
      await m.query(`DELETE FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=$1`,[id]);
      if(differenceExplanation !== undefined) await m.query(`UPDATE inventory_reconciliations SET "differenceExplanation"=$2 WHERE id=$1`,[id,differenceExplanation]);
      for(const line of lines) await m.query(`INSERT INTO inventory_reconciliation_journal_lines ("reconciliationId","accountId",debit,credit,explanation) VALUES ($1,$2,$3,$4,$5)`,[id,line.accountId,line.debit??0,line.credit??0,line.explanation]);
      await this.refreshSnapshot(m,id); return this.findOne(id,m);
    });
  }

  async readiness(id:string){const m=this.ds.manager; const rec=await this.findOne(id,m); return {conditions:await this.evaluate(m,id),acceptedWithoutEvidence:rec.acceptedWithoutEvidence};}
  async approve(id:string,user:{userId:string}){
    return this.ds.transaction(async m=>{
      const h=await this.requireOpen(m,id); if(h.status!=='proposed') throw new ConflictException('Reopen the reconciliation before approving it again.');
      if(h.preparedByUserId===user.userId) throw new ConflictException('The approver must be a different user from the preparer.');
      await this.recalculate(m,id);
      const checks=await this.evaluate(m,id); const failures=checks.filter((x:any)=>!x.ok);
      if(failures.length) throw new ConflictException(`Inventory reconciliation cannot be approved: ${failures.map((x:any)=>x.condition).join('; ')}`);
      const content=await this.content(m,id);
      const hash=contentHash(content);
      await m.query(`UPDATE inventory_reconciliations SET status='approved',"approvedByUserId"=$2,"approvedAt"=now(),"contentHash"=$3 WHERE id=$1`,[id,user.userId,hash]);
      return this.findOne(id,m);
    });
  }
  async reopen(id:string){return this.ds.transaction(async m=>{const h=await this.requireOpen(m,id);if(h.status!=='approved')throw new ConflictException('Only an approved reconciliation can be reopened.');await this.reopenRow(m,id);await this.refreshSnapshot(m,id);return this.findOne(id,m);});}
  async abort(id:string){const [row]=await this.ds.query(`UPDATE inventory_reconciliations SET status='aborted' WHERE id=$1 AND status IN ('proposed','approved') RETURNING id`,[id]);if(!row)throw new ConflictException('Only an open reconciliation can be aborted.');return this.findOne(id);}
  async findAll(){return this.ds.query(`SELECT * FROM inventory_reconciliations ORDER BY "createdAt" DESC`);}
  async findOne(id:string,m:EntityManager=this.ds.manager){const [header]=await m.query(`SELECT * FROM inventory_reconciliations WHERE id=$1`,[id]);if(!header)throw new NotFoundException('Inventory reconciliation not found');const positions=await m.query(`SELECT * FROM inventory_opening_positions WHERE "reconciliationId"=$1 ORDER BY "productId"`,[id]);for(const p of positions)p.batches=await m.query(`SELECT * FROM inventory_opening_position_batches WHERE "positionId"=$1 ORDER BY "batchId"`,[p.id]);const journalLines=await m.query(`SELECT * FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=$1 ORDER BY id`,[id]);return {...header,positions,journalLines,acceptedWithoutEvidence:this.accepted(positions)};}
  async preparationReport(id:string){
    const rec=await this.findOne(id);
    const products=await this.ds.query(`SELECT p.id AS "productId",p."stockQuantity"::text AS "stockQuantity",
      COALESCE((SELECT SUM(h."remainingQuantity") FROM purchase_cost_history h WHERE h."productId"=p.id),0)::text AS "batchQuantity",
      COALESCE((SELECT SUM(round(h."remainingQuantity"*h."landedCost",2)) FROM purchase_cost_history h WHERE h."productId"=p.id),0)::text AS "batchValue",
      COALESCE((SELECT SUM(g.quantity) FROM stock_movement_valuation_gaps g JOIN stock_movements m ON m.id=g."movementId" WHERE m."productId"=p.id),0)::text AS "valuationGapQuantity",
      COALESCE((SELECT count(*) FROM purchase_cost_history h WHERE h."productId"=p.id AND h."remainingQuantity">0),0)::int AS "batchCount"
      FROM products p WHERE p.type='Stocked Product' AND p."stockQuantity">0 ORDER BY p.id`);
    const unsupported=rec.positions.flatMap((p:any)=>[
      ...p.batches.filter((b:any)=>b.costEvidence!=='supported').map((b:any)=>({productId:p.productId,batchId:b.batchId,evidence:b.costEvidence,note:b.note})),
      ...(toMinorUnits(p.uncoveredQuantity)>0n&&p.uncoveredCostEvidence!=='supported'?[{productId:p.productId,batchId:'shortfall',evidence:p.uncoveredCostEvidence,note:p.evidence}]:[]),
    ]);
    return {id,products,unsupportedCosts:unsupported,acceptedWithoutEvidence:rec.acceptedWithoutEvidence};
  }

  private async requireOpen(m:EntityManager,id:string){const [h]=await m.query(`SELECT * FROM inventory_reconciliations WHERE id=$1 FOR UPDATE`,[id]);if(!h)throw new NotFoundException('Inventory reconciliation not found');if(!['proposed','approved'].includes(h.status))throw new ConflictException('This reconciliation is no longer editable.');return h;}
  private async reopenRow(m:EntityManager,id:string){await m.query(`UPDATE inventory_reconciliations SET status='proposed',"approvedByUserId"=NULL,"approvedAt"=NULL,"contentHash"=NULL WHERE id=$1`,[id]);}
  private accepted(positions:any[]){const rows:any[]=[];for(const p of positions){if(p.uncoveredCostEvidence==='accepted_without_evidence')rows.push({productId:p.productId,batchId:'shortfall',note:p.evidence});for(const b of p.batches??[])if(b.costEvidence==='accepted_without_evidence')rows.push({productId:p.productId,batchId:b.batchId,note:b.note});}return rows;}
  private async content(m:EntityManager,id:string){const h=(await m.query(`SELECT * FROM inventory_reconciliations WHERE id=$1`,[id]))[0];const p=await m.query(`SELECT * FROM inventory_opening_positions WHERE "reconciliationId"=$1 ORDER BY "productId"`,[id]);for(const x of p)x.batches=await m.query(`SELECT * FROM inventory_opening_position_batches WHERE "positionId"=$1 ORDER BY "batchId"`,[x.id]);const lines=await m.query(`SELECT * FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=$1 ORDER BY id`,[id]);return {header:h,positions:p,journalLines:lines,snapshot:h.snapshot};}
  private async evaluate(m:EntityManager,id:string){
    const rec=await this.findOne(id,m);
    const details:any[][]=[[],[],[],[],[]];
    let coverageOk=true, reviewed=true, quantityUnchanged=true;
    for(const p of rec.positions){
      const [product]=await m.query(`SELECT "stockQuantity"::text AS quantity FROM products WHERE id=$1`,[p.productId]);
      if(!product||toMinorUnits(product.quantity)!==toMinorUnits(p.approvedQuantity)){quantityUnchanged=false;details[0].push(p.productId);}
      const uncovered=toMinorUnits(p.uncoveredQuantity);let covered=0n;
      for(const batch of p.batches){
        const remaining=toMinorUnits(batch.remainingQuantity)-toMinorUnits(batch.releaseQuantity);covered+=remaining;
        if(batch.costEvidence==='unreviewed'){reviewed=false;details[2].push(`${p.productId}/${batch.batchId}`);}
        if(batch.costEvidence==='accepted_without_evidence'&&!String(batch.note??'').trim()){reviewed=false;details[2].push(`${p.productId}/${batch.batchId} note`);}
      }
      if(covered+uncovered!==toMinorUnits(p.approvedQuantity)){coverageOk=false;details[1].push(p.productId);}
      if(uncovered>0n&&!p.uncoveredUnitCost){coverageOk=false;details[1].push(`${p.productId} uncovered cost`);}
      if(uncovered>0n&&p.uncoveredCostEvidence==='unreviewed'){reviewed=false;details[2].push(`${p.productId} shortfall`);}
      if(uncovered>0n&&p.uncoveredCostEvidence==='accepted_without_evidence'&&!String(p.evidence??'').trim()){reviewed=false;details[2].push(`${p.productId} shortfall note`);}
    }
    const lines=rec.journalLines;
    const debit=lines.reduce((n:bigint,x:any)=>n+toMinorUnits(String(x.debit)),0n);
    const credit=lines.reduce((n:bigint,x:any)=>n+toMinorUnits(String(x.credit)),0n);
    const balanced=debit===credit;
    const [account]=await m.query(`SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`);
    const inventoryNet=lines.filter((x:any)=>x.accountId===account?.inventoryAccountId).reduce((n:bigint,x:any)=>n+toMinorUnits(String(x.debit))-toMinorUnits(String(x.credit)),0n);
    const exactDiff=toMinorUnits(String(rec.controlAccountBalanceAtPreparation))+inventoryNet-toMinorUnits(String(rec.approvedTotalValue));
    const differenceOk=exactDiff===0n;
    return [
      {condition:'approved quantity matches current stockQuantity',ok:quantityUnchanged,details:details[0]},
      {condition:'batch releases and uncovered quantities reconcile to approved quantity',ok:coverageOk,details:details[1]},
      {condition:'all costs are reviewed and accepted-without-evidence rows include notes',ok:reviewed,details:details[2]},
      {condition:'journal lines balance',ok:balanced,details:balanced?[]:[`debits ${formatMoney(debit)} vs credits ${formatMoney(credit)}`]},
      {condition:'inventory control balance reconciles exactly to approved total',ok:differenceOk,details:differenceOk?[]:[`difference ${formatMoney(exactDiff)}`]},
    ];
  }
  private async recalculate(m:EntityManager,id:string){
    const [h]=await m.query(`SELECT "controlAccountBalanceAtPreparation" FROM inventory_reconciliations WHERE id=$1`,[id]);
    const positions=await m.query(`SELECT id,"approvedValue","uncoveredQuantity","uncoveredUnitCost" FROM inventory_opening_positions WHERE "reconciliationId"=$1`,[id]);
    let total=0n;
    for(const p of positions){ total+=toMinorUnits(String(p.approvedValue)); if(toMinorUnits(String(p.uncoveredQuantity))>0n&&p.uncoveredUnitCost) total+=quantizeToCents(mulMinor(toMinorUnits(String(p.uncoveredQuantity)),toMinorUnits(String(p.uncoveredUnitCost)))); }
    const [account]=await m.query(`SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`);
    const [net]=await m.query(`SELECT COALESCE(SUM(debit-credit),0)::text AS value FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=$1 AND "accountId"=$2`,[id,account?.inventoryAccountId]);
    const diff=toMinorUnits(String(h.controlAccountBalanceAtPreparation))+toMinorUnits(String(net.value))-total;
    await m.query(`UPDATE inventory_reconciliations SET "approvedTotalValue"=$2,"difference"=$3 WHERE id=$1`,[id,formatMoney(total),formatMoney(diff)]);
  }
  private async refreshSnapshot(m:EntityManager,id:string){
    const [h]=await m.query(`SELECT * FROM inventory_reconciliations WHERE id=$1`,[id]);const [a]=await m.query(`SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`);const [bal]=await m.query(`SELECT COALESCE(SUM(debit-credit),0)::text AS balance FROM journal_entry_line WHERE "accountId"=$1 AND "deletedAt" IS NULL AND "isActive"=true`,[a.inventoryAccountId]);
    const rows=await m.query(`SELECT p.id,p."stockQuantity"::text AS quantity FROM products p WHERE p.type='Stocked Product' AND p."stockQuantity">0 ORDER BY p.id`);const products=[];for(const p of rows){const b=await m.query(`SELECT id,"remainingQuantity"::text AS quantity FROM purchase_cost_history WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY id`,[p.id]);products.push({productId:p.id,stockQuantity:p.quantity,batches:b.map((x:any)=>({batchId:x.id,remainingQuantity:x.quantity}))});}
    await m.query(`UPDATE inventory_reconciliations SET snapshot=$2::jsonb,"controlAccountBalanceAtPreparation"=$3 WHERE id=$1`,[id,JSON.stringify({products,inventoryAccountId:a.inventoryAccountId,controlAccountBalance:bal.balance}),bal.balance]);
    await this.recalculate(m,id);
  }
}
