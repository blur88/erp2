import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindManyOptions,
  SelectQueryBuilder,
  UpdateResult,
  In,
} from 'typeorm';
import { Product, ProductStatus, StockStatus } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
  ProductResponseDto,
  ProductListResponseDto,
  BulkUpdatePricesDto,
  ProductStockSummaryDto,
} from '../dto/product.dto';
import { CategoryService } from './category.service';
import { StockMovementService } from './stock-movement.service';
import { AuditService } from './audit.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Inject(forwardRef(() => CategoryService))
    private readonly categoryService: CategoryService,
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new product
   */
  async create(createProductDto: CreateProductDto, userId?: string): Promise<ProductResponseDto> {
    this.logger.log(`Creating product with SKU: ${createProductDto.sku}`);

    // Check if SKU already exists (including soft-deleted products)
    const existingProduct = await this.productRepository.findOne({
      where: { sku: createProductDto.sku },
      withDeleted: true, // Include soft-deleted products in the check
    });

    if (existingProduct) {
      if (existingProduct.deletedAt) {
        throw new ConflictException(
          `Product with SKU '${createProductDto.sku}' was previously deleted but cannot be reused. ` +
          `Please choose a different SKU.`
        );
      } else {
        throw new ConflictException(`Product with SKU '${createProductDto.sku}' already exists`);
      }
    }

    // Validate category exists
    const category = await this.categoryRepository.findOne({
      where: { id: createProductDto.categoryId, isActive: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${createProductDto.categoryId}' not found or inactive`);
    }

    // Validate pricing logic
    this.validatePricing(createProductDto);

    // Create product
    const product = this.productRepository.create({
      ...createProductDto,
      stockQuantity: createProductDto.initialStockQuantity || 0,
      status: createProductDto.status || ProductStatus.ACTIVE,
      isActive: createProductDto.isActive ?? true,
      reorderLevel: createProductDto.reorderLevel || 0,
      optimalStockLevel: createProductDto.optimalStockLevel || 0,
    });

    // Set initial stock status
    product.updateStockStatus();

    const savedProduct = await this.productRepository.save(product);

    // Set the category relationship for the response DTO
    savedProduct.category = category;

    // Create initial stock movement if initial stock provided (temporarily disabled for system users)
    if (createProductDto.initialStockQuantity && createProductDto.initialStockQuantity > 0 && userId) {
      try {
        await this.stockMovementService.recordInitialStock(
          savedProduct.id,
          createProductDto.initialStockQuantity,
          createProductDto.baseCost,
          userId,
        );
      } catch (error) {
        this.logger.warn(`Failed to create initial stock movement: ${error.message}`);
      }
    }

    // Log audit event (temporarily disabled for system users)
    if (userId) {
      try {
        await this.auditService.logProductEvent(
          savedProduct.id,
          'PRODUCT_CREATED',
          `Product ${savedProduct.name} (${savedProduct.sku}) created`,
          userId,
          {
            initialStock: createProductDto.initialStockQuantity || 0,
            category: category.name,
          },
        );
      } catch (error) {
        this.logger.warn(`Failed to log audit event: ${error.message}`);
      }
    }

    this.logger.log(`Product created successfully with ID: ${savedProduct.id}`);
    return this.toResponseDto(savedProduct);
  }

  /**
   * Find all products with filtering, sorting, and pagination
   */
  async findAll(query: QueryProductsDto): Promise<ProductListResponseDto> {
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      type,
      status,
      isActive,
      lowStock,
      outOfStock,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      brand,
      minStock,
      maxStock,
      minPrice,
      maxPrice,
    } = query;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('1=1');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.barcode ILIKE :search OR product.brand ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('product.status = :status', { status });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('product.isActive = :isActive', { isActive });
    }

    if (brand) {
      queryBuilder.andWhere('product.brand ILIKE :brand', { brand: `%${brand}%` });
    }

    if (lowStock) {
      queryBuilder.andWhere('product.stockQuantity <= product.reorderLevel');
    }

    if (outOfStock) {
      queryBuilder.andWhere('(product.stockQuantity - product.reservedQuantity) <= 0');
    }

    if (minStock !== undefined) {
      queryBuilder.andWhere('product.stockQuantity >= :minStock', { minStock });
    }

    if (maxStock !== undefined) {
      queryBuilder.andWhere('product.stockQuantity <= :maxStock', { maxStock });
    }

    if (minPrice !== undefined) {
      queryBuilder.andWhere('product.retailPrice >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      queryBuilder.andWhere('product.retailPrice <= :maxPrice', { maxPrice });
    }

    // Apply sorting
    const validSortFields = ['name', 'sku', 'createdAt', 'stockQuantity', 'retailPrice'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`product.${sortField}`, sortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    const data = products.map(product => this.toResponseDto(product));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find one product by ID
   */
  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    return this.toResponseDto(product);
  }

  /**
   * Find one product by SKU
   */
  async findBySku(sku: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { sku },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with SKU '${sku}' not found`);
    }

    return this.toResponseDto(product);
  }

  /**
   * Find all soft-deleted products
   */
  async findDeleted(query: QueryProductsDto): Promise<ProductListResponseDto> {
    this.logger.log('Fetching deleted products with filters:', query);

    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      type,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.deletedAt IS NOT NULL')
      .withDeleted();

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.description ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    // Sorting
    const allowedSortFields = ['name', 'sku', 'deletedAt', 'createdAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'deletedAt';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    queryBuilder.orderBy(`product.${safeSortBy}`, safeSortOrder);

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    const productDtos = products.map(product => this.toResponseDto(product));

    return {
      data: productDtos,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Restore a soft-deleted product
   */
  async restore(id: string, _userId?: string): Promise<ProductResponseDto> {
    this.logger.log(`Restoring product with ID: ${id}`);

    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
      withDeleted: true,
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    if (!product.deletedAt) {
      throw new BadRequestException(`Product with ID '${id}' is not deleted`);
    }

    // Check if SKU is still unique (another product might have been created with the same SKU)
    const existingProduct = await this.productRepository.findOne({
      where: { sku: product.sku },
    });

    if (existingProduct) {
      throw new ConflictException(
        `Cannot restore product: SKU '${product.sku}' is now used by another active product`
      );
    }

    // Restore the product
    await this.productRepository.restore(id);

    // Fetch the restored product
    const restoredProduct = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    return this.toResponseDto(restoredProduct!);
  }

  /**
   * Update a product
   */
  async update(id: string, updateProductDto: UpdateProductDto, userId?: string): Promise<ProductResponseDto> {
    this.logger.log(`Updating product with ID: ${id}`);

    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    // Check for SKU conflicts if SKU is being changed
    if (updateProductDto.sku && updateProductDto.sku !== product.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: updateProductDto.sku },
      });

      if (existingProduct) {
        throw new ConflictException(`Product with SKU '${updateProductDto.sku}' already exists`);
      }
    }

    // Validate category if being changed
    if (updateProductDto.categoryId && updateProductDto.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateProductDto.categoryId, isActive: true },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID '${updateProductDto.categoryId}' not found or inactive`);
      }
    }

    // Validate pricing if being updated
    if (this.hasPricingChanges(updateProductDto)) {
      this.validatePricing({ ...product, ...updateProductDto } as any);
    }

    // Track changes for audit
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateProductDto).forEach(key => {
      if (updateProductDto[key] !== product[key]) {
        changes[key] = { from: product[key], to: updateProductDto[key] };
      }
    });

    // Update product
    Object.assign(product, updateProductDto);

    // Update stock status if quantities changed
    if (updateProductDto.hasOwnProperty('reorderLevel') || updateProductDto.hasOwnProperty('stockQuantity')) {
      product.updateStockStatus();
    }

    const updatedProduct = await this.productRepository.save(product);

    // Log audit event
    if (Object.keys(changes).length > 0) {
      await this.auditService.logProductEvent(
        updatedProduct.id,
        'PRODUCT_UPDATED',
        `Product ${updatedProduct.name} (${updatedProduct.sku}) updated`,
        userId,
        { changes },
      );
    }

    this.logger.log(`Product updated successfully: ${updatedProduct.id}`);
    return this.toResponseDto(updatedProduct);
  }

  /**
   * Delete a product (soft delete by setting status to DISCONTINUED)
   */
  async remove(id: string, userId?: string): Promise<void> {
    this.logger.log(`Deleting product with ID: ${id}`);

    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['salesOrderItems', 'purchaseOrderItems', 'stockMovements'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    // Check if product has any dependencies
    if (product.salesOrderItems?.length > 0 || product.purchaseOrderItems?.length > 0) {
      throw new BadRequestException(
        'Cannot delete product that has associated sales orders or purchase orders. Set status to DISCONTINUED instead.',
      );
    }

    // Soft delete by setting status to DISCONTINUED and isActive to false
    product.status = ProductStatus.DISCONTINUED;
    product.isActive = false;
    
    await this.productRepository.save(product);

    // Log audit event
    await this.auditService.logProductEvent(
      product.id,
      'PRODUCT_DELETED',
      `Product ${product.name} (${product.sku}) marked as discontinued`,
      userId,
    );

    this.logger.log(`Product soft-deleted successfully: ${id}`);
  }

  /**
   * Bulk update product prices
   */
  async bulkUpdatePrices(bulkUpdateDto: BulkUpdatePricesDto, userId?: string): Promise<void> {
    this.logger.log(`Bulk updating prices for ${bulkUpdateDto.products.length} products`);

    const productIds = bulkUpdateDto.products.map(p => p.productId);
    const products = await this.productRepository.findBy({ id: In(productIds) });

    if (products.length !== productIds.length) {
      const foundIds = products.map(p => p.id);
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Products not found: ${missingIds.join(', ')}`);
    }

    const updates: Promise<UpdateResult>[] = [];
    const auditPromises: Promise<void>[] = [];

    for (const priceUpdate of bulkUpdateDto.products) {
      const product = products.find(p => p.id === priceUpdate.productId)!;
      const updateData: Partial<Product> = {};

      // Track price changes
      const priceChanges: Record<string, { from: number; to: number }> = {};

      if (priceUpdate.retailPrice !== undefined && priceUpdate.retailPrice !== product.retailPrice) {
        updateData.retailPrice = priceUpdate.retailPrice;
        priceChanges.retailPrice = { from: Number(product.retailPrice), to: priceUpdate.retailPrice };
      }

      if (priceUpdate.wholesalePrice !== undefined && priceUpdate.wholesalePrice !== product.wholesalePrice) {
        updateData.wholesalePrice = priceUpdate.wholesalePrice;
        priceChanges.wholesalePrice = { from: Number(product.wholesalePrice), to: priceUpdate.wholesalePrice };
      }

      if (priceUpdate.specialPrice !== undefined && priceUpdate.specialPrice !== product.specialPrice) {
        updateData.specialPrice = priceUpdate.specialPrice;
        priceChanges.specialPrice = { from: Number(product.specialPrice), to: priceUpdate.specialPrice };
      }

      if (priceUpdate.baseCost !== undefined && priceUpdate.baseCost !== product.baseCost) {
        updateData.baseCost = priceUpdate.baseCost;
        priceChanges.baseCost = { from: Number(product.baseCost), to: priceUpdate.baseCost };
      }

      if (Object.keys(updateData).length > 0) {
        // Validate new pricing
        this.validatePricing({ ...product, ...updateData } as any);

        updates.push(
          this.productRepository.update(priceUpdate.productId, updateData)
        );

        // Log audit event
        auditPromises.push(
          this.auditService.logProductEvent(
            priceUpdate.productId,
            'PRODUCT_PRICE_UPDATED',
            `Bulk price update for ${product.name} (${product.sku})`,
            userId,
            { priceChanges },
          ),
        );
      }
    }

    await Promise.all([...updates, ...auditPromises]);

    this.logger.log(`Bulk price update completed for ${updates.length} products`);
  }

  /**
   * Get stock summary for products
   */
  async getStockSummary(filters?: Partial<QueryProductsDto>): Promise<ProductStockSummaryDto[]> {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('product.stockMovements', 'movements')
      .select([
        'product.id',
        'product.sku',
        'product.name',
        'product.stockQuantity',
        'product.reservedQuantity',
        'product.reorderLevel',
        'product.stockStatus',
        'product.unit',
        'category.name',
        'MAX(movements.movementDate) as lastMovementDate',
      ])
      .groupBy('product.id, category.id');

    // Apply filters if provided
    if (filters?.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId: filters.categoryId });
    }

    if (filters?.lowStock) {
      queryBuilder.andWhere('product.stockQuantity <= product.reorderLevel');
    }

    if (filters?.outOfStock) {
      queryBuilder.andWhere('(product.stockQuantity - product.reservedQuantity) <= 0');
    }

    if (filters?.isActive !== undefined) {
      queryBuilder.andWhere('product.isActive = :isActive', { isActive: filters.isActive });
    }

    queryBuilder.orderBy('product.name', 'ASC');

    const results = await queryBuilder.getRawMany();

    return results.map(result => ({
      id: result.product_id,
      sku: result.product_sku,
      name: result.product_name,
      stockQuantity: Number(result.product_stockQuantity),
      availableQuantity: Number(result.product_stockQuantity) - Number(result.product_reservedQuantity),
      reservedQuantity: Number(result.product_reservedQuantity),
      reorderLevel: Number(result.product_reorderLevel),
      stockStatus: result.product_stockStatus,
      isLowStock: Number(result.product_stockQuantity) <= Number(result.product_reorderLevel),
      isOutOfStock: (Number(result.product_stockQuantity) - Number(result.product_reservedQuantity)) <= 0,
      unit: result.product_unit,
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
  async reserveStock(productId: string, quantity: number, reason: string, userId?: string): Promise<boolean> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    
    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const success = product.reserveStock(quantity);
    
    if (success) {
      await this.productRepository.save(product);
      
      await this.auditService.logProductEvent(
        productId,
        'STOCK_RESERVED',
        `Reserved ${quantity} units: ${reason}`,
        userId,
        { quantity, availableAfter: product.availableQuantity },
      );
    }

    return success;
  }

  /**
   * Release reserved stock for a product
   */
  async releaseReservedStock(productId: string, quantity: number, reason: string, userId?: string): Promise<void> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    
    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    product.releaseReservedStock(quantity);
    await this.productRepository.save(product);

    await this.auditService.logProductEvent(
      productId,
      'STOCK_RELEASED',
      `Released ${quantity} reserved units: ${reason}`,
      userId,
      { quantity, availableAfter: product.availableQuantity },
    );
  }

  /**
   * Update stock quantity for a product (internal use by stock movement service)
   */
  async updateStockQuantity(productId: string, newQuantity: number, _userId?: string): Promise<void> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    
    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const previousQuantity = product.stockQuantity;
    product.stockQuantity = newQuantity;
    product.updateStockStatus();
    
    await this.productRepository.save(product);

    this.logger.log(
      `Stock quantity updated for product ${productId}: ${previousQuantity} -> ${newQuantity}`
    );
  }

  /**
   * Convert product entity to response DTO
   */
  private toResponseDto(product: Product): ProductResponseDto {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      barcode: product.barcode,
      type: product.type,
      status: product.status,
      isActive: product.isActive,
      unit: product.unit,
      baseCost: Number(product.baseCost),
      retailPrice: Number(product.retailPrice),
      wholesalePrice: Number(product.wholesalePrice),
      specialPrice: Number(product.specialPrice),
      stockQuantity: Number(product.stockQuantity),
      reservedQuantity: Number(product.reservedQuantity),
      availableQuantity: product.availableQuantity,
      reorderLevel: Number(product.reorderLevel),
      optimalStockLevel: Number(product.optimalStockLevel),
      stockStatus: product.stockStatus,
      weight: product.weight ? Number(product.weight) : undefined,
      dimensions: product.dimensions,
      brand: product.brand,
      model: product.model,
      imageUrl: product.imageUrl,
      additionalImages: product.additionalImages,
      attributes: product.attributes,
      notes: product.notes,
      categoryId: product.categoryId,
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
        fullPath: product.category.fullPath,
      } : null,
      isLowStock: product.isLowStock,
      isOutOfStock: product.isOutOfStock,
      grossMarginRetail: product.grossMarginRetail,
      grossMarginWholesale: product.grossMarginWholesale,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /**
   * Validate product pricing logic
   */
  private validatePricing(productData: any): void {
    const { baseCost, retailPrice, wholesalePrice, specialPrice } = productData;

    if (retailPrice < baseCost) {
      throw new BadRequestException('Retail price cannot be lower than base cost');
    }

    if (wholesalePrice < baseCost) {
      throw new BadRequestException('Wholesale price cannot be lower than base cost');
    }

    if (specialPrice < baseCost) {
      throw new BadRequestException('Special price cannot be lower than base cost');
    }

    if (wholesalePrice > retailPrice) {
      throw new BadRequestException('Wholesale price cannot be higher than retail price');
    }
  }

  /**
   * Check if the update contains pricing changes
   */
  private hasPricingChanges(updateDto: UpdateProductDto): boolean {
    return ['baseCost', 'retailPrice', 'wholesalePrice', 'specialPrice'].some(
      field => updateDto.hasOwnProperty(field)
    );
  }
}