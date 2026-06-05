import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { PriceList, PriceListItem } from "@/database/entities";
import {
  CreatePriceListDto,
  UpdatePriceListDto,
  QueryPriceListsDto,
  BulkUpdatePricesDto,
  ApplyPercentageAdjustmentDto,
} from "../dto";

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class PriceListsService {
  constructor(
    @InjectRepository(PriceList)
    private readonly priceListRepository: Repository<PriceList>,
    @InjectRepository(PriceListItem)
    private readonly priceListItemRepository: Repository<PriceListItem>,
  ) {}

  /**
   * Find all price lists with pagination and filtering
   */
  async findAll(
    query: QueryPriceListsDto,
  ): Promise<PaginatedResponse<PriceList>> {
    const { search, isActive, isDefault, page = 1, limit = 10 } = query;

    const queryBuilder =
      this.priceListRepository.createQueryBuilder("priceList");

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(priceList.code ILIKE :search OR priceList.name ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere("priceList.isActive = :isActive", { isActive });
    }

    if (isDefault !== undefined) {
      queryBuilder.andWhere("priceList.isDefault = :isDefault", { isDefault });
    }

    // Soft delete filter
    queryBuilder.andWhere("priceList.deletedAt IS NULL");

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by
    queryBuilder.orderBy("priceList.isDefault", "DESC");
    queryBuilder.addOrderBy("priceList.code", "ASC");

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one price list by ID with items
   */
  async findOne(id: string, includeItems = true): Promise<PriceList> {
    const relations = includeItems ? { items: { product: true } } : {};

    const priceList = await this.priceListRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations,
    });

    if (!priceList) {
      throw new NotFoundException(`Price list with ID ${id} not found`);
    }

    return priceList;
  }

  /**
   * Find price list by code
   */
  async findByCode(code: string): Promise<PriceList> {
    const priceList = await this.priceListRepository.findOne({
      where: { code, deletedAt: IsNull() },
      relations: { items: { product: true } },
    });

    if (!priceList) {
      throw new NotFoundException(`Price list with code ${code} not found`);
    }

    return priceList;
  }

  /**
   * Create a new price list
   */
  async create(createDto: CreatePriceListDto): Promise<PriceList> {
    // Check for duplicate code
    const existing = await this.priceListRepository.findOne({
      where: { code: createDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Price list with code ${createDto.code} already exists`,
      );
    }

    // If this is set as default, unset other defaults
    if (createDto.isDefault) {
      await this.priceListRepository.update(
        { isDefault: true },
        { isDefault: false },
      );
    }

    const priceList = this.priceListRepository.create({
      ...createDto,
    });

    return this.priceListRepository.save(priceList);
  }

  /**
   * Update a price list
   */
  async update(id: string, updateDto: UpdatePriceListDto): Promise<PriceList> {
    const priceList = await this.findOne(id, false);

    // Check for duplicate code if code is being changed
    if (updateDto.code && updateDto.code !== priceList.code) {
      const existing = await this.priceListRepository.findOne({
        where: { code: updateDto.code },
      });

      if (existing) {
        throw new ConflictException(
          `Price list with code ${updateDto.code} already exists`,
        );
      }
    }

    // If this is being set as default, unset other defaults
    if (updateDto.isDefault && !priceList.isDefault) {
      await this.priceListRepository.update(
        { isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(priceList, updateDto);

    return this.priceListRepository.save(priceList);
  }

  /**
   * Soft delete a price list
   */
  async remove(id: string): Promise<void> {
    const priceList = await this.findOne(id, false);

    if (priceList.isDefault) {
      throw new BadRequestException("Cannot delete the default price list");
    }

    await this.priceListRepository.softDelete(id);
  }

  /**
   * Set a price list as default
   */
  async setDefault(id: string): Promise<PriceList> {
    const priceList = await this.findOne(id, false);

    // Unset other defaults
    await this.priceListRepository.update(
      { isDefault: true },
      { isDefault: false },
    );

    // Set this as default
    priceList.isDefault = true;

    return this.priceListRepository.save(priceList);
  }

  /**
   * Get all currently effective price lists
   */
  async getEffectivePriceLists(): Promise<PriceList[]> {
    const now = new Date();

    return this.priceListRepository
      .createQueryBuilder("priceList")
      .where("priceList.isActive = :isActive", { isActive: true })
      .andWhere("priceList.deletedAt IS NULL")
      .andWhere(
        "(priceList.effectiveFrom IS NULL OR priceList.effectiveFrom <= :now)",
        { now },
      )
      .andWhere(
        "(priceList.effectiveTo IS NULL OR priceList.effectiveTo >= :now)",
        { now },
      )
      .orderBy("priceList.isDefault", "DESC")
      .addOrderBy("priceList.code", "ASC")
      .getMany();
  }

  /**
   * Get default price list
   */
  async getDefaultPriceList(): Promise<PriceList> {
    const priceList = await this.priceListRepository.findOne({
      where: { isDefault: true, deletedAt: IsNull() },
      relations: { items: { product: true } },
    });

    if (!priceList) {
      throw new NotFoundException("No default price list found");
    }

    return priceList;
  }

  /**
   * Bulk update prices in a price list
   */
  async bulkUpdatePrices(
    priceListId: string,
    bulkUpdateDto: BulkUpdatePricesDto,
  ): Promise<PriceListItem[]> {
    // Verify price list exists
    await this.findOne(priceListId, false);

    const updatedItems: PriceListItem[] = [];

    for (const item of bulkUpdateDto.items) {
      let priceListItem = await this.priceListItemRepository.findOne({
        where: { priceListId, productId: item.productId },
      });

      if (!priceListItem) {
        // Create new item
        priceListItem = this.priceListItemRepository.create({
          priceListId,
          productId: item.productId,
          price: item.price,
          costBasis: item.costBasis,
          marginPercent: item.margin,
        });
      } else {
        // Update existing item
        priceListItem.price = item.price;
        if (item.costBasis !== undefined)
          priceListItem.costBasis = item.costBasis;
        if (item.margin !== undefined)
          priceListItem.marginPercent = item.margin;
      }

      updatedItems.push(await this.priceListItemRepository.save(priceListItem));
    }

    return updatedItems;
  }

  /**
   * Copy a price list
   */
  async copyPriceList(
    sourceId: string,
    newCode: string,
    newName: string,
  ): Promise<PriceList> {
    const sourcePriceList = await this.findOne(sourceId, true);

    // Check for duplicate code
    const existing = await this.priceListRepository.findOne({
      where: { code: newCode },
    });

    if (existing) {
      throw new ConflictException(
        `Price list with code ${newCode} already exists`,
      );
    }

    // Create new price list
    const newPriceList = this.priceListRepository.create({
      code: newCode,
      name: newName,
      description: `Copied from ${sourcePriceList.name}`,
      isDefault: false,
      isActive: true,
    });

    const savedPriceList = await this.priceListRepository.save(newPriceList);

    // Copy items
    if (sourcePriceList.items && sourcePriceList.items.length > 0) {
      const newItems = sourcePriceList.items.map((item) =>
        this.priceListItemRepository.create({
          priceListId: savedPriceList.id,
          productId: item.productId,
          price: item.price,
          costBasis: item.costBasis,
          marginPercent: item.marginPercent,
        }),
      );

      await this.priceListItemRepository.save(newItems);
    }

    return this.findOne(savedPriceList.id, true);
  }

  /**
   * Apply percentage adjustment to all prices in a price list
   */
  async applyPercentageAdjustment(
    priceListId: string,
    adjustmentDto: ApplyPercentageAdjustmentDto,
  ): Promise<PriceListItem[]> {
    await this.findOne(priceListId, false);

    const items = await this.priceListItemRepository.find({
      where: { priceListId },
    });

    if (items.length === 0) {
      throw new BadRequestException("No items found in this price list");
    }

    const { percentage, roundToWhole = false } = adjustmentDto;
    const multiplier = 1 + percentage / 100;

    const updatedItems: PriceListItem[] = [];

    for (const item of items) {
      let newPrice = item.price * multiplier;

      if (roundToWhole) {
        newPrice = Math.round(newPrice);
      }

      item.price = newPrice;

      // Recalculate margin if cost basis exists
      if (item.costBasis) {
        item.marginPercent = ((newPrice - item.costBasis) / newPrice) * 100;
      }

      updatedItems.push(await this.priceListItemRepository.save(item));
    }

    return updatedItems;
  }

  /**
   * Get price for a specific product in a price list
   */
  async getPriceForProduct(
    priceListId: string,
    productId: string,
  ): Promise<number | null> {
    const item = await this.priceListItemRepository.findOne({
      where: { priceListId, productId },
    });

    return item ? item.price : null;
  }

  /**
   * Get all items in a price list
   */
  async getItems(priceListId: string): Promise<PriceListItem[]> {
    return this.priceListItemRepository.find({
      where: { priceListId },
      relations: { product: true },
      order: { product: { name: "ASC" } },
    });
  }

  /**
   * Get all price list items for a specific product across all price lists
   */
  async getItemsForProduct(productId: string): Promise<PriceListItem[]> {
    return this.priceListItemRepository.find({
      where: { productId },
      relations: { priceList: true },
      order: { priceList: { code: "ASC" } },
    });
  }
}
