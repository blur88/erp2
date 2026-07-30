import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { applyPagination } from '@/common/pagination/apply-pagination';
import { formatDateInTimezone } from '@/common/utils/date-in-timezone';
import { PriceList, PriceListItem } from '@/database/entities';
import { SettingsService } from '../../settings/settings.service';
import { PriceListDefaultService } from './price-list-default.service';
import { CreatePriceListDto, UpdatePriceListDto, QueryPriceListsDto, BulkUpdatePricesDto, ApplyPercentageAdjustmentDto } from '../dto';

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
    private readonly settingsService: SettingsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly defaults: PriceListDefaultService,
  ) {}

  /**
   * Find all price lists with pagination and filtering
   */
  async findAll(query: QueryPriceListsDto): Promise<PaginatedResponse<PriceList>> {
    const { search, isActive, isDefault, page, limit } = query;

    const queryBuilder = this.priceListRepository.createQueryBuilder('priceList');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(priceList.code ILIKE :search OR priceList.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('priceList.isActive = :isActive', { isActive });
    }

    if (isDefault !== undefined) {
      queryBuilder.andWhere('priceList.isDefault = :isDefault', { isDefault });
    }

    // Soft delete filter
    queryBuilder.andWhere('priceList.deletedAt IS NULL');

    // Pagination
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    // Order by
    queryBuilder.orderBy('priceList.isDefault', 'DESC');
    queryBuilder.addOrderBy('priceList.code', 'ASC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
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
   * Create a new price list.
   *
   * `isDefault: true` performs creation and promotion in ONE transaction. This
   * preserves the existing API (no frontend follow-up request) and prevents a
   * two-request partial outcome, while keeping all transfer logic in
   * PriceListDefaultService.
   */
  async create(createDto: CreatePriceListDto): Promise<PriceList> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(PriceList, {
        where: { code: createDto.code },
      });

      if (existing) {
        throw new ConflictException(
          `Price list with code ${createDto.code} already exists`,
        );
      }

      const { isDefault, ...rest } = createDto as any;
      const created = await manager.save(
        PriceList,
        manager.create(PriceList, rest) as any,
      );

      if (isDefault) {
        return this.defaults.assignDefault(manager, created.id);
      }

      return created;
    });
  }

  /**
   * Update a price list.
   *
   * Locks and RELOADS before evaluating the guards. Reading isDefault outside
   * the lock allows: load A as non-default -> concurrent setDefault(A)
   * completes -> deactivate A on stale state -> zero defaults. The partial
   * index cannot prevent this.
   *
   * Default ownership never changes here; it changes only through
   * PriceListDefaultService (via setDefault or create).
   */
  async update(id: string, updateDto: UpdatePriceListDto): Promise<PriceList> {
    return this.dataSource.transaction(async (manager) => {
      await this.defaults.acquireLock(manager);

      const priceList = await manager.findOne(PriceList, {
        where: { id, deletedAt: IsNull() },
      });

      if (!priceList) {
        throw new NotFoundException(`Price list with ID ${id} not found`);
      }

      if (priceList.isDefault && updateDto.isDefault === false) {
        throw new BadRequestException(
          'Cannot unset the default price list. Set another active price list as default instead.',
        );
      }

      if (priceList.isDefault && (updateDto as any).isActive === false) {
        throw new BadRequestException(
          'Cannot deactivate the default price list. Set another active price list as default first.',
        );
      }

      if (!priceList.isDefault && updateDto.isDefault === true) {
        throw new BadRequestException(
          'Use the set-default action to change the default price list.',
        );
      }

      if (updateDto.code && updateDto.code !== priceList.code) {
        const existing = await manager.findOne(PriceList, {
          where: { code: updateDto.code },
        });

        if (existing) {
          throw new ConflictException(
            `Price list with code ${updateDto.code} already exists`,
          );
        }
      }

      // isDefault is either absent or an idempotent `true` on the list that is
      // already default; assigning it is a no-op either way.
      Object.assign(priceList, updateDto);

      return manager.save(PriceList, priceList);
    });
  }

  /**
   * Soft delete a price list.
   *
   * Locks and RELOADS before checking isDefault: without the lock a list can
   * become the default between the load and the delete.
   */
  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.defaults.acquireLock(manager);

      const priceList = await manager.findOne(PriceList, {
        where: { id, deletedAt: IsNull() },
      });

      if (!priceList) {
        throw new NotFoundException(`Price list with ID ${id} not found`);
      }

      if (priceList.isDefault) {
        throw new BadRequestException('Cannot delete the default price list');
      }

      await manager.softDelete(PriceList, id);
    });
  }

  /**
   * Set a price list as default. The atomic transfer: promoting B demotes A.
   */
  async setDefault(id: string): Promise<PriceList> {
    return this.dataSource.transaction((manager) =>
      this.defaults.assignDefault(manager, id),
    );
  }

  private async getAppToday(): Promise<string> {
    const { timezone } = await this.settingsService.getRegionalSettings();
    return formatDateInTimezone(new Date(), timezone);
  }

  /**
   * Get all currently effective price lists
   */
  async getEffectivePriceLists(): Promise<PriceList[]> {
    const today = await this.getAppToday();

    return this.priceListRepository
      .createQueryBuilder('priceList')
      .where('priceList.isActive = :isActive', { isActive: true })
      .andWhere('priceList.deletedAt IS NULL')
      .andWhere('(priceList.effectiveFrom IS NULL OR priceList.effectiveFrom <= :today)', { today })
      .andWhere('(priceList.effectiveTo IS NULL OR priceList.effectiveTo >= :today)', { today })
      .orderBy('priceList.isDefault', 'DESC')
      .addOrderBy('priceList.code', 'ASC')
      .getMany();
  }

  /**
   * Get default price list
   */
  async getDefaultPriceList(): Promise<PriceList> {
    const priceList = await this.priceListRepository.findOne({
      where: { isDefault: true, isActive: true, deletedAt: IsNull() },
      relations: { items: { product: true } },
    });

    if (!priceList) {
      throw new NotFoundException('No default price list found');
    }

    return priceList;
  }

  /**
   * Bulk update prices in a price list
   */
  async bulkUpdatePrices(
    priceListId: string,
    bulkUpdateDto: BulkUpdatePricesDto
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
        if (item.costBasis !== undefined) priceListItem.costBasis = item.costBasis;
        if (item.margin !== undefined) priceListItem.marginPercent = item.margin;
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
    newName: string
  ): Promise<PriceList> {
    const sourcePriceList = await this.findOne(sourceId, true);

    // Check for duplicate code
    const existing = await this.priceListRepository.findOne({
      where: { code: newCode },
    });

    if (existing) {
      throw new ConflictException(`Price list with code ${newCode} already exists`);
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
      const newItems = sourcePriceList.items.map(item =>
        this.priceListItemRepository.create({
          priceListId: savedPriceList.id,
          productId: item.productId,
          price: item.price,
          costBasis: item.costBasis,
          marginPercent: item.marginPercent,
        })
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
    adjustmentDto: ApplyPercentageAdjustmentDto
  ): Promise<PriceListItem[]> {
    await this.findOne(priceListId, false);

    const items = await this.priceListItemRepository.find({
      where: { priceListId },
    });

    if (items.length === 0) {
      throw new BadRequestException('No items found in this price list');
    }

    const { percentage, roundToWhole = false } = adjustmentDto;
    const multiplier = 1 + (percentage / 100);

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
  async getPriceForProduct(priceListId: string, productId: string): Promise<number | null> {
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
      order: { product: { name: 'ASC' } },
    });
  }

  /**
   * Get all price list items for a specific product across all price lists
   */
  async getItemsForProduct(productId: string): Promise<PriceListItem[]> {
    return this.priceListItemRepository.find({
      where: { productId },
      relations: { priceList: true },
      order: { priceList: { code: 'ASC' } },
    });
  }
}
