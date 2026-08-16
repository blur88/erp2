import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager, In } from "typeorm";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import {
  Product,
  ProductType,
} from "../../../database/entities/product.entity";
import {
  OwnerEquityDocument,
  OwnerEquityDocumentStatus,
  OwnerEquitySettlementStatus,
  OwnerEquityType,
} from "../entities/owner-equity-document.entity";
import { OwnerEquitySettlement } from "../entities/owner-equity-settlement.entity";
import { AuditLogService } from "../../audit-logs/services";
import { SettingsService } from "../../settings/settings.service";
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  ListOwnerEquityParams,
} from "../dto/create-owner-equity.dto";
import { lockRowForUpdate } from "../../../common/db/tx-helpers";
import { toMinorUnits, formatScale4, sumMinor } from "@/common/utils/money";

@Injectable()
export class OwnerEquityService {
  constructor(
    @InjectRepository(OwnerEquityDocument)
    private readonly docRepo: Repository<OwnerEquityDocument>,
    private readonly settings: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    if (dto.type === OwnerEquityType.STOCK_DRAWING) {
      if (toMinorUnits(dto.quantity) <= 0n) {
        throw new BadRequestException("Quantity must be greater than zero");
      }
    } else if (toMinorUnits(dto.totalAmount) <= 0n) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        if (dto.type === OwnerEquityType.STOCK_DRAWING) {
          await this.assertDrawableProduct(dto.productId, manager);
        }
        const referenceNumber = await this.settings.generateDocumentNumber(
          "Owner Equity",
          manager,
        );
        const repo = manager.getRepository(OwnerEquityDocument);
        const doc = repo.create({
          referenceNumber,
          equityDate: dto.equityDate,
          type: dto.type,
          description: dto.description,
          notes: dto.notes ?? null,
          documentStatus: OwnerEquityDocumentStatus.DRAFT,
        } as any) as unknown as OwnerEquityDocument;
        if (dto.type === OwnerEquityType.STOCK_DRAWING) {
          doc.productId = dto.productId;
          doc.quantity = formatScale4(dto.quantity);
        } else {
          doc.totalAmount = formatScale4(dto.totalAmount);
          doc.settledAmount = "0.0000";
          doc.balance = formatScale4(dto.totalAmount);
          doc.settlementStatus = OwnerEquitySettlementStatus.UNSETTLED;
        }
        return repo.save(doc) as unknown as OwnerEquityDocument;
      },
    );

    await this.auditLogService.log(
      "CREATE",
      "OwnerEquity",
      `Created owner equity: ${saved.referenceNumber}`,
      {
        entityId: saved.id,
        userId: userId || "system",
        username,
        newValues: {
          type: dto.type,
          equityDate: dto.equityDate,
          description: dto.description,
        },
      },
    );

    return saved;
  }

  async update(
    referenceNumber: string,
    dto: UpdateOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const doc = await this.lockByReference(manager, referenceNumber);

      if (doc.documentStatus !== OwnerEquityDocumentStatus.DRAFT) {
        throw new BadRequestException("Only draft documents can be edited");
      }

      // Type is immutable; the shape guards below are keyed off the persisted
      // type, so a monetary document can never receive stock columns.
      if (doc.type === OwnerEquityType.STOCK_DRAWING) {
        if (dto.totalAmount !== undefined) {
          throw new BadRequestException(
            "Stock drawings do not carry a total amount",
          );
        }
        if (dto.quantity !== undefined && toMinorUnits(dto.quantity) <= 0n) {
          throw new BadRequestException("Quantity must be greater than zero");
        }
        if (dto.productId !== undefined && dto.productId !== doc.productId) {
          await this.assertDrawableProduct(dto.productId, manager);
        }
      } else {
        if (dto.productId !== undefined || dto.quantity !== undefined) {
          throw new BadRequestException(
            "Only stock drawings carry a product and quantity",
          );
        }
        if (dto.totalAmount !== undefined) {
          if (toMinorUnits(dto.totalAmount) <= 0n) {
            throw new BadRequestException("Amount must be greater than zero");
          }
          if (toMinorUnits(dto.totalAmount) < toMinorUnits(doc.settledAmount)) {
            throw new BadRequestException(
              `Amount cannot be less than the amount already settled (RM ${doc.settledAmount})`,
            );
          }
        }
      }

      if (dto.equityDate !== undefined) doc.equityDate = dto.equityDate;
      if (dto.description !== undefined) doc.description = dto.description;
      if (dto.notes !== undefined) doc.notes = dto.notes;
      if (dto.productId !== undefined) doc.productId = dto.productId;
      if (dto.quantity !== undefined) doc.quantity = formatScale4(dto.quantity);

      if (
        doc.type !== OwnerEquityType.STOCK_DRAWING &&
        dto.totalAmount !== undefined
      ) {
        const settlements = await manager
          .getRepository(OwnerEquitySettlement)
          .find({
            where: { equityDocumentId: doc.id } as any,
          });
        const aggregates = OwnerEquityService.computeAggregates(
          dto.totalAmount,
          settlements,
        );
        doc.totalAmount = formatScale4(dto.totalAmount);
        doc.settledAmount = aggregates.settledAmount;
        doc.balance = aggregates.balance;
        doc.settlementStatus = aggregates.settlementStatus;
        doc.documentStatus = OwnerEquityService.deriveDocumentStatus(
          doc.documentStatus,
          aggregates.settlementStatus,
        );
      }

      const saved = await manager.getRepository(OwnerEquityDocument).save(doc);

      await this.auditLogService.log(
        "UPDATE",
        "OwnerEquity",
        `Updated owner equity: ${doc.referenceNumber}`,
        {
          entityId: doc.id,
          userId: userId || "system",
          username,
          newValues: dto as any,
        },
      );

      return saved;
    });
  }

  static computeAggregates(
    totalAmount: string,
    settlements: { amount: string }[],
  ) {
    const total = toMinorUnits(totalAmount);
    const settled = settlements.reduce(
      (a, s) => a + toMinorUnits(s.amount),
      0n,
    );
    const settlementStatus =
      settled <= 0n
        ? OwnerEquitySettlementStatus.UNSETTLED
        : settled < total
          ? OwnerEquitySettlementStatus.PARTIAL
          : settled === total
            ? OwnerEquitySettlementStatus.SETTLED
            : OwnerEquitySettlementStatus.OVERSETTLED;
    return {
      settledAmount: formatScale4(settled),
      balance: formatScale4(total - settled),
      settlementStatus,
    };
  }

  /**
   * COMPLETED and CANCELLED are protected from automatic derivation: settlement
   * recomputation never rewrites them. They are not absorbing — uncomplete()
   * and uncancel() move them explicitly. Same shape as ExpenseService.
   */
  static deriveDocumentStatus(
    current: OwnerEquityDocumentStatus,
    settlementStatus: OwnerEquitySettlementStatus,
  ): OwnerEquityDocumentStatus {
    if (current === OwnerEquityDocumentStatus.COMPLETED) return current;
    if (current === OwnerEquityDocumentStatus.CANCELLED) return current;
    // ONLY exact settlement reaches READY. OVERSETTLED is unreachable through
    // the settle guards (spec §4.1) and exists for imported/repair data; if it
    // ever appears it means the balance is wrong, so the document must stay in
    // DRAFT for correction rather than become completable.
    return settlementStatus === OwnerEquitySettlementStatus.SETTLED
      ? OwnerEquityDocumentStatus.READY
      : OwnerEquityDocumentStatus.DRAFT;
  }

  async findOne(id: string): Promise<OwnerEquityDocument> {
    return this.loadWithSettlements({ id });
  }

  async findByReference(referenceNumber: string): Promise<OwnerEquityDocument> {
    return this.loadWithSettlements({ referenceNumber });
  }

  async list(
    params: ListOwnerEquityParams,
  ): Promise<
    | {
        data: OwnerEquityDocument[];
        meta: { total: number; page: number; limit: number };
      }
    | OwnerEquityDocument[]
  > {
    const qb = this.docRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.product", "product");

    if (params.search) {
      qb.andWhere(
        '(d."referenceNumber" ILIKE :search OR d.description ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }
    if (params.fromDate)
      qb.andWhere('d."equityDate" >= :fromDate', { fromDate: params.fromDate });
    if (params.toDate)
      qb.andWhere('d."equityDate" <= :toDate', { toDate: params.toDate });
    if (params.type) qb.andWhere("d.type = :type", { type: params.type });
    if (params.documentStatus)
      qb.andWhere('d."documentStatus" = :documentStatus', {
        documentStatus: params.documentStatus,
      });
    if (params.settlementStatus)
      qb.andWhere('d."settlementStatus" = :settlementStatus', {
        settlementStatus: params.settlementStatus,
      });

    const sortColumns: Record<string, string> = {
      referenceNumber: "d.referenceNumber",
      equityDate: "d.equityDate",
      totalAmount: "d.totalAmount",
    };
    // Resolve first: an unrecognised sortBy falls back to referenceNumber, and the
    // secondary order must be decided from the resolved field so the fallback
    // cannot emit "referenceNumber DESC, referenceNumber DESC".
    // Own-property check, not truthiness: sortColumns is an object literal, so
    // prototype keys ('constructor', 'toString', ...) are truthy lookups that
    // would otherwise pass a function to orderBy instead of a column string.
    const sortBy =
      params.sortBy && Object.hasOwn(sortColumns, params.sortBy)
        ? params.sortBy
        : "referenceNumber";
    // Allow-list the direction too, symmetric with sortBy above: TypeORM does
    // not sanitise the direction string, and a direct caller skips the DTO.
    const sortOrder = params.sortOrder === "ASC" ? "ASC" : "DESC";
    qb.orderBy(sortColumns[sortBy], sortOrder);
    // equityDate and totalAmount tie freely; without a stable tiebreaker rows
    // can repeat or vanish across pages. referenceNumber is effectively unique.
    if (sortBy !== "referenceNumber") {
      qb.addOrderBy("d.referenceNumber", "DESC");
    }

    if (params.page !== undefined && params.limit !== undefined) {
      const page = params.page;
      const limit = params.limit;
      qb.skip((page - 1) * limit).take(limit);
      const [data, total] = await qb.getManyAndCount();
      return { data, meta: { total, page, limit } };
    }

    return qb.getMany();
  }

  private async lockByReference(
    manager: EntityManager,
    referenceNumber: string,
  ): Promise<OwnerEquityDocument> {
    const repo = manager.getRepository(OwnerEquityDocument);
    const existing = await repo.findOne({ where: { referenceNumber } } as any);
    if (!existing)
      throw new NotFoundException("Owner equity document not found");
    return lockRowForUpdate(manager, OwnerEquityDocument, existing.id, {
      notFoundMessage: "Owner equity document not found",
    });
  }

  private async assertDrawableProduct(
    productId: string,
    manager: EntityManager,
  ): Promise<void> {
    const product = await manager
      .getRepository(Product)
      .findOne({ where: { id: productId } } as any);
    if (!product) {
      throw new BadRequestException("Product not found");
    }
    if (product.type !== ProductType.GOODS) {
      throw new BadRequestException("Stock drawings require a stocked product");
    }
  }

  private async loadWithSettlements(where: {
    id?: string;
    referenceNumber?: string;
  }): Promise<OwnerEquityDocument> {
    const doc = await this.docRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.settlements", "settlements")
      .leftJoinAndSelect("d.product", "product")
      .where(where)
      .orderBy("settlements.settlementDate", "ASC")
      .addOrderBy("settlements.createdAt", "ASC")
      .getOne();

    if (!doc) throw new NotFoundException("Owner equity document not found");

    const settlements = doc.settlements ?? [];
    // Load methods separately with withDeleted so soft-deleted methods still
    // render on historical rows (join options can't express this).
    const methodIds = [...new Set(settlements.map((s) => s.paymentMethodId))];
    if (methodIds.length) {
      const methods = await this.dataSource
        .getRepository(PaymentMethodEntity)
        .find({ where: { id: In(methodIds) } as any, withDeleted: true });
      const byId = new Map(methods.map((m) => [m.id, m]));
      for (const s of settlements) {
        (s as any).paymentMethod = byId.get(s.paymentMethodId) ?? null;
      }
    }
    const refunds = settlements.filter((s) => s.sourceSettlementId);
    for (const s of settlements) {
      if (!s.sourceSettlementId) {
        const refunded = sumMinor(
          refunds
            .filter((r) => r.sourceSettlementId === s.id)
            .map((r) => r.amount),
        );
        const remaining = toMinorUnits(s.amount) + refunded;
        (s as any).remainingRefundable = formatScale4(
          remaining < 0n ? 0n : remaining,
        );
      }
    }

    return doc;
  }
}
