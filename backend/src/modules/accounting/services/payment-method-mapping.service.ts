import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentMethodAccountMapping } from '../entities/payment-method-account-mapping.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';

export type MappingInvalidReason = 'inactive' | 'not postable' | 'deleted' | 'missing';

export interface PaymentMethodMappingRow {
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  accountingChannel: 'CASH' | 'BANK';
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  status: 'mapped' | 'unmapped' | 'invalid';
  invalidReason: MappingInvalidReason | null;
}

@Injectable()
export class PaymentMethodMappingService {
  constructor(
    @InjectRepository(PaymentMethodAccountMapping)
    private readonly mappingRepo: Repository<PaymentMethodAccountMapping>,
    @InjectRepository(PaymentMethodEntity)
    private readonly methodRepo: Repository<PaymentMethodEntity>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private classify(account: ChartOfAccount | null | undefined): MappingInvalidReason | null {
    if (!account) return 'missing';
    if ((account as any).deletedAt) return 'deleted';
    if (!account.isActive) return 'inactive';
    if (!account.isPostable) return 'not postable';
    return null;
  }

  /**
   * One row per ACTIVE payment method, mapped or not.
   *
   * The account is read withDeleted — the OPPOSITE of the posting path — so a
   * soft-deleted mapped account still displays, flagged, instead of vanishing
   * into a row the UI would render as merely unmapped.
   */
  async list(): Promise<PaymentMethodMappingRow[]> {
    const [methods, mappings, accounts] = await Promise.all([
      this.methodRepo.find({ where: { isActive: true } as any, order: { sortOrder: 'ASC' } as any }),
      this.mappingRepo.find(),
      this.coaRepo.find({ withDeleted: true } as any),
    ]);
    const byId = new Map((accounts as any[]).map((a) => [a.id, a]));
    const mappingFor = new Map(mappings.map((m) => [m.paymentMethodId, m]));

    return (methods as any[]).map((m) => {
      const mapping = mappingFor.get(m.id);
      if (!mapping) {
        return {
          paymentMethodId: m.id, paymentMethodName: m.name, paymentMethodCode: m.code,
          accountingChannel: m.accountingChannel,
          accountId: null, accountCode: null, accountName: null,
          status: 'unmapped' as const, invalidReason: null,
        };
      }
      const account = byId.get(mapping.accountId) ?? null;
      const reason = this.classify(account);
      return {
        paymentMethodId: m.id, paymentMethodName: m.name, paymentMethodCode: m.code,
        accountingChannel: m.accountingChannel,
        accountId: mapping.accountId,
        accountCode: account?.code ?? null,
        accountName: account?.name ?? null,
        status: reason ? ('invalid' as const) : ('mapped' as const),
        invalidReason: reason,
      };
    });
  }

  /**
   * Apply many mapping edits atomically.
   *
   * EVERYTHING runs inside ONE transaction — validation reads included — so
   * validation and writes act on one connection and one unit of work, and a
   * failed batch leaves nothing behind.
   *
   * What this does NOT buy: protection from a concurrent deactivation. Under
   * PostgreSQL's default READ COMMITTED isolation each statement takes a fresh
   * snapshot, so an account deactivated and committed by another transaction
   * between the validation read and the INSERT is invisible to both — the
   * transaction boundary does not serialize against it. Closing that window
   * would need SELECT ... FOR UPDATE on the account rows or SERIALIZABLE
   * isolation, and this design has neither.
   *
   * Save-time validation is therefore a usability guard that catches the
   * common case, NOT a guarantee. Posting-time revalidation in
   * resolvePaymentAccount() remains necessary — it is what catches an account
   * deactivated at any point after the mapping was saved, which is the case
   * that actually occurs. It narrows the window rather than closing it: for
   * the same READ COMMITTED reason, an account can be deactivated between that
   * read and the journal entry INSERT. Neither layer makes an invalid posting
   * impossible; together they make it improbable and, when it does happen,
   * loud rather than silent.
   *
   * The writes must likewise go through the TRANSACTION's manager; the
   * injected mappingRepo runs on the default connection and its writes would
   * NOT roll back with it.
   *
   * Validation still happens for EVERY item before ANY write, so a rejected
   * batch writes nothing even before the rollback is needed.
   *
   * Omitted methods are untouched — this is a patch, not a replacement.
   *
   * Assigning an account requires an ACTIVE payment method; CLEARING one does
   * not. That asymmetry exists because payment method removal is a soft
   * delete, so a mapping can outlive its method and must stay removable.
   */
  async setMappings(
    items: { paymentMethodId: string; accountId: string | null }[],
  ): Promise<PaymentMethodMappingRow[]> {
    await this.dataSource.transaction(async (manager) => {
      const methodRepo = manager.getRepository(PaymentMethodEntity);
      const coaRepo = manager.getRepository(ChartOfAccount);
      const mappingRepo = manager.getRepository(PaymentMethodAccountMapping);

      const methods = await methodRepo.find({ where: { isActive: true } as any });
      const methodById = new Map((methods as any[]).map((m) => [m.id, m]));

      /*
       * Every method the database knows, inactive and soft-deleted included.
       *
       * Used ONLY to authorise a clear. Payment method removal is a SOFT
       * delete (payment-method.service.ts remove()), so the FK's ON DELETE
       * CASCADE never fires and a mapping row outlives the method that owns
       * it. Such a row is invisible in list(), which shows active methods
       * only — and if the method is later restored, its stale mapping resumes
       * posting. Without this lookup the operator could neither see nor remove
       * it, because the active-only map above rejects the id outright.
       */
      const knownMethods = await methodRepo.find({ withDeleted: true } as any);
      const knownMethodIds = new Set((knownMethods as any[]).map((m) => m.id));

      // Phase 1 — validate every item against the transaction's own view.
      const resolved: { paymentMethodId: string; accountId: string | null }[] = [];
      for (const item of items) {
        const method = methodById.get(item.paymentMethodId);

        if (item.accountId === null) {
          /*
           * A clear is allowed for ANY method the database knows, active or
           * not — it only ever removes a row, so it cannot create the
           * invisible state the non-null branch guards against. An unknown id
           * is still rejected: clearing a mapping for a method that never
           * existed is a malformed request, not a no-op.
           */
          if (!knownMethodIds.has(item.paymentMethodId)) {
            throw new BadRequestException(
              `Payment method ${item.paymentMethodId} not found`,
            );
          }
          resolved.push({ paymentMethodId: item.paymentMethodId, accountId: null });
          continue;
        }

        // Assigning an account still requires an ACTIVE method: a row for an
        // inactive, deleted or unknown method would never appear in list(),
        // staying invisible until it changed a posting.
        if (!method) {
          throw new BadRequestException(
            `Payment method ${item.paymentMethodId} not found or inactive`,
          );
        }
        const account = await coaRepo.findOne({ where: { id: item.accountId } as any });
        const reason = this.classify(account);
        if (reason === 'missing') {
          throw new BadRequestException(
            `Payment method '${method.name}' is mapped to account ${item.accountId} (not found or deleted)`,
          );
        }
        if (reason) {
          throw new BadRequestException(
            `Payment method '${method.name}' is mapped to account '${account!.code} ${account!.name}', which is ${reason}`,
          );
        }
        resolved.push({ paymentMethodId: item.paymentMethodId, accountId: item.accountId });
      }

      // Phase 2 — write.
      for (const r of resolved) {
        // Delete first in BOTH branches. `upsert` would conflict on the unique
        // paymentMethodId index, which Postgres enforces regardless of
        // `deletedAt` — so it can UPDATE a soft-deleted row back into use
        // rather than insert a fresh one, quietly resurrecting a row the
        // hard-delete rule exists to prevent. Delete-then-insert has one
        // meaning. That is the reason, not unfamiliarity: `upsert` is a
        // perfectly good tool where no soft-delete column shares the
        // conflict target.
        await mappingRepo.delete({ paymentMethodId: r.paymentMethodId } as any);
        if (r.accountId !== null) {
          await mappingRepo.insert(
            { paymentMethodId: r.paymentMethodId, accountId: r.accountId } as any,
          );
        }
      }
    });

    return this.list();
  }
}
