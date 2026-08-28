import { jest } from '@jest/globals';
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { DataSource, IsNull } from "typeorm";
import { PriceListsService } from "../../src/modules/price-lists/services/price-lists.service";
import { PriceListDefaultService } from "../../src/modules/price-lists/services/price-list-default.service";
import { PriceList } from "../../src/database/entities/price-list.entity";
import { PriceListItem } from "../../src/database/entities/price-list-item.entity";
import { Product } from "../../src/database/entities/product.entity";
import { SettingsService } from "../../src/modules/settings/settings.service";
import { CreatePriceListDto } from "../../src/modules/price-lists/dto/create-price-list.dto";
import { UpdatePriceListDto } from "../../src/modules/price-lists/dto/update-price-list.dto";
import { BulkUpdatePricesDto } from "../../src/modules/price-lists/dto/bulk-update-prices.dto";

describe("PriceListsService", () => {
  let service: PriceListsService;

  const mockPriceList: Partial<PriceList> = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Retail Price List",
    code: "RETAIL",
    description: "Standard retail prices",
    isDefault: true,
    isActive: true,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPriceListItem: Partial<PriceListItem> = {
    id: "item-123",
    priceListId: mockPriceList.id,
    productId: "product-123",
    price: 100.0,
    costBasis: 80.0,
    marginPercent: 25.0,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    isActive: true,
  };

  const mockProduct: Partial<Product> = {
    id: "product-123",
    name: "Test Product",
    barcode: "TEST123",
    baseCost: 80.0,
    isActive: true,
  };

  const mockPriceListRepository = {
    find: (jest.fn as unknown as any)(),
    findOne: (jest.fn as unknown as any)(),
    findOneBy: (jest.fn as unknown as any)(),
    save: (jest.fn as unknown as any)(),
    create: (jest.fn as unknown as any)(),
    softDelete: (jest.fn as unknown as any)(),
    update: (jest.fn as unknown as any)(),
    count: (jest.fn as unknown as any)(),
    createQueryBuilder: (jest.fn as unknown as any)(() => ({
      where: (jest.fn as unknown as any)().mockReturnThis(),
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
      getMany: (jest.fn as unknown as any)(),
      getOne: (jest.fn as unknown as any)(),
      getManyAndCount: (jest.fn as unknown as any)(),
    })),
  };

  const mockPriceListItemRepository = {
    find: (jest.fn as unknown as any)(),
    findOne: (jest.fn as unknown as any)(),
    findOneBy: (jest.fn as unknown as any)(),
    save: (jest.fn as unknown as any)(),
    create: (jest.fn as unknown as any)(),
    delete: (jest.fn as unknown as any)(),
    createQueryBuilder: (jest.fn as unknown as any)(() => ({
      where: (jest.fn as unknown as any)().mockReturnThis(),
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
      getMany: (jest.fn as unknown as any)(),
      getOne: (jest.fn as unknown as any)(),
    })),
  };

  const mockProductRepository = {
    findOneBy: (jest.fn as unknown as any)(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceListsService,
        {
          provide: getRepositoryToken(PriceList),
          useValue: mockPriceListRepository,
        },
        {
          provide: getRepositoryToken(PriceListItem),
          useValue: mockPriceListItemRepository,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
        {
          provide: SettingsService,
          useValue: { getRegionalSettings: (jest.fn as unknown as any)().mockResolvedValue({ timezone: 'Asia/Kuala_Lumpur' }) },
        },
        PriceListDefaultService,
        {
          provide: DataSource,
          useValue: {
            transaction: (jest.fn as unknown as any)(async (cb: any) =>
              cb({
                query: (jest.fn as unknown as any)(),
                findOne: (...args: any[]) => mockPriceListRepository.findOne(args[1]),
                create: (_entityClass: any, plain: any) => plain,
                save: (_entityClass: any, entity: any) =>
                  mockPriceListRepository.save(entity),
                update: (_entityClass: any, criteria: any, data: any) =>
                  mockPriceListRepository.update(criteria, data),
                softDelete: (_entityClass: any, criteria: any) =>
                  mockPriceListRepository.softDelete(criteria),
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<PriceListsService>(PriceListsService);

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return paginated price lists", async () => {
      mockPriceListRepository.createQueryBuilder.mockReturnValue({
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        skip: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
        getMany: (jest.fn as unknown as any)(),
        getOne: (jest.fn as unknown as any)(),
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[mockPriceList], 1]),
      });

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("meta");
      expect(result.meta.total).toBe(1);
      expect(result.data).toEqual([mockPriceList]);
    });

    it("should filter by active status", async () => {
      const andWhereSpy = (jest.fn as unknown as any)().mockReturnThis();
      mockPriceListRepository.createQueryBuilder.mockReturnValue({
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: andWhereSpy,
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        skip: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
        getMany: (jest.fn as unknown as any)(),
        getOne: (jest.fn as unknown as any)(),
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[mockPriceList], 1]),
      });

      await service.findAll({ page: 1, limit: 10, isActive: true });

      expect(andWhereSpy).toHaveBeenCalledWith(
        "priceList.isActive = :isActive",
        { isActive: true },
      );
    });
  });

  describe("findOne", () => {
    it("should return a price list with items", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);

      const result = await service.findOne(mockPriceList.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockPriceList.id);
    });

    it("should throw NotFoundException if price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByCode", () => {
    it("should return price list by code", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);

      const result = await service.findByCode("RETAIL");

      expect(result).toBeDefined();
      expect(result.code).toBe("RETAIL");
    });

    it("should throw NotFoundException if code not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode("NON_EXISTENT")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    const createDto: CreatePriceListDto = {
      name: "Wholesale Price List",
      code: "WHOLESALE",
      description: "Wholesale prices",
      isDefault: false,
      isActive: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    };

    it("should create a new price list", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);
      mockPriceListRepository.create.mockReturnValue(createDto);
      mockPriceListRepository.save.mockResolvedValue({
        ...createDto,
        id: "new-id",
      });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(mockPriceListRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if code already exists", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should set existing default to false when creating new default", async () => {
      const defaultDto = { ...createDto, isDefault: true };
      // Sequence: 1) code-duplicate check → null, 2) assignDefault findById → created row
      mockPriceListRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "new-id",
          isActive: true,
          isDefault: false,
          name: defaultDto.name,
          code: defaultDto.code,
        });
      mockPriceListRepository.create.mockReturnValue(defaultDto);
      mockPriceListRepository.save.mockResolvedValue({
        ...defaultDto,
        id: "new-id",
      });
      mockPriceListRepository.update.mockResolvedValue({ affected: 1 });

      await service.create(defaultDto);

      expect(mockPriceListRepository.update).toHaveBeenCalledWith(
        { isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
    });
  });

  describe("update", () => {
    const updateDto: UpdatePriceListDto = {
      name: "Updated Price List",
      description: "Updated description",
    };

    it("should update a price list", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);
      mockPriceListRepository.save.mockResolvedValue({
        ...mockPriceList,
        ...updateDto,
      });

      const result = await service.update(mockPriceList.id, updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(mockPriceListRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update("non-existent-id", updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("remove", () => {
    it("should soft delete a price list", async () => {
      const nonDefaultPriceList = { ...mockPriceList, isDefault: false };
      mockPriceListRepository.findOne.mockResolvedValue(nonDefaultPriceList);
      mockPriceListRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(mockPriceList.id);

      expect(mockPriceListRepository.softDelete).toHaveBeenCalledWith(
        mockPriceList.id,
      );
    });

    it("should throw BadRequestException if trying to delete default price list", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);

      await expect(service.remove(mockPriceList.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("setDefault", () => {
    it("should set a price list as default", async () => {
      const nonDefaultList = { ...mockPriceList, isDefault: false };
      mockPriceListRepository.findOne.mockResolvedValue(nonDefaultList);
      mockPriceListRepository.update.mockResolvedValue({ affected: 1 });
      mockPriceListRepository.save.mockResolvedValue({
        ...nonDefaultList,
        isDefault: true,
      });

      const result = await service.setDefault(mockPriceList.id);

      expect(result.isDefault).toBe(true);
      expect(mockPriceListRepository.update).toHaveBeenCalledWith(
        { isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
    });

    it("should throw NotFoundException if price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(service.setDefault("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getDefaultPriceList", () => {
    it("should return the default price list", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);

      const result = await service.getDefaultPriceList();

      expect(result).toBeDefined();
      expect(result.isDefault).toBe(true);
    });

    it("should throw NotFoundException if no default price list exists", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(service.getDefaultPriceList()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getEffectivePriceLists", () => {
    it("should return currently effective price lists", async () => {
      mockPriceListRepository.createQueryBuilder.mockReturnValue({
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        skip: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
        getMany: (jest.fn as unknown as any)().mockResolvedValue([mockPriceList]),
        getOne: (jest.fn as unknown as any)(),
        getManyAndCount: (jest.fn as unknown as any)(),
      });

      const result = await service.getEffectivePriceLists();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([mockPriceList]);
    });
  });

  describe("getPriceForProduct", () => {
    it("should return price for a product in a price list", async () => {
      mockPriceListItemRepository.findOne.mockResolvedValue(mockPriceListItem);

      const result = await service.getPriceForProduct(
        mockPriceList.id,
        "product-123",
      );

      expect(result).toBeDefined();
      expect(result).toBe(100.0);
    });

    it("should return null if price not found", async () => {
      mockPriceListItemRepository.findOne.mockResolvedValue(null);

      const result = await service.getPriceForProduct(
        mockPriceList.id,
        "product-123",
      );

      expect(result).toBeNull();
    });
  });

  describe("bulkUpdatePrices", () => {
    const bulkDto: BulkUpdatePricesDto = {
      items: [
        {
          productId: "product-123",
          price: 120.0,
          costBasis: 90.0,
          margin: 33.33,
        },
      ],
    };

    it("should bulk update prices", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);
      mockPriceListItemRepository.findOne.mockResolvedValue(mockPriceListItem);
      mockPriceListItemRepository.save.mockResolvedValue({
        ...mockPriceListItem,
        price: 120.0,
      });

      const result = await service.bulkUpdatePrices(mockPriceList.id, bulkDto);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(mockPriceListItemRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(
        service.bulkUpdatePrices("non-existent-id", bulkDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("copyPriceList", () => {
    it("should copy a price list with all items", async () => {
      const sourcePriceListWithItems = {
        ...mockPriceList,
        items: [mockPriceListItem],
      };
      mockPriceListRepository.findOne
        .mockResolvedValueOnce(sourcePriceListWithItems) // First call in copyPriceList (source)
        .mockResolvedValueOnce(null) // Second call to check for duplicate code
        .mockResolvedValueOnce({
          ...mockPriceList,
          id: "new-id",
          code: "COPIED",
          name: "Copied Price List",
        }); // Third call at the end to return the result
      mockPriceListRepository.create.mockReturnValue({
        ...mockPriceList,
        id: "new-id",
        code: "COPIED",
      });
      mockPriceListRepository.save.mockResolvedValue({
        ...mockPriceList,
        id: "new-id",
        code: "COPIED",
      });
      mockPriceListItemRepository.create.mockReturnValue(mockPriceListItem);
      mockPriceListItemRepository.save.mockResolvedValue([mockPriceListItem]);

      const result = await service.copyPriceList(
        mockPriceList.id,
        "COPIED",
        "Copied Price List",
      );

      expect(result).toBeDefined();
      expect(mockPriceListRepository.save).toHaveBeenCalled();
      expect(mockPriceListItemRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if source price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(
        service.copyPriceList("non-existent-id", "COPY", "Copy"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if target code already exists", async () => {
      const sourcePriceListWithItems = {
        ...mockPriceList,
        items: [mockPriceListItem],
      };
      mockPriceListRepository.findOne
        .mockResolvedValueOnce(sourcePriceListWithItems) // Source price list
        .mockResolvedValueOnce(mockPriceList); // Duplicate check finds existing

      await expect(
        service.copyPriceList(mockPriceList.id, "RETAIL", "Copy"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("applyPercentageAdjustment", () => {
    it("should increase all prices by percentage", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);
      mockPriceListItemRepository.find.mockResolvedValue([mockPriceListItem]);
      mockPriceListItemRepository.save.mockResolvedValue({
        ...mockPriceListItem,
        price: 110.0,
      });

      const result = await service.applyPercentageAdjustment(mockPriceList.id, {
        percentage: 10,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(mockPriceListItemRepository.save).toHaveBeenCalled();
    });

    it("should decrease all prices by percentage", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);
      mockPriceListItemRepository.find.mockResolvedValue([mockPriceListItem]);
      mockPriceListItemRepository.save.mockResolvedValue({
        ...mockPriceListItem,
        price: 90.0,
      });

      const result = await service.applyPercentageAdjustment(mockPriceList.id, {
        percentage: -10,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it("should throw NotFoundException if price list not found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(null);

      await expect(
        service.applyPercentageAdjustment("non-existent-id", {
          percentage: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if no items found", async () => {
      mockPriceListRepository.findOne.mockResolvedValue(mockPriceList);
      mockPriceListItemRepository.find.mockResolvedValue([]);

      await expect(
        service.applyPercentageAdjustment(mockPriceList.id, { percentage: 10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
