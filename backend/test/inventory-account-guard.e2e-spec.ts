import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { deactivateValuationForTest } from "./utils/valuation-fixture";

let app: INestApplication;
let ds: DataSource;
let entryIds: string[] = [];
let reconciliationIds: string[] = [];
let categoryId: string;
let productId: string;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  ds = app.get(DataSource);
});
beforeEach(async () => {
  entryIds = [];
  reconciliationIds = [];
  categoryId = randomUUID();
  productId = randomUUID();
  await ds.query(`INSERT INTO categories (id,name,slug) VALUES ($1,$2,$3)`, [
    categoryId,
    `guard-${categoryId}`,
    `guard-${categoryId}`,
  ]);
  await ds.query(
    `INSERT INTO products (id,name,slug,type,"baseCost","stockQuantity","categoryId") VALUES ($1,$2,$3,'Stocked Product',1,0,$4)`,
    [productId, `guard-${productId}`, `guard-${productId}`, categoryId],
  );
});
afterEach(async () => {
  await deactivateValuationForTest(ds);
  if (reconciliationIds.length) {
    await ds.query(
      `ALTER TABLE inventory_reconciliation_journal_lines DISABLE TRIGGER trg_inventory_reconciliation_journal_lines_content_guard`,
    );
    await ds.query(
      `DELETE FROM inventory_reconciliation_journal_lines WHERE "reconciliationId"=ANY($1)`,
      [reconciliationIds],
    );
    await ds.query(
      `ALTER TABLE inventory_reconciliation_journal_lines ENABLE TRIGGER trg_inventory_reconciliation_journal_lines_content_guard`,
    );
    await ds.query(`DELETE FROM inventory_reconciliations WHERE id=ANY($1)`, [
      reconciliationIds,
    ]);
  }
  for (const id of entryIds)
    await ds.query(`DELETE FROM journal_entry WHERE id=$1`, [id]);
  await ds.query(`DELETE FROM products WHERE id=$1`, [productId]);
  await ds.query(`DELETE FROM categories WHERE id=$1`, [categoryId]);
});
afterAll(async () => app.close());
async function makeEntry(
  withInventory: boolean,
  backed = true,
  amount = "0",
  backingValue = amount,
) {
  const id = randomUUID();
  entryIds.push(id);
  const [a] = await ds.query(`SELECT * FROM accounting_settings WHERE id=true`);
  const equity = a.openingBalanceEquityAccountId;
  await ds.transaction(async (m) => {
    await m.query(
      `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'guard-test','OPENING_BALANCE','Guard test','test')`,
      [id, `JG-${id}`, randomUUID()],
    );
    if (withInventory) {
      await m.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,$4,0),($1,$3,0,$4)`,
        [id, a.inventoryAccountId, equity, amount],
      );
      if (backed)
        await m.query(
          `INSERT INTO stock_valuation_entries ("productId",kind,method,quantity,value,"runningQuantity","runningValue","journalEntryId") VALUES ($1,'method_change','AVERAGE',0,$3,0,$3,$2)`,
          [productId, id, backingValue],
        );
    } else
      await m.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [id, equity, a.cashAccountId],
      );
  });
  return id;
}

async function makeReconciliationBackedEntry(options: {
  amount: string;
  postedAmount?: string;
  extraPair?: boolean;
  approvedOnly?: boolean;
}) {
  const entryId = randomUUID();
  const reconciliationId = randomUUID();
  entryIds.push(entryId);
  reconciliationIds.push(reconciliationId);
  const [accounts] = await ds.query(
    `SELECT "inventoryAccountId","openingBalanceEquityAccountId","cashAccountId" FROM accounting_settings WHERE id=true`,
  );
  await ds.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'reconciliation-guard','OPENING_BALANCE','Reconciliation backing','test')`,
      [entryId, `JR-${entryId}`, randomUUID()],
    );
    await manager.query(
      `INSERT INTO inventory_reconciliations (id,status,"preparedByUserId","controlAccountBalanceAtPreparation") VALUES ($1,'proposed',$2,0)`,
      [reconciliationId, randomUUID()],
    );
    await manager.query(
      `INSERT INTO inventory_reconciliation_journal_lines ("reconciliationId","accountId",debit,credit,explanation) VALUES ($1,$2,$3,0,'inventory'),($1,$4,0,$3,'equity')`,
      [
        reconciliationId,
        accounts.inventoryAccountId,
        options.amount,
        accounts.openingBalanceEquityAccountId,
      ],
    );
    await manager.query(
      `UPDATE inventory_reconciliations SET status='approved',"approvedByUserId"=$2,"approvedAt"=now(),"contentHash"='test' WHERE id=$1`,
      [reconciliationId, randomUUID()],
    );
    if (options.approvedOnly) {
      await manager.query(
        `ALTER TABLE inventory_reconciliations DISABLE TRIGGER trg_inventory_reconciliation_header_guard`,
      );
      await manager.query(
        `UPDATE inventory_reconciliations SET "correctingEntryId"=$2 WHERE id=$1`,
        [reconciliationId, entryId],
      );
      await manager.query(
        `ALTER TABLE inventory_reconciliations ENABLE TRIGGER trg_inventory_reconciliation_header_guard`,
      );
    } else {
      await manager.query(
        `UPDATE inventory_reconciliations SET status='applied',"correctingEntryId"=$2 WHERE id=$1`,
        [reconciliationId, entryId],
      );
    }
    await manager.query(
      `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,$3,0),($1,$4,0,$3)`,
      [
        entryId,
        accounts.inventoryAccountId,
        options.postedAmount ?? options.amount,
        accounts.openingBalanceEquityAccountId,
      ],
    );
    if (options.extraPair) {
      await manager.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [
          entryId,
          accounts.cashAccountId,
          accounts.openingBalanceEquityAccountId,
        ],
      );
    }
  });
  return { entryId, reconciliationId };
}

