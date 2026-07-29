import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, UpdateResult, In, IsNull, FindOptionsWhere, Not } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { StockMovement, StockMovementType } from '../../../database/entities/stock-movement.entity';
import { StockAdjustmentItem } from '../../../database/entities/stock-adjustment.entity';

import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
  ProductResponseDto,
  ProductListResponseDto,
  BulkUpdatePricesDto,
  ProductStockSummaryDto,
  ProductImportDto,
  ProductImportResultDto,
} from '../dto/product.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchProducts } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_PRODUCT,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { CategoryService } from './category.service';
import { StockMovementService } from './stock-movement.service';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import {
  ValidationUtil,
  BulkOperationUtil,
  BulkOperationResponse,
} from '../../../common/utils/validation.util';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { generateBaseSlug } from '../../../common/utils/slug.util';
import { repoFor } from '../../../common/db/tx-helpers';

@Injectable()
export class ProductService extends BaseCrudService<
  Product,
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto
> {
  private readonly logger = new Logger(ProductService.name);
  private readonly MAX_IMPORT_DATA_ROWS = 1000;
  private readonly MAX_CSV_LINE_LENGTH = 8192;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
    @InjectRepository(StockAdjustmentItem)
    private readonly stockAdjustmentItemRepository: Repository<StockAdjustmentItem>,

    @InjectRepository(PurchaseCostHistory)
    private readonly purchaseCostHistoryRepository: Repository<PurchaseCostHistory>,
    @Inject(forwardRef(() => CategoryService))
    private readonly categoryService: CategoryService,
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
  ) {
    super(productRepository, auditLogService);
  }

  getEntityType(): string {
    return 'Product';
  }

  buildWhereClause(query: QueryProductsDto): FindOptionsWhere<Product> {
    const where: FindOptionsWhere<Product> = {};

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return where;
  }

  protected applyQueryBuilder(qb: any, query: QueryProductsDto): any {
    qb = qb
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.priceListItems',
        'priceListItems',
        'priceListItems.isActive = :isActiveItem',
        { isActiveItem: true },
      )
      .leftJoinAndSelect(
        'priceListItems.priceList',
        'priceList',
        'priceList.isActive = :isActiveList AND priceList.deletedAt IS NULL',
        { isActiveList: true },
      );

    if (query.categoryId) {
      qb = qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.type) {
      qb = qb.andWhere('product.type = :type', { type: query.type });
    }
    if (query.isActive !== undefined) {
      qb = qb.andWhere('product.isActive = :isActive', {
        isActive: query.isActive,
      });
    }
    if (query.outOfStock) {
      qb = qb.andWhere('product.stockQuantity <= 0');
    }
    if (query.minStock !== undefined) {
      qb = qb.andWhere('product.stockQuantity >= :minStock', {
        minStock: query.minStock,
      });
    }
    if (query.maxStock !== undefined) {
      qb = qb.andWhere('product.stockQuantity <= :maxStock', {
        maxStock: query.maxStock,
      });
    }

    return qb;
  }

  protected applySearch(qb: any, search: string, _alias: string): any {
    return qb.andWhere('(product.name ILIKE :search OR product.barcode ILIKE :search)', {
      search: `%${search}%`,
    });
  }

  protected get allowedSortFields(): string[] {
    return ['name', 'barcode', 'createdAt', 'stockQuantity', 'deletedAt'];
  }

  private buildProductListQuery(query: QueryProductsDto, options: { includeDeleted: boolean }) {
    let queryBuilder = this.productRepository.createQueryBuilder('product');

    if (options.includeDeleted) {
      queryBuilder = queryBuilder.withDeleted().where('product.deletedAt IS NOT NULL');
    } else {
      queryBuilder = queryBuilder.where('product.deletedAt IS NULL');
    }

    if (query.search) {
      queryBuilder = this.applySearch(queryBuilder, query.search, 'product');
    }

    return this.applyQueryBuilder(queryBuilder, query);
  }

  private applyProductOrdering(
    queryBuilder: any,
    query: QueryProductsDto,
    defaultSortField: 'name' | 'deletedAt',
  ) {
    const sortField = this.allowedSortFields.includes(query.sortBy ?? '')
      ? query.sortBy!
      : defaultSortField;
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    if (sortField === 'name') {
      queryBuilder.addSelect('UPPER(product.name)', 'name_upper');
      queryBuilder.orderBy('name_upper', sortOrder);
      return;
    }

    queryBuilder.orderBy(`product.${sortField}`, sortOrder);
  }

  protected async afterDelete(entity: Product): Promise<void> {
    const activeSalesOrderItemCount = await this.salesOrderItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.salesOrder', 'order')
      .where('item.productId = :productId', { productId: entity.id })
      .andWhere('order.status = :status', { status: 'DRAFT' })
      .getCount();

    if (activeSalesOrderItemCount > 0) {
      throw new ConflictException(
        `Cannot delete '${entity.name}' - product is in ${activeSalesOrderItemCount} pending sales order(s). ` +
          `Please fulfill or cancel those orders first.`,
      );
    }
  }

  /**
   * Create a new product
   */
  async create(
    createProductDto: CreateProductDto,
    userId?: string,
    username?: string,
  ): Promise<ProductResponseDto> {
    this.logger.log(`Creating product with barcode: ${createProductDto.barcode}`);

    // Check if product name already exists (case-insensitive, including soft-deleted products)
    const existingProductByName = await this.productRepository
      .createQueryBuilder('product')
      .where('LOWER(product.name) = LOWER(:name)', {
        name: createProductDto.name.trim(),
      })
      .withDeleted()
      .getOne();

    if (existingProductByName) {
      if (existingProductByName.deletedAt) {
        throw new ConflictException(
          `Product with name '${createProductDto.name}' was previously deleted but cannot be reused. ` +
            `Please choose a different name or restore the deleted product.`,
        );
      } else {
        throw new ConflictException(`Product with name '${createProductDto.name}' already exists`);
      }
    }

    // Check if barcode already exists (case-insensitive, including soft-deleted products)
    if (createProductDto.barcode) {
      const existingProduct = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', {
          barcode: createProductDto.barcode.trim(),
        })
        .withDeleted()
        .getOne();

      if (existingProduct) {
        if (existingProduct.deletedAt) {
          throw new ConflictException(
            `Product with barcode '${createProductDto.barcode}' was previously deleted but cannot be reused. ` +
              `Please choose a different barcode.`,
          );
        } else {
          throw new ConflictException(
            `Product with barcode '${createProductDto.barcode}' already exists`,
          );
        }
      }
    }

    // Validate category exists
    const category = await this.categoryRepository.findOne({
      where: { id: createProductDto.categoryId, isEnabled: true },
    });

    if (!category) {
      throw new NotFoundException(
        `Category with ID '${createProductDto.categoryId}' not found or inactive`,
      );
    }

    // Validate pricing logic
    this.validatePricing(createProductDto);

    // Create product with stockQuantity=0 — the initial stock movement below sets the real balance.
    // Saving the requested quantity here would cause a double-count (saved qty + movement qty).
    const product = this.productRepository.create({
      ...createProductDto,
      stockQuantity: 0,
      isActive: createProductDto.isActive ?? true,
      type: createProductDto.type || ProductType.GOODS,
    });
    product.slug = await this.generateUniqueSlug(createProductDto.name);

    const savedProduct = await this.productRepository.save(product);

    // Set the category relationship for the response DTO
    savedProduct.category = category;

    // Create initial stock movement if current stock provided.
    // The movement updates stockQuantity via updateStockQuantity, so the product is saved with 0 above.
    // For system users (no userId), skip the movement but set stockQuantity directly so the value isn't lost.
    if (createProductDto.stockQuantity && createProductDto.stockQuantity > 0) {
      if (userId) {
        try {
          await this.stockMovementService.recordInitialStock(
            savedProduct.id,
            createProductDto.stockQuantity,
            createProductDto.baseCost,
            userId,
          );
        } catch (error) {
          this.logger.warn(`Failed to create initial stock movement: ${error.message}`);
        }
      } else {
        await this.productRepository.update(savedProduct.id, {
          stockQuantity: createProductDto.stockQuantity,
        });
        savedProduct.stockQuantity = createProductDto.stockQuantity;
      }
    }

    // Create initial cost history for products with stock
    if (
      createProductDto.stockQuantity &&
      createProductDto.stockQuantity > 0 &&
      createProductDto.baseCost
    ) {
      try {
        this.logger.log(
          `Creating initial cost history for product ${savedProduct.id}: ${createProductDto.stockQuantity} units @ RM ${createProductDto.baseCost}`,
        );

        await this.baseCostCalculator.addStock(
          savedProduct.id,
          null, // No GRN for initial stock
          createProductDto.stockQuantity,
          createProductDto.baseCost,
          0, // No shipping for initial stock
          new Date(), // Current date as received date
        );

        this.logger.log(`Initial cost history created for product ${savedProduct.id}`);
      } catch (error) {
        this.logger.warn(`Failed to create initial cost history: ${error.message}`);
      }
    }

    // Log audit trail
    await this.auditLogService.log(
      'CREATE',
      'Product',
      `Created product: ${savedProduct.name} (${savedProduct.barcode})`,
      {
        entityId: savedProduct.id,
        userId: userId || 'system',
        username,
        newValues: {
          name: savedProduct.name,
          barcode: savedProduct.barcode,
          baseCost: savedProduct.baseCost,
          stockQuantity: savedProduct.stockQuantity,
        },
      },
    );

    this.logger.log(`Product created successfully with ID: ${savedProduct.id}`);
    const fullPathMap = savedProduct.categoryId
      ? await this.categoryService.resolveFullPaths([savedProduct.categoryId])
      : undefined;
    return this.toResponseDto(savedProduct, fullPathMap);
  }

  /**
   * Find all products with filtering and sorting
   */
  async findAll(query: QueryProductsDto): Promise<ProductListResponseDto> {
    const queryBuilder = this.buildProductListQuery(query, {
      includeDeleted: false,
    });
    this.applyProductOrdering(queryBuilder, query, 'name');
    const [products, total] = await queryBuilder.getManyAndCount();

    const fullPathMap = await this.categoryService.resolveFullPaths(
      [...new Set(products.map((p) => p.categoryId).filter(Boolean))] as string[],
    );
    const data = products.map((product) => this.toResponseDto(product, fullPathMap));

    return {
      data,
      meta: { total },
    };
  }

  async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
    if (!canSearchProducts(user.role)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const products = await this.productRepository
      .createQueryBuilder('product')
      .where('product.deletedAt IS NULL')
      .andWhere('(product.name ILIKE :q OR product.barcode ILIKE :q)', {
        q: `%${trimmed}%`,
      })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (products.length > 0) {
      return products.map((product) => this.mapProduct(product, q, false));
    }

    const fuzzyProducts = await this.productRepository
      .createQueryBuilder('product')
      .addSelect('GREATEST(similarity(product.name, :q), similarity(product.barcode, :q))', 'sim')
      .where('product.deletedAt IS NULL')
      // Threshold comes from pg_trgm.similarity_threshold (default 0.3).
      .andWhere('(product.name % :q OR product.barcode % :q)')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyProducts.map((product) => this.mapProduct(product, q, true));
  }

  private mapProduct(product: Product, q: string, fuzzy: boolean): GlobalSearchResultDto {
    const name = product.name?.toLowerCase() ?? '';
    const barcode = product.barcode?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : barcode && barcode === q
        ? SCORE_EXACT_CODE
        : barcode && barcode.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : name === q
            ? SCORE_EXACT_NAME
            : name.startsWith(q)
              ? SCORE_STARTSWITH_NAME
              : SCORE_CONTAINS;

    return {
      type: 'product',
      id: product.id,
      label: product.name,
      description: product.barcode,
      route: `/inventory/products/${product.id}/edit`,
      score:
        baseScore +
        BOOST_PRODUCT +
        (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
    };
  }

  /**
   * Find one product by ID
   */
  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true, priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    const fullPathMap = product.categoryId
      ? await this.categoryService.resolveFullPaths([product.categoryId])
      : undefined;
    return this.toResponseDto(product, fullPathMap);
  }

  /**
   * Find one product by barcode
   */
  async findByBarcode(barcode: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { barcode },
      relations: { category: true, priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with barcode '${barcode}' not found`);
    }

    const fullPathMap = product.categoryId
      ? await this.categoryService.resolveFullPaths([product.categoryId])
      : undefined;
    return this.toResponseDto(product, fullPathMap);
  }

  async findBySlug(slug: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { slug },
      relations: { category: true, priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug '${slug}' not found`);
    }

    const fullPathMap = product.categoryId
      ? await this.categoryService.resolveFullPaths([product.categoryId])
      : undefined;
    return this.toResponseDto(product, fullPathMap);
  }

  /**
   * Check for duplicate product names and barcodes (including soft-deleted)
   */
  async checkDuplicate(params: { name?: string; barcode?: string; excludeId?: string }): Promise<{
    nameExists: boolean;
    barcodeExists: boolean;
    nameConflict?: {
      id: string;
      name: string;
      isDeleted: boolean;
      barcode?: string;
    };
    barcodeConflict?: {
      id: string;
      name: string;
      isDeleted: boolean;
      barcode?: string;
    };
  }> {
    this.logger.log(`Checking duplicate for name: "${params.name}", barcode: "${params.barcode}"`);

    const result = {
      nameExists: false,
      barcodeExists: false,
      nameConflict: undefined as any,
      barcodeConflict: undefined as any,
    };

    // Check name duplicate
    if (params.name && params.name.trim()) {
      const nameQuery = this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.name) = LOWER(:name)', {
          name: params.name.trim(),
        })
        .withDeleted();

      if (params.excludeId) {
        nameQuery.andWhere('product.id != :excludeId', {
          excludeId: params.excludeId,
        });
      }

      const existingByName = await nameQuery.getOne();

      if (existingByName) {
        result.nameExists = true;
        result.nameConflict = {
          id: existingByName.id,
          name: existingByName.name,
          isDeleted: !!existingByName.deletedAt,
          barcode: existingByName.barcode,
        };
      }
    }

    // Check barcode duplicate
    if (params.barcode && params.barcode.trim()) {
      const barcodeQuery = this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', {
          barcode: params.barcode.trim(),
        })
        .withDeleted();

      if (params.excludeId) {
        barcodeQuery.andWhere('product.id != :excludeId', {
          excludeId: params.excludeId,
        });
      }

      const existingByBarcode = await barcodeQuery.getOne();

      if (existingByBarcode) {
        result.barcodeExists = true;
        result.barcodeConflict = {
          id: existingByBarcode.id,
          name: existingByBarcode.name,
          isDeleted: !!existingByBarcode.deletedAt,
          barcode: existingByBarcode.barcode,
        };
      }
    }

    return result;
  }

  /**
   * Find all soft-deleted products
   */
  async findDeleted(query: QueryProductsDto): Promise<ProductListResponseDto> {
    this.logger.log('Fetching deleted products with filters:', query);

    const queryBuilder = this.buildProductListQuery(query, {
      includeDeleted: true,
    });
    this.applyProductOrdering(queryBuilder, query, 'deletedAt');
    const [deletedProducts, total] = await queryBuilder.getManyAndCount();

    const fullPathMap = await this.categoryService.resolveFullPaths(
      [...new Set(deletedProducts.map((p) => p.categoryId).filter(Boolean))] as string[],
    );
    const productDtos = deletedProducts.map((product) => this.toResponseDto(product, fullPathMap));

    return {
      data: productDtos,
      meta: { total },
    };
  }

  /**
   * Restore a soft-deleted product
   */
  async restore(id: string, userId?: string, username?: string): Promise<ProductResponseDto> {
    this.logger.log(`Restoring product with ID: ${id}`);

    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true },
      withDeleted: true,
    });

    // Use standardized validation
    ValidationUtil.validateForRestore(product, 'Product', id);

    // Check if barcode is still unique (case-insensitive, another product might have been created with the same barcode)
    if (product.barcode) {
      const existingProduct = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', {
          barcode: product.barcode,
        })
        .andWhere('product.id != :id', { id: product.id })
        .getOne();

      ValidationUtil.validateUniquenessForRestore(
        existingProduct,
        'barcode',
        product.barcode,
        'Product',
      );
    }

    // Restore the product
    await this.productRepository.restore(id);

    // Fetch the restored product
    const restoredProduct = await this.productRepository.findOne({
      where: { id },
      relations: { category: true, priceListItems: { priceList: true } },
    });

    // Log audit trail for restore
    await this.auditLogService.log(
      'RESTORE',
      'Product',
      `Restored product: ${restoredProduct.name} (${restoredProduct.barcode})`,
      {
        entityId: restoredProduct.id,
        userId: userId || 'system',
        username,
        newValues: {
          name: restoredProduct.name,
          barcode: restoredProduct.barcode,
          baseCost: restoredProduct.baseCost,
          stockQuantity: restoredProduct.stockQuantity,
        },
      },
    );

    const fullPathMap = restoredProduct!.categoryId
      ? await this.categoryService.resolveFullPaths([restoredProduct!.categoryId])
      : undefined;
    return this.toResponseDto(restoredProduct!, fullPathMap);
  }

  /**
   * Bulk restore soft-deleted products
   */
  async bulkRestore(
    productIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    this.logger.log(`Bulk restoring ${productIds.length} products`);

    if (!productIds || productIds.length === 0) {
      return BulkOperationUtil.createResponse('restored', 'product', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    // Process each product individually to handle failures gracefully
    for (const id of productIds) {
      try {
        // Find the product (including soft-deleted ones)
        const product = await this.productRepository.findOne({
          where: { id },
          relations: { category: true },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForRestore(product, 'Product', id);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, id, error.message, 'VALIDATION_ERROR');
          continue;
        }

        // Check if barcode is still unique (case-insensitive)
        if (product.barcode) {
          const existingProduct = await this.productRepository
            .createQueryBuilder('product')
            .where('LOWER(product.barcode) = LOWER(:barcode)', {
              barcode: product.barcode,
            })
            .andWhere('product.id != :id', { id: product.id })
            .getOne();

          if (existingProduct) {
            BulkOperationUtil.addFailure(
              failedItems,
              id,
              `Barcode '${product.barcode}' is now used by another active product`,
              'BARCODE_CONFLICT',
            );
            continue;
          }
        }

        // Restore the product
        await this.productRepository.restore(id);

        await this.auditLogService.log(
          'RESTORE',
          'Product',
          `Restored product: ${product.name} (${product.barcode})`,
          { entityId: id, userId: userId || 'system', username },
        );

        successCount++;
        this.logger.log(`Product restored: ${id}`);
      } catch (error) {
        this.logger.error(`Failed to restore product ${id}: ${error.message}`);
        BulkOperationUtil.addFailure(failedItems, id, error.message, 'UNEXPECTED_ERROR');
      }
    }

    return BulkOperationUtil.createResponse('restored', 'product', successCount, failedItems);
  }

  /**
   * Permanently delete a product from database
   */
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Permanently deleting product with ID: ${id}`);

    // Find the product (including soft-deleted ones)
    const product = await this.productRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    // Use standardized validation
    ValidationUtil.validateForPermanentDelete(product, 'Product', id);

    // Check for dependencies before permanent deletion
    const dependencies = await this.checkProductDependencies(id);

    if (dependencies.hasDependencies) {
      const dependencyList = dependencies.dependencies
        .map((dep) => `${dep.count} ${dep.type}`)
        .join(', ');

      throw new ConflictException(
        `Cannot permanently delete '${product.name}' - product has dependent records: ${dependencyList}. ` +
          `These records must be removed first before permanent deletion.`,
      );
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'Product',
      `Permanently deleted product: ${product.name} (${product.barcode})`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: {
          name: product.name,
          barcode: product.barcode,
          baseCost: product.baseCost,
          stockQuantity: product.stockQuantity,
        },
      },
    );

    // Delete initial_stock movement before hard delete — stock_movements FK is RESTRICT so the DB
    // will reject the product delete if this row remains. purchase_cost_history has CASCADE so
    // the DB removes it automatically; no explicit delete needed there.
    await this.stockMovementRepository.delete({
      productId: id,
      movementType: StockMovementType.INITIAL_STOCK,
    });

    // Hard delete the product from database
    await this.productRepository.delete(id);

    this.logger.log(`Product permanently deleted: ${id}`);
  }

  /**
   * Bulk permanently delete products from database
   */
  async bulkPermanentDelete(
    productIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    this.logger.log(`Bulk permanently deleting ${productIds.length} products`);

    if (!productIds || productIds.length === 0) {
      return BulkOperationUtil.createResponse('permanently deleted', 'product', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    // Process each product individually to handle failures gracefully
    for (const id of productIds) {
      try {
        // Find the product (including soft-deleted ones)
        const product = await this.productRepository.findOne({
          where: { id },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForPermanentDelete(product, 'Product', id);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, id, error.message, 'VALIDATION_ERROR');
          continue;
        }

        // Check for dependencies before permanent deletion
        const dependencies = await this.checkProductDependencies(id);

        if (dependencies.hasDependencies) {
          const dependencyList = dependencies.dependencies
            .map((dep) => `${dep.count} ${dep.type}`)
            .join(', ');

          BulkOperationUtil.addFailure(
            failedItems,
            id,
            `Product '${product.name}' has dependent records: ${dependencyList}`,
            'DEPENDENCY_ERROR',
          );
          continue;
        }

        // Hard delete the product from database
        await this.auditLogService.log(
          'PERMANENT_DELETE',
          'Product',
          `Permanently deleted product: ${product.name} (${product.barcode})`,
          {
            entityId: id,
            userId: userId || 'system',
            username,
            oldValues: { name: product.name, barcode: product.barcode },
          },
        );
        // Delete initial_stock movement before hard delete — stock_movements FK is RESTRICT.
        // purchase_cost_history has CASCADE so the DB removes it automatically.
        await this.stockMovementRepository.delete({
          productId: id,
          movementType: StockMovementType.INITIAL_STOCK,
        });
        await this.productRepository.delete(id);

        successCount++;
        this.logger.log(`Product permanently deleted: ${id}`);
      } catch (error) {
        this.logger.error(`Failed to permanently delete product ${id}: ${error.message}`);
        BulkOperationUtil.addFailure(failedItems, id, error.message, 'UNEXPECTED_ERROR');
      }
    }

    return BulkOperationUtil.createResponse(
      'permanently deleted',
      'product',
      successCount,
      failedItems,
    );
  }

  /**
   * Update a product
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    userId?: string,
    username?: string,
  ): Promise<ProductResponseDto> {
    this.logger.log(`Updating product with ID: ${id}`);

    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    // Y6 (#775/#804): block Stocked→Service conversion while stock remains.
    // Avoids silently zeroing stock without an audit trail.
    if (
      updateProductDto.type === ProductType.SERVICE &&
      product.type === ProductType.GOODS &&
      Number(product.stockQuantity) > 0
    ) {
      throw new BadRequestException(
        'Reduce stock to 0 via a Stock Adjustment before converting to a Service',
      );
    }

    // Check for name conflicts if name is being changed (case-insensitive)
    if (
      updateProductDto.name &&
      updateProductDto.name.toLowerCase() !== product.name.toLowerCase()
    ) {
      const existingProductByName = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.name) = LOWER(:name)', {
          name: updateProductDto.name.trim(),
        })
        .andWhere('product.id != :id', { id: product.id })
        .withDeleted()
        .getOne();

      if (existingProductByName) {
        if (existingProductByName.deletedAt) {
          throw new ConflictException(
            `Product with name '${updateProductDto.name}' was previously deleted but cannot be reused. ` +
              `Please choose a different name or restore the deleted product.`,
          );
        } else {
          throw new ConflictException(
            `Product with name '${updateProductDto.name}' already exists`,
          );
        }
      }
    }

    // Check for barcode conflicts if barcode is being changed (case-insensitive)
    if (
      updateProductDto.barcode &&
      updateProductDto.barcode.toLowerCase() !== product.barcode?.toLowerCase()
    ) {
      const existingProduct = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', {
          barcode: updateProductDto.barcode.trim(),
        })
        .andWhere('product.id != :id', { id: product.id })
        .withDeleted()
        .getOne();

      if (existingProduct) {
        if (existingProduct.deletedAt) {
          throw new ConflictException(
            `Product with barcode '${updateProductDto.barcode}' was previously deleted but cannot be reused. ` +
              `Please choose a different barcode or restore the deleted product.`,
          );
        } else {
          throw new ConflictException(
            `Product with barcode '${updateProductDto.barcode}' already exists`,
          );
        }
      }
    }

    // Validate category if being changed
    if (updateProductDto.categoryId && updateProductDto.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateProductDto.categoryId, isEnabled: true },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID '${updateProductDto.categoryId}' not found or inactive`,
        );
      }
    }

    // Transform DTO fields to match entity fields FIRST
    const updateData: any = { ...updateProductDto };
    const nameChanged =
      updateProductDto.name !== undefined && updateProductDto.name !== product.name;
    if (nameChanged) {
      updateData.slug = await this.generateUniqueSlug(updateProductDto.name!, id);
    }

    // stockQuantity is handled directly in the DTO

    // Update pricingTiers - prioritize direct pricingTiers if provided
    if (updateData.pricingTiers && Object.keys(updateData.pricingTiers).length > 0) {
      // Direct pricingTiers provided (from new UI) - use as-is
      this.logger.log('Using directly provided pricingTiers from DTO');
    }

    // Validate pricing if any pricing changes
    if (updateData.pricingTiers || this.hasPricingChanges(updateData)) {
      this.validatePricing({ ...product, ...updateData } as any);
    }

    // Track changes for audit (use transformed data)
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== product[key]) {
        changes[key] = { from: product[key], to: updateData[key] };
      }
    });

    // Update product with transformed data
    Object.assign(product, updateData);

    // Stock status is computed automatically in the entity

    // Use direct update with ID string for better control over what gets updated
    await this.productRepository.update(
      id, // Use the ID parameter directly, not product.id
      updateData,
    );

    // Reload the product with category and price list relations to ensure fresh data
    const productWithCategory = await this.productRepository.findOne({
      where: { id },
      relations: { category: true, priceListItems: { priceList: true } },
    });

    // Log audit trail for update
    if (Object.keys(changes).length > 0) {
      await this.auditLogService.log(
        'UPDATE',
        'Product',
        `Updated product: ${productWithCategory.name} (${productWithCategory.barcode})`,
        {
          entityId: productWithCategory.id,
          userId: userId || 'system',
          username,
          oldValues: Object.fromEntries(
            Object.entries(changes).map(([key, val]) => [key, val.from]),
          ),
          newValues: Object.fromEntries(Object.entries(changes).map(([key, val]) => [key, val.to])),
        },
      );
    }

    this.logger.log(`Product updated successfully: ${id}`);
    const fullPathMap = productWithCategory!.categoryId
      ? await this.categoryService.resolveFullPaths([productWithCategory!.categoryId])
      : undefined;
    return this.toResponseDto(productWithCategory!, fullPathMap);
  }

  /**
   * Check if product has dependencies that prevent deletion
   */
  async checkProductDependencies(productId: string): Promise<{
    hasDependencies: boolean;
    dependencies: Array<{ type: string; count: number }>;
  }> {
    const dependencies = [];

    // Check sales order items
    const salesOrderItemCount = await this.salesOrderItemRepository.count({
      where: { productId },
    });
    if (salesOrderItemCount > 0) {
      dependencies.push({
        type: 'sales order items',
        count: salesOrderItemCount,
      });
    }

    // Check purchase order items
    const purchaseOrderItemCount = await this.purchaseOrderItemRepository.count({
      where: { productId },
    });
    if (purchaseOrderItemCount > 0) {
      dependencies.push({
        type: 'purchase order items',
        count: purchaseOrderItemCount,
      });
    }

    // Check stock movements — exclude system-generated initial_stock entries
    const stockMovementCount = await this.stockMovementRepository.count({
      where: { productId, movementType: Not(StockMovementType.INITIAL_STOCK) },
    });
    if (stockMovementCount > 0) {
      dependencies.push({ type: 'stock movements', count: stockMovementCount });
    }

    // Check stock adjustment items
    const stockAdjustmentItemCount = await this.stockAdjustmentItemRepository.count({
      where: { productId },
    });
    if (stockAdjustmentItemCount > 0) {
      dependencies.push({
        type: 'stock adjustment items',
        count: stockAdjustmentItemCount,
      });
    }

    return {
      hasDependencies: dependencies.length > 0,
      dependencies,
    };
  }

  /**
   * Delete a product (soft delete using TypeORM)
   *
   * Note: Soft delete is allowed even with active references (stock movements, orders)
   * since the product record is preserved and historical data remains intact.
   * Only check for active sales order items to prevent deletion of products
   * currently in pending orders.
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Deleting product with ID: ${id}`);
    await this.softDelete(id, userId || 'system', username);
    this.logger.log(`Product soft-deleted successfully: ${id}`);
  }

  /**
   * Bulk update product prices
   */
  async bulkUpdatePrices(bulkUpdateDto: BulkUpdatePricesDto): Promise<void> {
    this.logger.log(`Bulk updating prices for ${bulkUpdateDto.products.length} products`);

    const productIds = bulkUpdateDto.products.map((p) => p.productId);
    const products = await this.productRepository.findBy({
      id: In(productIds),
    });

    if (products.length !== productIds.length) {
      const foundIds = products.map((p) => p.id);
      const missingIds = productIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Products not found: ${missingIds.join(', ')}`);
    }

    const updates: Promise<UpdateResult>[] = [];
    // Audit promises removed with authentication system

    for (const priceUpdate of bulkUpdateDto.products) {
      const product = products.find((p) => p.id === priceUpdate.productId)!;
      const updateData: Partial<Product> = {};

      // Track price changes
      const priceChanges: Record<string, { from: number; to: number }> = {};

      // NOTE: pricingTiers removed in Phase 8 - pricing now managed via Price Lists
      // Only baseCost is directly on Product entity now

      if (priceUpdate.baseCost !== undefined && priceUpdate.baseCost !== product.baseCost) {
        updateData.baseCost = priceUpdate.baseCost;
        priceChanges.baseCost = {
          from: Number(product.baseCost),
          to: priceUpdate.baseCost,
        };
      }

      if (Object.keys(updateData).length > 0) {
        // Validate new pricing
        this.validatePricing({ ...product, ...updateData } as any);

        updates.push(this.productRepository.update(priceUpdate.productId, updateData));

        // Audit logging removed with authentication system
      }
    }

    await Promise.all(updates);

    this.logger.log(`Bulk price update completed for ${updates.length} products`);
  }

  /**
   * Get stock summary for products
   */
  async getStockSummary(filters?: Partial<QueryProductsDto>): Promise<ProductStockSummaryDto[]> {
    const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('product.stockMovements', 'movements')
      .select([
        'product.id',
        'product.barcode',
        'product.name',
        'product.stockQuantity',
        'category.name',
        'MAX(movements.movementDate) as lastMovementDate',
      ])
      .groupBy('product.id, category.id');

    // Apply filters if provided
    if (filters?.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });
    }

    if (filters?.lowStock) {
      queryBuilder.andWhere('product.stockQuantity <= :lowStockThreshold', {
        lowStockThreshold,
      });
    }

    if (filters?.outOfStock) {
      queryBuilder.andWhere('product.stockQuantity <= 0');
    }

    if (filters?.isActive !== undefined) {
      queryBuilder.andWhere('product.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    queryBuilder.orderBy('product.name', 'ASC');

    const results = await queryBuilder.getRawMany();

    return results.map((result) => ({
      id: result.product_id,
      barcode: result.product_barcode,
      name: result.product_name,
      stockQuantity: Number(result.product_stockQuantity),
      availableQuantity: Number(result.product_stockQuantity),
      reservedQuantity: 0, // Simplified model doesn't track reserved stock
      reorderLevel: lowStockThreshold,
      stockStatus:
        Number(result.product_stockQuantity) <= 0
          ? 'out_of_stock'
          : Number(result.product_stockQuantity) <= lowStockThreshold
            ? 'low_stock'
            : 'in_stock',
      isLowStock: Number(result.product_stockQuantity) <= lowStockThreshold,
      isOutOfStock: Number(result.product_stockQuantity) <= 0,
      categoryName: result.category_name,
      lastMovementDate: result.lastMovementDate ? new Date(result.lastMovementDate) : undefined,
    }));
  }

  /**
   * Get products with low stock
   */
  async getLowStockProducts(): Promise<ProductStockSummaryDto[]> {
    return this.getStockSummary({ lowStock: true, isActive: true });
  }

  /**
   * Get products that are out of stock
   */
  async getOutOfStockProducts(): Promise<ProductStockSummaryDto[]> {
    return this.getStockSummary({ outOfStock: true, isActive: true });
  }

  /**
   * Reserve stock for a product
   */
  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    if (product.stockQuantity >= quantity) {
      product.stockQuantity = Number(product.stockQuantity) - quantity;
      await this.productRepository.save(product);
      return true;
    }

    return false;
  }

  /**
   * Update stock quantity for a product (internal use by stock movement service)
   */
  async updateStockQuantity(
    productId: string,
    newQuantity: number,
    _userId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    const productRepo = repoFor(manager, Product, this.productRepository);
    const product = await productRepo.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const previousQuantity = product.stockQuantity;
    product.stockQuantity = newQuantity;

    await productRepo.save(product);

    this.logger.log(
      `Stock quantity updated for product ${productId}: ${previousQuantity} -> ${newQuantity}`,
    );
  }

  /**
   * Get dashboard statistics for inventory overview
   */
  async getDashboardStats(): Promise<{
    totalProducts: number;
    totalCategories: number;
    inventoryValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    recentMovements: number;
    categoryBreakdown: Array<{
      category: string;
      count: number;
      value: number;
    }>;
    stockHealthMetrics: {
      inStockPercentage: number;
      outOfStockPercentage: number;
      averageValue: number;
    };
  }> {
    this.logger.log('Fetching dashboard statistics');
    const { lowStockThreshold } = await this.settingsService.getRegionalSettings();

    // Get total products count
    const totalProducts = await this.productRepository.count({
      where: { deletedAt: IsNull() },
    });

    // Get total categories count
    const totalCategories = await this.categoryRepository.count({
      where: { isActive: true },
    });

    // Get all active products with category info for calculations
    const products = await this.productRepository.find({
      relations: { category: true },
      where: { deletedAt: IsNull() },
    });

    // Calculate comprehensive statistics
    let inventoryValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const categoryMap = new Map<string, { count: number; value: number }>();

    products.forEach((product) => {
      const stock = Number(product.stockQuantity) || 0;
      // Use baseCost for inventory valuation (standard accounting practice)
      const cost = Number(product.baseCost) || 0;

      // Calculate inventory value at cost
      inventoryValue += stock * cost;

      // Count low stock and out of stock using the configured threshold
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= lowStockThreshold) {
        lowStockCount++;
      }

      // Category breakdown
      const categoryName = product.category?.name || 'Uncategorized';
      const existing = categoryMap.get(categoryName) || { count: 0, value: 0 };
      existing.count += 1;
      existing.value += stock * cost;
      categoryMap.set(categoryName, existing);
    });

    // Convert category map to array and sort by value
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 categories

    // Calculate stock health metrics (only in-stock vs out-of-stock)
    const inStockCount = totalProducts - outOfStockCount;
    const stockHealthMetrics = {
      inStockPercentage: totalProducts > 0 ? Math.round((inStockCount / totalProducts) * 100) : 0,
      outOfStockPercentage:
        totalProducts > 0 ? Math.round((outOfStockCount / totalProducts) * 100) : 0,
      averageValue: totalProducts > 0 ? inventoryValue / totalProducts : 0,
    };

    // Get recent movements count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentMovements = 0;
    try {
      // Try to get recent movements count from stock movement service
      const movementsQuery = await this.stockMovementService.findAll({
        page: 1,
        limit: 1,
        fromDate: thirtyDaysAgo,
      });
      recentMovements = movementsQuery.meta?.total || 0;
    } catch (error) {
      this.logger.warn('Could not fetch recent movements count:', error.message);
      recentMovements = 0;
    }

    const stats = {
      totalProducts,
      totalCategories,
      inventoryValue: Number(inventoryValue.toFixed(2)),
      lowStockCount,
      outOfStockCount,
      recentMovements,
      categoryBreakdown,
      stockHealthMetrics,
    };

    this.logger.log('Dashboard statistics calculated successfully');
    return stats;
  }

  /**
   * Get product prices from all price lists
   */
  async getProductPrices(productId: string): Promise<
    Array<{
      priceListId: string;
      priceListCode: string;
      priceListName: string;
      price: number;
      costBasis: number | null;
      margin: number | null;
    }>
  > {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: { priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    if (!product.priceListItems || product.priceListItems.length === 0) {
      return [];
    }

    return product.priceListItems.map((item) => ({
      priceListId: item.priceListId,
      priceListCode: item.priceList.code,
      priceListName: item.priceList.name,
      price: Number(item.price),
      costBasis: item.costBasis ? Number(item.costBasis) : null,
      margin: item.marginPercent ? Number(item.marginPercent) : null,
    }));
  }

  /**
   * Convert product entity to response DTO
   */
  private toResponseDto(product: Product, fullPathMap?: Map<string, string>): ProductResponseDto {
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      barcode: product.barcode,
      type: product.type,
      isActive: product.isActive,
      baseCost: Number(product.baseCost),
      // NOTE: pricingTiers removed in Phase 8 - pricing now managed via Price Lists
      stockQuantity: Number(product.stockQuantity),
      notes: product.notes,
      categoryId: product.categoryId,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
            fullPath: fullPathMap?.get(product.categoryId) ?? product.category.name,
          }
        : null,
      priceListItems:
        product.priceListItems?.map((item) => ({
          id: item.id,
          priceListId: item.priceListId,
          productId: item.productId,
          price: Number(item.price),
          costBasis: item.costBasis ? Number(item.costBasis) : null,
          marginPercent: item.marginPercent ? Number(item.marginPercent) : null,
          priceList: item.priceList
            ? {
                id: item.priceList.id,
                code: item.priceList.code,
                name: item.priceList.name,
                priority: item.priceList.priority,
                isDefault: item.priceList.isDefault,
                isActive: item.priceList.isActive,
              }
            : undefined,
        })) || [],
      isOutOfStock: product.isOutOfStock,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
    } as any;
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = generateBaseSlug(name);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.productRepository.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${counter++}`;
    }
  }

  /**
   * Validate product pricing logic
   */
  private validatePricing(productData: any): void {
    // No pricing constraints - all prices can be any value relative to each other
    // This allows complete flexibility in pricing strategies
  }

  /**
   * Check if the update contains pricing changes
   */
  private hasPricingChanges(_updateDto: UpdateProductDto): boolean {
    return ['baseCost', 'pricingTiers'].some((field) => _updateDto.hasOwnProperty(field));
  }

  /**
   * Import products from CSV/Excel file
   */
  async importProducts(
    file: Express.Multer.File,
    importDto: ProductImportDto,
  ): Promise<ProductImportResultDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`Starting product import from ${importDto.format} file: ${file.originalname}`);

    const result: ProductImportResultDto = {
      totalRows: 0,
      successCount: 0,
      failureCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errors: [],
      warnings: [],
      importedProductIds: [],
    };

    try {
      // Parse the file based on format
      const rows = await this.parseImportFile(file, importDto.format);
      result.totalRows = rows.length;

      if (rows.length === 0) {
        throw new BadRequestException('No data rows found in file');
      }

      // Get all categories for mapping
      const categories = await this.categoryRepository.find({
        where: { isActive: true },
      });
      const categoryMap = new Map(categories.map((cat) => [cat.name.toLowerCase(), cat.id]));

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2; // +2 because we skip header and rows are 0-indexed
        const row = rows[i];

        try {
          // Validate and process the row
          const productData = await this.validateAndProcessRow(row, rowNumber, categoryMap, result);

          if (!productData) {
            result.skippedCount++;
            continue;
          }

          // Check for duplicates
          const existingProduct = await this.findDuplicateProduct(
            productData.name,
            productData.barcode,
          );

          if (existingProduct) {
            if (importDto.updateExisting) {
              // Update existing product
              await this.update(existingProduct.id, productData as UpdateProductDto, 'system');
              result.updatedCount++;
              result.importedProductIds.push(existingProduct.id);
              result.warnings.push({
                row: rowNumber,
                message: `Updated existing product: ${productData.name}`,
              });
            } else if (importDto.skipDuplicates) {
              // Skip duplicate
              result.skippedCount++;
              result.warnings.push({
                row: rowNumber,
                message: `Skipped duplicate product: ${productData.name}`,
              });
            } else {
              // Report error
              result.failureCount++;
              result.errors.push({
                row: rowNumber,
                field: 'name/barcode',
                message: `Product already exists: ${productData.name}`,
                value: productData.name,
              });
            }
          } else {
            // Create new product
            const createdProduct = await this.create(productData as CreateProductDto, 'system');
            result.successCount++;
            result.importedProductIds.push(createdProduct.id);
          }
        } catch (error) {
          result.failureCount++;
          result.errors.push({
            row: rowNumber,
            field: 'general',
            message: error.message || 'Unknown error occurred',
            value: row.name || 'Unknown product',
          });
          this.logger.error(`Error processing row ${rowNumber}:`, error);
        }
      }

      this.logger.log(
        `Import completed: ${result.successCount} created, ${result.updatedCount} updated, ${result.failureCount} failed, ${result.skippedCount} skipped`,
      );
      return result;
    } catch (error) {
      this.logger.error('Import failed:', error);
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  /**
   * Generate CSV template for product import
   */
  async generateImportTemplate(): Promise<StreamableFile> {
    const csvHeaders = [
      'name*',
      'description',
      'barcode',
      'type*',
      'categoryName*',
      'baseCost*',
      'retailPrice',
      'wholesalePrice',
      'specialPrice',
      'stockQuantity',
      'notes',
      'isActive',
    ];

    const sampleData1 = [
      'Sample Product',
      'Sample product description',
      '123456789',
      'Stocked Product',
      'test1',
      '10.00',
      '15.00',
      '12.00',
      '13.50',
      '100',
      'Internal notes',
      'true',
    ];

    const sampleData2 = [
      'Business Laptop',
      'High-performance laptop for business use',
      'LAPTOP001',
      'Stocked Product',
      'test2',
      '800.00',
      '1200.00',
      '1000.00',
      '1100.00',
      '25',
      'Premium business laptop',
      'true',
    ];

    const sampleData3 = [
      'IT Consulting Service',
      'Professional IT consulting and support services',
      'CONSULT001',
      'Service',
      'test3',
      '80.00',
      '120.00',
      '100.00',
      '110.00',
      '0',
      'Hourly rate for IT support',
      'true',
    ];

    const csvContent = [
      csvHeaders.join(','),
      sampleData1.map((field) => `"${field}"`).join(','),
      sampleData2.map((field) => `"${field}"`).join(','),
      sampleData3.map((field) => `"${field}"`).join(','),
    ].join('\n');

    const buffer = Buffer.from(csvContent, 'utf-8');
    return new StreamableFile(buffer);
  }

  /**
   * Parse import file based on format
   */
  private async parseImportFile(file: Express.Multer.File, format: string): Promise<any[]> {
    const fileContent = file.buffer.toString('utf-8');

    if (format === 'csv') {
      return this.parseCsvContent(fileContent);
    } else if (format === 'excel') {
      // For now, treat Excel files as CSV (would need xlsx library for proper Excel support)
      return this.parseCsvContent(fileContent);
    } else {
      throw new BadRequestException(`Unsupported file format: ${format}`);
    }
  }

  /**
   * Parse CSV content
   */
  private parseCsvContent(content: string): any[] {
    if (typeof content !== 'string') {
      throw new BadRequestException('CSV content must be a string');
    }

    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      throw new BadRequestException('File must contain at least a header row and one data row');
    }

    const dataRowCount = lines.length - 1;
    if (dataRowCount > this.MAX_IMPORT_DATA_ROWS) {
      throw new BadRequestException(
        `Import file exceeds maximum allowed data rows (${this.MAX_IMPORT_DATA_ROWS})`,
      );
    }

    // Parse header
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/\*/g, ''));

    // Validate required headers
    const requiredHeaders = ['name', 'type', 'categoryname', 'basecost'];
    const missingHeaders = requiredHeaders.filter((req) => !headers.includes(req));

    if (missingHeaders.length > 0) {
      throw new BadRequestException(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = this.parseCsvLine(line);
      const rowData: any = {};

      headers.forEach((header, index) => {
        rowData[header] = values[index] || '';
      });

      rows.push(rowData);
    }

    return rows;
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    if (typeof line !== 'string') {
      throw new BadRequestException('CSV line must be a string');
    }

    if (line.length > this.MAX_CSV_LINE_LENGTH) {
      throw new BadRequestException(
        `CSV line exceeds maximum allowed length (${this.MAX_CSV_LINE_LENGTH} characters)`,
      );
    }

    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i + 1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue.trim());
    return values;
  }

  /**
   * Validate and process a single import row
   */
  private async validateAndProcessRow(
    row: any,
    rowNumber: number,
    categoryMap: Map<string, string>,
    result: ProductImportResultDto,
  ): Promise<CreateProductDto | null> {
    // Check required fields
    const requiredFields = {
      name: row.name,
      type: row.type,
      categoryname: row.categoryname,
      basecost: row.basecost,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value.toString().trim() === '') {
        result.errors.push({
          row: rowNumber,
          field,
          message: `${field} is required`,
          value,
        });
        return null;
      }
    }

    // Map category name to ID
    const categoryName = row.categoryname.toLowerCase();
    const categoryId = categoryMap.get(categoryName);

    if (!categoryId) {
      result.errors.push({
        row: rowNumber,
        field: 'categoryName',
        message: `Category '${row.categoryname}' not found`,
        value: row.categoryname,
      });
      return null;
    }

    // Validate product type and map to enum values
    const normalizeProductType = (type: string): ProductType | null => {
      const lowerType = type.toLowerCase().trim();
      if (lowerType === 'goods' || lowerType === 'stocked product') {
        return ProductType.GOODS;
      }
      if (lowerType === 'service') {
        return ProductType.SERVICE;
      }
      return null;
    };

    const normalizedType = normalizeProductType(row.type);
    if (!normalizedType) {
      result.errors.push({
        row: rowNumber,
        field: 'type',
        message: `Invalid product type. Must be 'Stocked Product' or 'Service'`,
        value: row.type,
      });
      return null;
    }

    // Parse numeric values
    const parseNumber = (value: string, field: string): number | undefined => {
      if (!value || value.trim() === '') return undefined;
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0) {
        result.errors.push({
          row: rowNumber,
          field,
          message: `Invalid number format or negative value`,
          value,
        });
        return undefined;
      }
      return parsed;
    };

    const baseCost = parseNumber(row.basecost, 'baseCost');
    if (baseCost === undefined) return null;

    // Build product data (pricing is now managed via Price Lists, not product fields)
    const productData: any = {
      name: row.name.trim(),
      description: row.description?.trim() || undefined,
      barcode: row.barcode?.trim() || undefined,
      type: normalizedType,
      categoryId,
      baseCost,
      stockQuantity: parseNumber(row.stockquantity, 'stockQuantity') || 0,
      notes: row.notes?.trim() || undefined,
      isActive: row.isactive === 'true' || row.isactive === true || row.isactive === '1' || true,
    };

    return productData;
  }

  /**
   * Find duplicate product by name or barcode
   */
  private async findDuplicateProduct(name: string, barcode?: string): Promise<Product | null> {
    const whereConditions: any[] = [{ name }];

    if (barcode && barcode.trim()) {
      whereConditions.push({ barcode: barcode.trim() });
    }

    return await this.productRepository.findOne({
      where: whereConditions,
      withDeleted: true, // Include soft-deleted products in duplicate check
    });
  }

  /**
   * Get order history for a product (both sales and purchase orders)
   */
  async getOrderHistory(productId: string, page: number = 1, limit: number = 20): Promise<any> {
    this.logger.log(`Getting order history for product ${productId}`);

    // Verify product exists
    const product = await this.findOne(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Fetch ALL sales order items (no pagination yet - will paginate after combining)
    const salesOrderItems = await this.salesOrderItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer')
      .where('item.productId = :productId', { productId })
      .getMany();

    // Fetch ALL purchase order items with payment information (no pagination yet)
    const purchaseOrderItems = await this.purchaseOrderItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.supplier', 'supplier')
      .leftJoinAndSelect('purchaseOrder.vendorPayments', 'vendorPayments')
      .leftJoinAndSelect('purchaseOrder.items', 'poItems')
      .where('item.productId = :productId', { productId })
      .getMany();

    // Transform sales order items (filter out items without order data)
    const salesOrders = salesOrderItems
      .filter((item) => item.salesOrder) // Only process items with loaded order
      .map((item) => {
        return {
          id: item.id,
          type: 'sales_order',
          orderNumber: item.salesOrder.orderNumber,
          customerOrVendor: item.salesOrder.customer?.name || 'Unknown',
          date: item.salesOrder.orderDate,
          updatedAt: item.salesOrder.updatedAt, // Add updatedAt for sorting
          paymentStatus: item.salesOrder.paymentStatus?.toLowerCase() || 'pending',
          fulfillmentStatus: item.salesOrder.status === 'FULFILLED' ? 'fulfilled' : 'pending',
          quantity: Number(item.quantity),
          subTotal: Number(item.totalAmount),
        };
      });

    // Transform purchase order items (filter out items without order data)
    const purchaseOrders = purchaseOrderItems
      .filter((item) => item.purchaseOrder) // Only process items with loaded order
      .map((item) => {
        // Calculate payment status from vendor payments
        const vendorPayments = item.purchaseOrder.vendorPayments || [];
        const totalPaid = vendorPayments
          .filter((payment) => payment.status === 'completed')
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const totalAmount = Number(item.purchaseOrder.totalAmount || 0);

        let paymentStatus = 'pending';
        if (totalPaid >= totalAmount && totalAmount > 0) {
          paymentStatus = 'paid';
        } else if (totalPaid > 0) {
          paymentStatus = 'partial';
        }

        // Check if fully received using the entity method
        const isFullyReceived = item.purchaseOrder.isFullyReceived
          ? item.purchaseOrder.isFullyReceived()
          : false;

        return {
          id: item.id,
          type: 'purchase_order',
          orderNumber: item.purchaseOrder.orderNumber,
          customerOrVendor: item.purchaseOrder.supplier?.companyName || 'Unknown',
          date: item.purchaseOrder.orderDate,
          updatedAt: item.purchaseOrder.updatedAt, // Add updatedAt for sorting
          paymentStatus,
          receivedStatus: isFullyReceived ? 'received' : 'pending',
          quantity: Number(item.quantity),
          subTotal: Number(item.totalAmount),
        };
      });

    // Combine and sort by updatedAt (most recently updated first)
    const combinedOrders = [...salesOrders, ...purchaseOrders].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    // Get total count
    const total = combinedOrders.length;

    // Apply pagination AFTER combining and sorting
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = combinedOrders.slice(startIndex, endIndex);

    return {
      data: paginatedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
