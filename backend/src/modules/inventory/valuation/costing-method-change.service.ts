import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { contentHash } from './approval-hash';
import { CostingMethodChangeStatus } from '../../../database/entities/costing-method-change.entity';
import { averageToLayers } from './valuation-math';
import { toMinorUnits, formatScale4, formatMoney } from '../../../common/utils/money';

function dateOnly(value: string | Date): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }

@Injectable()
export class CostingMethodChangeService {
  constructor(private readonly ds: DataSource) {}

  async propose(dto: { toMethod: 'AVERAGE'|'FIFO'; effectiveDate: string; explanation: string }, user: { userId: string }) {
    return this.ds.transaction(async (m) => {
      const [setting] = await m.query(`SELECT "costingMethod" FROM regional_settings ORDER BY "createdAt" LIMIT 1`);
      const fromMethod = setting?.costingMethod;
      if (!fromMethod || fromMethod === dto.toMethod) throw new ConflictException('The proposed costing method must differ from the current method.');
      const [appDate] = await m.query(`SELECT to_char(now() AT TIME ZONE COALESCE((SELECT timezone FROM regional_settings ORDER BY "createdAt" LIMIT 1),'Asia/Kuala_Lumpur'),'YYYY-MM-DD') AS today`);
      const today = appDate.today;
      if (dto.effectiveDate < today) throw new ConflictException('The effective date cannot be before today.');
      const [latest] = await m.query(`SELECT MAX("movementDate")::date AS day FROM stock_movements`);
      if (latest?.day && dto.effectiveDate < dateOnly(latest.day)) throw new ConflictException('The effective date cannot be before the latest stock movement.');
      const [row] = await m.query(`INSERT INTO costing_method_changes ("fromMethod","toMethod","requestedEffectiveDate",status,"preparedByUserId",explanation,"snapshotTakenAt") VALUES ($1,$2,$3,'proposed',$4,$5,now()) RETURNING *`, [fromMethod,dto.toMethod,dto.effectiveDate,user.userId,dto.explanation]);
      await this.preview(m, row.id, dto.toMethod);
      return this.findOne(row.id, m);
    });
  }

  async edit(id: string, dto: { toMethod?: 'AVERAGE'|'FIFO'; effectiveDate?: string; explanation?: string }, user: { userId: string }) {
    return this.ds.transaction(async (m) => {
      const row = await this.requireEditable(m,id,user.userId);
      const toMethod = dto.toMethod ?? row.toMethod;
      if (toMethod === row.fromMethod) throw new ConflictException('The proposed costing method must differ from the current method.');
      await m.query(`UPDATE costing_method_changes SET "toMethod"=$2,"requestedEffectiveDate"=$3,explanation=$4,status='proposed',"approvedByUserId"=NULL,"approvedAt"=NULL,"contentHash"=NULL,"snapshotTakenAt"=now() WHERE id=$1`, [id,toMethod,dto.effectiveDate ?? row.requestedEffectiveDate,dto.explanation ?? row.explanation]);
      await this.preview(m,id,toMethod);
      return this.findOne(id,m);
    });
  }

  async refreshPreview(id: string, user: { userId: string }) {
    return this.ds.transaction(async (m) => {
      const row = await this.requireEditable(m,id,user.userId);
      await m.query(`UPDATE costing_method_changes SET status='proposed',"approvedByUserId"=NULL,"approvedAt"=NULL,"contentHash"=NULL,"snapshotTakenAt"=now() WHERE id=$1`,[id]);
      await this.preview(m,id,row.toMethod);
      return this.findOne(id,m);
    });
  }

  async approve(id: string, user: { userId: string }) {
    return this.ds.transaction(async (m) => {
      const row = await this.requireEditable(m,id);
      if (row.preparedByUserId === user.userId) throw new ConflictException('The approver must be a different user from the preparer.');
      const products = await m.query(`SELECT * FROM costing_method_change_products WHERE "changeId"=$1 AND "supersededAt" IS NULL ORDER BY "productId"`,[id]);
      const hash = contentHash(this.approvalContent(row, products));
      await m.query(`UPDATE costing_method_changes SET status='approved',"approvedByUserId"=$2,"approvedAt"=now(),"contentHash"=$3 WHERE id=$1`,[id,user.userId,hash]);
      return this.findOne(id,m);
    });
  }

