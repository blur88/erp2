import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CustomerService } from "./customer.service";
import {
  Customer,
  CustomerType,
} from "../../../database/entities/customer.entity";
import { SalesOrder } from "../../../database/entities/sales-order.entity";
import { AuditLogService } from "../../audit-logs/services";
import { TransactionManager } from "../../../common/utils/transaction.util";
import { UserRole } from "../../../database/entities/user.entity";

describe("CustomerService", () => {
  let module: TestingModule;
  let service: CustomerService;
  let customerRepository: jest.Mocked<Repository<Customer>>;
  const adminUser = { role: UserRole.ADMIN } as any;
  const createCustomer = (
    id: string,
    overrides: Partial<Customer> = {},
  ): Customer =>
    ({
      id,
      type: CustomerType.BUSINESS,
      name: `Customer ${id}`,
      phone: "0123456789",
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      isActive: true,
      priceListId: null,
      priceList: null,
      totalSales: 500,
      totalOrders: 3,
      lastPurchaseDate: null,
      firstPurchaseDate: null,
      notes: null,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
      deletedAt: null,
      ...overrides,
    }) as Customer;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: TransactionManager,
          useValue: { runInTransaction: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    customerRepository = module.get(getRepositoryToken(Customer));
  });

  describe("pagination removal", () => {
    it("findAll returns all matching customers with total-only metadata", async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[createCustomer("1"), createCustomer("2")], 2]),
      };
      customerRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findAll({ search: "Customer" });

      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.arrayContaining([
          expect.objectContaining({ id: "1", name: "Customer 1" }),
          expect.objectContaining({ id: "2", name: "Customer 2" }),
        ]),
        meta: { total: 2 },
      });
    });

    it("findAll applies skip and take when page and limit are provided", async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[createCustomer("2")], 5]),
      };
      customerRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findAll({ page: 2, limit: 1 });

      expect(qb.skip).toHaveBeenCalledWith(1);
      expect(qb.take).toHaveBeenCalledWith(1);
      expect(result.meta).toEqual({ total: 5, page: 2, limit: 1 });
    });

    it("findDeleted returns all deleted customers without offset/limit pagination", async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([
            createCustomer("deleted-1", {
              deletedAt: new Date("2026-04-05T00:00:00.000Z"),
            }),
          ]),
      };
      customerRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.findDeleted({});

      expect(qb.offset).not.toHaveBeenCalled();
      expect(qb.limit).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [
          expect.objectContaining({
            id: "deleted-1",
            name: "Customer deleted-1",
          }),
        ],
        total: 1,
      });
    });
  });

  describe("findAll filters", () => {
    it("applies priceListId filter via query builder", async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      customerRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({ priceListId: "pl-uuid-1" });

      expect(qb.andWhere).toHaveBeenCalledWith(
        "customer.priceListId = :priceListId",
        { priceListId: "pl-uuid-1" },
      );
    });

    it("applies type filter via where condition", async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      customerRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({ type: CustomerType.INDIVIDUAL });

      expect(qb.andWhere).toHaveBeenCalledWith("customer.type = :type", {
        type: CustomerType.INDIVIDUAL,
      });
    });
  });

  describe("searchGlobal", () => {
    it("returns matching customers as GlobalSearchResultDto", async () => {
      const customer = {
        id: "uuid-1",
        name: "ABC Trading",
        phone: "0123456789",
        deletedAt: null,
      };
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([customer]),
      } as any);

      const results = await service.searchGlobal("ABC", {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: "customer",
        id: "uuid-1",
        label: "ABC Trading",
        description: "0123456789",
        route: "/sales/customers/uuid-1",
      });
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("returns empty array when no matches", async () => {
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const results = await service.searchGlobal("zzz", {
        role: UserRole.SALES_STAFF,
      } as any);
      expect(results).toEqual([]);
    });

    it("exact phone match scores SCORE_EXACT_CODE + BOOST_CUSTOMER + BOOST_EXACT_MATCH", async () => {
      const mockCustomer = {
        id: "c1",
        name: "Acme Corp",
        phone: "0123456789",
      };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal("0123456789", adminUser);

      expect(results[0].score).toBe(148);
    });

    it("exact name match scores SCORE_EXACT_NAME + BOOST_CUSTOMER + BOOST_EXACT_MATCH", async () => {
      const mockCustomer = { id: "c1", name: "acme corp", phone: null };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal("acme corp", adminUser);

      expect(results[0].score).toBe(123);
    });

    it("phone exact match outranks name exact match", async () => {
      const mockCustomer = { id: "c1", name: "acme corp", phone: "acme corp" };

      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCustomer]),
      } as any);

      const results = await service.searchGlobal("acme corp", adminUser);

      expect(results[0].score).toBe(148);
    });

    it("falls back to fuzzy search when ILIKE returns empty", async () => {
      const fuzzyCustomer = { id: "c2", name: "Acme Corp", phone: null };

      let callCount = 0;
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(callCount === 1 ? [] : [fuzzyCustomer]);
        }),
      } as any);

      const results = await service.searchGlobal("Akme", {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0].label).toBe("Acme Corp");
      expect(results[0].score).toBe(48);
    });

    it("fuzzy fallback returns empty when no fuzzy matches", async () => {
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const results = await service.searchGlobal("zzzqqq", {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toEqual([]);
    });
  });

  describe("updateCustomerMetrics", () => {
    it("counts only fulfilled non-deleted orders", async () => {
      const customer = createCustomer("c1", {
        totalOrders: 5,
        totalSales: 500,
      });
      customerRepository.findOne = jest.fn().mockResolvedValue(customer);
      customerRepository.save = jest.fn().mockResolvedValue(customer);

      const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> =
        module.get(getRepositoryToken(SalesOrder));

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalorders: "2",
          totalsales: "300",
          firstorderdate: new Date("2026-01-01"),
          lastorderdate: new Date("2026-03-01"),
        }),
      };
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.updateCustomerMetrics("c1");

      expect(qb.andWhere).toHaveBeenCalledWith(
        "order.isFulfilled = :isFulfilled",
        {
          isFulfilled: true,
        },
      );
      expect(customerRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalOrders: 2, totalSales: 300 }),
      );
    });
  });

  describe("recalculateAllCustomerTotals", () => {
    it("uses isFulfilled filter when recalculating", async () => {
      const customers = [createCustomer("c1"), createCustomer("c2")];
      customerRepository.find = jest.fn().mockResolvedValue(customers);
      customerRepository.save = jest.fn().mockResolvedValue({} as Customer);

      const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> =
        module.get(getRepositoryToken(SalesOrder));

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalorders: "1",
          totalsales: "100",
          firstorderdate: null,
          lastorderdate: null,
        }),
      };
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.recalculateAllCustomerTotals();

      expect(qb.andWhere).toHaveBeenCalledWith(
        "order.isFulfilled = :isFulfilled",
        {
          isFulfilled: true,
        },
      );
    });
  });

  describe("getCustomerStatistics", () => {
    it("filters order stats to fulfilled orders only", async () => {
      const customer = createCustomer("c1");
      customerRepository.findOne = jest.fn().mockResolvedValue(customer);

      const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> =
        module.get(getRepositoryToken(SalesOrder));

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalorders: "3",
          averageordervalue: "100",
          totalsales: "300",
          firstorderdate: new Date("2026-01-01"),
          lastorderdate: new Date("2026-03-01"),
        }),
      };
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.getCustomerStatistics("c1");

      expect(qb.andWhere).toHaveBeenCalledWith(
        "order.isFulfilled = :isFulfilled",
        {
          isFulfilled: true,
        },
      );
    });
  });

  describe("findBySlug", () => {
    it("returns customer when slug matches", async () => {
      const customer = createCustomer("c1", {
        slug: "acme-corp",
        priceList: undefined,
      });
      customerRepository.findOne.mockResolvedValue(customer);

      const result = await service.findBySlug("acme-corp");

      expect(customerRepository.findOne).toHaveBeenCalledWith({
        where: { slug: "acme-corp" },
        relations: { priceList: true },
      });
      expect(result.id).toBe("c1");
    });

    it("throws NotFoundException when slug does not exist", async () => {
      customerRepository.findOne.mockResolvedValue(null);

      await expect(service.findBySlug("nonexistent")).rejects.toThrow(
        "Customer with slug 'nonexistent' not found",
      );
    });
  });

  describe("generateUniqueSlug (via update)", () => {
    it("assigns a clean slug when no collision exists", async () => {
      const existing = createCustomer("c1", {
        slug: "old-name",
        name: "Old Name",
      });
      const updated = createCustomer("c1", {
        slug: "new-name",
        name: "New Name",
      });
      customerRepository.findOne
        .mockResolvedValueOnce(existing) // findOne for update — loads the customer
        .mockResolvedValueOnce(null) // slug uniqueness check: 'new-name' is free
        .mockResolvedValue(updated);
      customerRepository.save.mockResolvedValue(updated);

      const result = await service.update("c1", { name: "New Name" });

      expect(result.slug).toBe("new-name");
    });

    it("appends counter suffix when base slug is already taken by another entity", async () => {
      const existing = createCustomer("c1", {
        slug: "old-name",
        name: "Old Name",
      });
      const collision = createCustomer("c2", { slug: "acme-corp" });
      const updated = createCustomer("c1", {
        slug: "acme-corp-1",
        name: "Acme Corp",
      });
      customerRepository.findOne
        .mockResolvedValueOnce(existing) // findOne for update
        .mockResolvedValueOnce(collision) // 'acme-corp' taken by c2
        .mockResolvedValueOnce(null) // 'acme-corp-1' free
        .mockResolvedValue(updated);
      customerRepository.save.mockResolvedValue(updated);

      const result = await service.update("c1", { name: "Acme Corp" });

      expect(result.slug).toBe("acme-corp-1");
    });

    it("does not treat itself as a collision when updating with same name", async () => {
      const existing = createCustomer("c1", {
        slug: "acme-corp",
        name: "Acme Corp",
      });
      customerRepository.findOne
        .mockResolvedValueOnce(existing) // findOne for update
        .mockResolvedValueOnce(existing) // slug check: finds 'acme-corp' but id matches excludeId
        .mockResolvedValue(existing);
      customerRepository.save.mockResolvedValue(existing);

      const result = await service.update("c1", { name: "Acme Corp" });

      expect(result.slug).toBe("acme-corp");
    });
  });
});