describe("inventory control account guard", () => {
  it("requires applied reconciliation backing to match the full line multiset exactly", async () => {
    await ds.query(
      `UPDATE inventory_valuation_state SET status='active',"activatedAt"=now() WHERE id=true`,
    );
    const exact = await makeReconciliationBackedEntry({ amount: "100.00" });
    expect(exact.entryId).toBeTruthy();

    await expect(
      makeReconciliationBackedEntry({ amount: "100.00", approvedOnly: true }),
    ).rejects.toThrow(/without valuation or reconciliation backing/i);
    await expect(
      makeReconciliationBackedEntry({
        amount: "100.00",
        postedAmount: "100.01",
      }),
    ).rejects.toThrow(/without valuation or reconciliation backing/i);
    await expect(
      makeReconciliationBackedEntry({ amount: "100.00", extraPair: true }),
    ).rejects.toThrow(/without valuation or reconciliation backing/i);

    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    const reusedEntry = randomUUID();
    entryIds.push(reusedEntry);
    await expect(
      ds.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'reconciliation-reuse','OPENING_BALANCE','Reused reconciliation','test')`,
          [reusedEntry, `JR-${reusedEntry}`, randomUUID()],
        );
        await manager.query(
          `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,100,0),($1,$3,0,100)`,
          [
            reusedEntry,
            accounts.inventoryAccountId,
            accounts.openingBalanceEquityAccountId,
          ],
        );
      }),
    ).rejects.toThrow(/without valuation or reconciliation backing/i);
  });

  it("marks entries while inactive, accepts lines in an open savepoint, and clears cascade membership", async () => {
    const openId = randomUUID();
    const cascadeId = randomUUID();
    entryIds.push(openId);
    const [accounts] = await ds.query(
      `SELECT "cashAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    await ds.query(
      `UPDATE inventory_valuation_state SET status='inactive',"activatedAt"=NULL WHERE id=true`,
    );
    await ds.transaction(async (manager) => {
      await manager.query("SAVEPOINT open_membership");
      await manager.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'inactive-membership','OPENING_BALANCE','Inactive membership','test')`,
        [openId, `JR-${openId}`, randomUUID()],
      );
      const [beforeLines] = await manager.query(
        `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
        [openId],
      );
      expect(beforeLines.n).toBe(1);
      await manager.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [
          openId,
          accounts.cashAccountId,
          accounts.openingBalanceEquityAccountId,
        ],
      );
      await manager.query("RELEASE SAVEPOINT open_membership");

      await manager.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'cascade-membership','OPENING_BALANCE','Cascade membership','test')`,
        [cascadeId, `JR-${cascadeId}`, randomUUID()],
      );
      await manager.query(`DELETE FROM journal_entry WHERE id=$1`, [cascadeId]);
      const [afterCascade] = await manager.query(
        `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
        [cascadeId],
      );
      expect(afterCascade.n).toBe(0);
    });
    const [cleared] = await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
      [openId],
    );
    expect(cleared.n).toBe(0);
  });

  it("allows non-stock postings and their line and parent edits/deletes while inactive", async () => {
    await ds.query(
      `UPDATE inventory_valuation_state SET status='inactive',"activatedAt"=NULL WHERE id=true`,
    );
    const id = await makeEntry(false);
    const lines = await ds.query(
      `SELECT id,"accountId" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [id],
    );

    await expect(
      ds.query(`UPDATE journal_entry_line SET debit=2 WHERE id=$1`, [lines[0].id]),
    ).resolves.toBeDefined();
    await expect(
      ds.query(`DELETE FROM journal_entry_line WHERE id=$1`, [lines[1].id]),
    ).resolves.toBeDefined();
    await expect(
      ds.query(`UPDATE journal_entry SET description='edited while inactive' WHERE id=$1`, [id]),
    ).resolves.toBeDefined();
    await expect(ds.query(`DELETE FROM journal_entry WHERE id=$1`, [id])).resolves.toBeDefined();
  });

  it("retries a posting after its savepoint rolls back without losing or duplicating lines", async () => {
    await ds.query(
      `UPDATE inventory_valuation_state SET status='active',"activatedAt"=now() WHERE id=true`,
    );
    const id = randomUUID();
    entryIds.push(id);
    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );

    await ds.transaction(async (manager) => {
      await manager.query("SAVEPOINT je_insert");
      await manager.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceEventId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'PRODUCT',$3,$4,'savepoint-retry','INVENTORY_OPENING','First attempt','test')`,
        [id, `JR-${id}`, productId, randomUUID()],
      );
      const [firstMembership] = await manager.query(
        `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
        [id],
      );
      expect(firstMembership.n).toBe(1);
      await manager.query("ROLLBACK TO SAVEPOINT je_insert");

      const [rolledBack] = await manager.query(
        `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
        [id],
      );
      expect(rolledBack.n).toBe(0);

      await manager.query("SAVEPOINT je_insert");
      await manager.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceEventId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'PRODUCT',$3,$4,'savepoint-retry','INVENTORY_OPENING','Retried posting','test')`,
        [id, `JR-${id}`, productId, randomUUID()],
      );
      await manager.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [id, accounts.inventoryAccountId, accounts.openingBalanceEquityAccountId],
      );
      await manager.query(
        `INSERT INTO stock_valuation_entries ("productId",kind,method,quantity,value,"runningQuantity","runningValue","journalEntryId") VALUES ($1,'method_change','AVERAGE',0,1,0,1,$2)`,
        [productId, id],
      );
      await manager.query("RELEASE SAVEPOINT je_insert");
    });

    const lines = await ds.query(
      `SELECT "accountId",debit::text AS debit,credit::text AS credit FROM journal_entry_line WHERE "entryId"=$1 ORDER BY "accountId"`,
      [id],
    );
    expect(lines).toEqual([
      { accountId: accounts.inventoryAccountId, debit: "1.0000", credit: "0.0000" },
      { accountId: accounts.openingBalanceEquityAccountId, debit: "0.0000", credit: "1.0000" },
    ]);
    const [membership] = await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
      [id],
    );
    expect(membership.n).toBe(0);
  });

  it("keeps an entry open when activation happens before its lines in the same transaction", async () => {
    const id = randomUUID();
    entryIds.push(id);
    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    await ds.query(
      `UPDATE inventory_valuation_state SET status='inactive',"activatedAt"=NULL WHERE id=true`,
    );
    await ds.transaction(async (m) => {
      await m.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'activation-order','OPENING_BALANCE','Activation ordering','test')`,
        [id, `JR-${id}`, randomUUID()],
      );
      await m.query(
        `UPDATE inventory_valuation_state SET status='active',"activatedAt"=now() WHERE id=true`,
      );
      await m.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [
          id,
          accounts.inventoryAccountId,
          accounts.openingBalanceEquityAccountId,
        ],
      );
      await m.query(
        `INSERT INTO stock_valuation_entries ("productId",kind,method,quantity,value,"runningQuantity","runningValue","journalEntryId") VALUES ($1,'method_change','AVERAGE',0,1,0,1,$2)`,
        [productId, id],
      );
    });
    const [markers] = await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
      [id],
    );
    expect(markers.n).toBe(0);
  });

  it("rejects raw unbacked inventory postings and finalized-entry appends; clears membership at commit", async () => {
    await ds.query(
      `UPDATE inventory_valuation_state SET status='active',"activatedAt"=now() WHERE id=true`,
    );
    await expect(
      makeEntry(true, false).then(() => {
        throw new Error("expected commit to fail");
      }),
    ).rejects.toThrow(/without valuation or reconciliation backing/i);
    await expect(makeEntry(true, true, "1.00", "0.99")).rejects.toThrow(
      /without valuation or reconciliation backing/i,
    );
    const nonzeroBackedId = await makeEntry(true, true, "1.00", "1.00");
    expect(nonzeroBackedId).toBeTruthy();
    const id = await makeEntry(true);
    const [markers] = await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
      [id],
    );
    expect(markers.n).toBe(0);
    await expect(
      ds.query(
        `INSERT INTO journal_entry_open_postings ("entryId") VALUES ($1)`,
        [id],
      ),
    ).rejects.toThrow(/written only by the journal entry trigger/i);
    await expect(
      ds.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,
        [
          id,
          (
            await ds.query(
              `SELECT "cashAccountId" FROM accounting_settings WHERE id=true`,
            )
          )[0].cashAccountId,
        ],
      ),
    ).rejects.toThrow(/finalized/i);
    const [settings] = await ds.query(
      `SELECT "cashAccountId","inventoryAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    await expect(
      ds.query(
        `UPDATE accounting_settings SET "inventoryAccountId"=$1 WHERE id=true`,
        [settings.cashAccountId],
      ),
    ).rejects.toThrow(/cannot be changed/i);
    const lines = await ds.query(
      `SELECT id,"accountId" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [id],
    );
    const equityLine = lines.find(
      (line: any) => line.accountId !== settings.inventoryAccountId,
    );
    await expect(
      ds.query(`UPDATE journal_entry_line SET debit=1 WHERE id=$1`, [
        equityLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`DELETE FROM journal_entry_line WHERE id=$1`, [equityLine.id]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`DELETE FROM journal_entry WHERE id=$1`, [id]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`TRUNCATE journal_entry_line CASCADE`),
    ).rejects.toThrow(/TRUNCATE is forbidden/i);
    for (const sessionScope of [true, false]) {
      const error = await ds.transaction(async (m) => {
        await m.query("SAVEPOINT forged_marker");
        await m.query(
          `SELECT set_config('erp.journal_entries_created_in_tx',$1,$2)`,
          [id, sessionScope],
        );
        let message = "";
        try {
          await m.query(
            `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,
            [id, settings.cashAccountId],
          );
        } catch (err: any) {
          message = err.message;
        }
        await m.query("ROLLBACK TO SAVEPOINT forged_marker");
        await m.query(
          `SELECT set_config('erp.journal_entries_created_in_tx','',false)`,
        );
        await m.query("RELEASE SAVEPOINT forged_marker");
        return message;
      });
      expect(error).toMatch(/finalized/i);
    }
    await ds.query(`VACUUM (FREEZE) journal_entry, journal_entry_line`);
    await expect(
      ds.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,
        [id, settings.cashAccountId],
      ),
    ).rejects.toThrow(/finalized/i);
    await ds.transaction(async (manager) => {
      await manager.query("SET CONSTRAINTS ALL IMMEDIATE");
      await expect(
        manager.query(
          `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,
          [id, settings.cashAccountId],
        ),
      ).rejects.toThrow(/finalized/i);
    });
    await ds.transaction(async (m) => {
      const rolled = randomUUID();
      await m.query("SAVEPOINT rollback_entry");
      await m.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'savepoint','OPENING_BALANCE','rolled savepoint','test')`,
        [rolled, `JR-${rolled}`, randomUUID()],
      );
      await m.query("SAVEPOINT protect_marker");
      await expect(
        m.query(
          `UPDATE journal_entry_open_postings SET "entryId"=$1 WHERE "entryId"=$2`,
          [randomUUID(), rolled],
        ),
      ).rejects.toThrow(/cannot be changed/i);
      await m.query("ROLLBACK TO SAVEPOINT protect_marker");
      await m.query("SAVEPOINT delete_marker");
      await expect(
        m.query(`DELETE FROM journal_entry_open_postings WHERE "entryId"=$1`, [
          rolled,
        ]),
      ).rejects.toThrow(/cannot be deleted directly/i);
      await m.query("ROLLBACK TO SAVEPOINT delete_marker");
      await m.query("ROLLBACK TO SAVEPOINT rollback_entry");
      const [gone] = await m.query(
        `SELECT count(*)::int AS n FROM journal_entry_open_postings WHERE "entryId"=$1`,
        [rolled],
      );
      expect(gone.n).toBe(0);
      const kept = randomUUID();
      await m.query("SAVEPOINT release_entry");
      await m.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'savepoint','OPENING_BALANCE','released savepoint','test')`,
        [kept, `JR-${kept}`, randomUUID()],
      );
      await m.query("RELEASE SAVEPOINT release_entry");
      await m.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0)`,
        [kept, settings.cashAccountId],
      );
      await m.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,0,1)`,
        [kept, settings.openingBalanceEquityAccountId],
      );
      entryIds.push(kept);
    });
    const [accountingSettings] = await ds.query(
      `SELECT "cashAccountId" FROM accounting_settings WHERE id=true`,
    );
    await expect(
      ds.query(
        `INSERT INTO journal_entry_open_postings ("entryId") VALUES ($1)`,
        [id],
      ),
    ).rejects.toThrow(/written only by the journal entry trigger/i);
    expect(accountingSettings.cashAccountId).toBe(settings.cashAccountId);
  });
});