  async withdraw(id: string, user: { userId: string }) {
    const row = await this.ds.query(`UPDATE costing_method_changes SET status='withdrawn' WHERE id=$1 AND "preparedByUserId"=$2 AND status IN ('proposed','approved') RETURNING *`,[id,user.userId]);
    if (!row[0]) throw new ConflictException('Only the preparer can withdraw an open method change.');
    return row[0];
  }

  async findAll() { return this.ds.query(`SELECT * FROM costing_method_changes ORDER BY "createdAt" DESC`); }
  async findOne(id: string, manager: EntityManager = this.ds.manager) {
    const [header] = await manager.query(`SELECT * FROM costing_method_changes WHERE id=$1`,[id]);
    if (!header) throw new NotFoundException('Costing method change not found');
    const products = await manager.query(`SELECT * FROM costing_method_change_products WHERE "changeId"=$1 AND "supersededAt" IS NULL ORDER BY "productId"`,[id]);
    return { ...header, products };
  }

  private async requireEditable(m: EntityManager, id: string, preparerId?: string) {
    const [row] = await m.query(`SELECT * FROM costing_method_changes WHERE id=$1 FOR UPDATE`,[id]);
    if (!row) throw new NotFoundException('Costing method change not found');
    if (row.status !== 'proposed' && row.status !== 'approved') throw new ConflictException('This costing method change is no longer editable.');
    if (preparerId && row.preparedByUserId !== preparerId) throw new ConflictException('Only the preparer can edit this method change.');
    return row;
  }

  private async preview(m: EntityManager, id: string, toMethod: 'AVERAGE'|'FIFO') {
    await m.query(`UPDATE costing_method_change_products SET "supersededAt"=now() WHERE "changeId"=$1 AND "supersededAt" IS NULL`,[id]);
    const balances = await m.query(`SELECT b.*, p."stockQuantity"::text AS "physicalQuantity" FROM product_valuation_balances b JOIN products p ON p.id=b."productId" ORDER BY b."productId"`);
    for (const b of balances) {
      const layers = await m.query(`SELECT id,"remainingQuantity"::text AS qty,"remainingValue"::text AS value FROM inventory_cost_layers WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "createdAt",id`,[b.productId]);
      const batches = await m.query(`SELECT id, "remainingQuantity"::text AS qty FROM purchase_cost_history WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "receivedDate",id`,[b.productId]);
      const qty = toMinorUnits(b.quantityOnHand);
      const valueCents = toMinorUnits(b.valueOnHand) / 100n;
      const layerDraft = layers.map((l:any)=>({id:l.id,remainingQty:toMinorUnits(l.qty),remainingValue:toMinorUnits(l.value)/100n}));
      const after = toMethod === 'AVERAGE' ? [] : averageToLayers({qty,value:valueCents}, batches.map((x:any)=>({batchId:x.id,remainingQty:toMinorUnits(x.qty)}))).map((x)=>({batchId:x.batchId,quantity:formatScale4(x.qty),value:formatMoney(x.value * 100n)}));
      await m.query(`INSERT INTO costing_method_change_products ("changeId","productId",method,quantity,"valueBefore","valueAfter","layersBefore","batchesBefore","layersAfter") VALUES ($1,$2,$3,$4,$5,$5,$6::jsonb,$7::jsonb,$8::jsonb)`, [id,b.productId,toMethod,b.quantityOnHand,b.valueOnHand,JSON.stringify(layerDraft.map((l:any)=>({id:l.id,remainingQty:formatScale4(l.remainingQty),remainingValue:formatMoney(l.remainingValue * 100n)}))),JSON.stringify(batches.map((x:any)=>({batchId:x.id,remainingQty:x.qty}))),JSON.stringify(after)]);
    }
  }

  private approvalContent(header: any, products: any[]) {
    return { header: { id: header.id, fromMethod: header.fromMethod, toMethod: header.toMethod, requestedEffectiveDate: header.requestedEffectiveDate, preparedByUserId: header.preparedByUserId, explanation: header.explanation, snapshotTakenAt: header.snapshotTakenAt }, products };
  }

  async applyApproved(manager: EntityManager, id: string): Promise<void> {
    const [state] = await manager.query(`SELECT status,"pausedAt" FROM inventory_valuation_state WHERE id=true FOR UPDATE`);
    if (state?.status !== 'active' || !state.pausedAt) throw new ConflictException('Inventory valuation must be paused before applying a costing method change.');
    const record = await this.findOne(id,manager);
    if (record.status !== 'approved') throw new ConflictException('The costing method change must be approved.');
    const [appDate] = await manager.query(`SELECT to_char(now() AT TIME ZONE COALESCE((SELECT timezone FROM regional_settings ORDER BY "createdAt" LIMIT 1),'Asia/Kuala_Lumpur'),'YYYY-MM-DD') AS today`);
    if (appDate.today < dateOnly(record.requestedEffectiveDate)) throw new ConflictException('The requested effective date has not arrived.');
    if (record.contentHash !== contentHash(this.approvalContent(record, record.products))) throw new ConflictException('Stock has changed since this change was approved; refresh the preview and approve again.');
    for (const p of record.products) {
      const [balance] = await manager.query(`SELECT * FROM product_valuation_balances WHERE "productId"=$1 FOR UPDATE`,[p.productId]);
      const liveLayers = await manager.query(`SELECT id,"remainingQuantity"::text AS "remainingQty","remainingValue"::text AS "remainingValue" FROM inventory_cost_layers WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "createdAt",id FOR UPDATE`,[p.productId]);
      const liveBatches = await manager.query(`SELECT id AS "batchId","remainingQuantity"::text AS "remainingQty" FROM purchase_cost_history WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "receivedDate",id FOR UPDATE`,[p.productId]);
      if (!balance || balance.quantityOnHand !== p.quantity || balance.valueOnHand !== p.valueBefore || JSON.stringify(liveLayers) !== JSON.stringify(p.layersBefore) || JSON.stringify(liveBatches) !== JSON.stringify(p.batchesBefore)) throw new ConflictException('Stock has changed since this change was approved; refresh the preview and approve again.');
      await manager.query(`UPDATE inventory_cost_layers SET "remainingQuantity"=0,"remainingValue"=0 WHERE "productId"=$1 AND "remainingQuantity">0`,[p.productId]);
      const inserted = await manager.query(`INSERT INTO stock_valuation_entries ("productId",kind,method,quantity,value,"runningQuantity","runningValue","journalEntryId","reversesEntryId","defaultUnitValue",explanation,"actorUserId") VALUES ($1,'method_change',$2,0,0,$3,$4,NULL,NULL,NULL,$5,$6) RETURNING id`,[p.productId,record.toMethod,p.quantity,p.valueBefore,record.explanation,record.approvedByUserId]);
      if (record.toMethod === 'FIFO') {
        for (const layer of p.layersAfter as any[]) {
          const qty=toMinorUnits(String(layer.quantity)); const value=toMinorUnits(String(layer.value));
          const unit=qty===0n?0n:(value*10000n+qty/2n)/qty;
          await manager.query(`INSERT INTO inventory_cost_layers ("productId","sourceEntryId",quantity,"unitValue","remainingQuantity","remainingValue") VALUES ($1,$2,$3,$4,$3,$5)`,[p.productId,inserted[0].id,layer.quantity,formatScale4(unit),layer.value]);
        }
      }
      await manager.query(`UPDATE product_valuation_balances SET method=$2,"lastEntryId"=$3 WHERE "productId"=$1`,[p.productId,record.toMethod,inserted[0]?.id]);
    }
    await manager.query(`UPDATE regional_settings SET "costingMethod"=$1`,[record.toMethod]);
    await manager.query(`UPDATE costing_method_changes SET status='applied',"appliedAt"=now(),"appliedDate"=(now() AT TIME ZONE COALESCE((SELECT timezone FROM regional_settings ORDER BY "createdAt" LIMIT 1),'Asia/Kuala_Lumpur'))::date,"appliedByUserId"=$2 WHERE id=$1`,[id,record.approvedByUserId]);
  }
}
