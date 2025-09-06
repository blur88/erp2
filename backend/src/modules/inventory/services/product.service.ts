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
import { Product, ProductStatus, ProductType, StockStatus } from '../../../database/entities/product.entity';
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
    this.logger.log(`Creating product with barcode: ${createProductDto.barcode}`);

    // Check if product name already exists (case-insensitive, including soft-deleted products)
    const existingProductByName = await this.productRepository
      .createQueryBuilder('product')
      .where('LOWER(product.name) = LOWER(:name)', { name: createProductDto.name.trim() })
      .withDeleted()
      .getOne();

    if (existingProductByName) {
      if (existingProductByName.deletedAt) {
        throw new ConflictException(
          `Product with name '${createProductDto.name}' was previously deleted but cannot be reused. ` +
          `Please choose a different name or restore the deleted product.`
        );
      } else {
        throw new ConflictException(`Product with name '${createProductDto.name}' already exists`);
      }
    }

    // Check if barcode already exists (case-insensitive, including soft-deleted products)
    if (createProductDto.barcode) {
      const existingProduct = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', { barcode: createProductDto.barcode.trim() })
        .withDeleted()
        .getOne();

      if (existingProduct) {
        if (existingProduct.deletedAt) {
          throw new ConflictException(
            `Product with barcode '${createProductDto.barcode}' was previously deleted but cannot be reused. ` +
            `Please choose a different barcode.`
          );
        } else {
          throw new ConflictException(`Product with barcode '${createProductDto.barcode}' already exists`);
        }
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
      stockQuantity: createProductDto.currentStock || 0,
      status: createProductDto.status || ProductStatus.ACTIVE,
      isActive: createProductDto.isActive ?? true,
      type: createProductDto.type || ProductType.GOODS,
      // Set default values for removed fields
      unit: 'pcs',
      reorderLevel: 0,
      optimalStockLevel: 0,
    });

    // Set initial stock status
    product.updateStockStatus();

    const savedProduct = await this.productRepository.save(product);

    // Set the category relationship for the response DTO
    savedProduct.category = category;

    // Create initial stock movement if current stock provided (temporarily disabled for system users)
    if (createProductDto.currentStock && createProductDto.currentStock > 0 && userId) {
      try {
        await this.stockMovementService.recordInitialStock(
          savedProduct.id,
          createProductDto.currentStock,
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
          `Product ${savedProduct.name} (${savedProduct.barcode}) created`,
          userId,
          {
            initialStock: createProductDto.currentStock || 0,
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
      .where('product.deletedAt IS NULL');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.barcode ILIKE :search OR product.brand ILIKE :search)',
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
    const validSortFields = ['name', 'barcode', 'createdAt', 'stockQuantity', 'retailPrice'];
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
   * Find one product by SKU (alias for barcode)
   */
  async findBySku(sku: string): Promise<ProductResponseDto> {
    return this.findByBarcode(sku);
  }

  /**
   * Find one product by barcode
   */
  async findByBarcode(barcode: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { barcode },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with barcode '${barcode}' not found`);
    }

    return this.toResponseDto(product);
  }

  /**
   * Check for duplicate product names and barcodes (including soft-deleted)
   */
  async checkDuplicate(params: {
    name?: string;
    barcode?: string;
    excludeId?: string;
  }): Promise<{
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
        .where('LOWER(product.name) = LOWER(:name)', { name: params.name.trim() })
        .withDeleted();

      if (params.excludeId) {
        nameQuery.andWhere('product.id != :excludeId', { excludeId: params.excludeId });
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
        .where('LOWER(product.barcode) = LOWER(:barcode)', { barcode: params.barcode.trim() })
        .withDeleted();

      if (params.excludeId) {
        barcodeQuery.andWhere('product.id != :excludeId', { excludeId: params.excludeId });
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
        '(product.name ILIKE :search OR product.barcode ILIKE :search OR product.description ILIKE :search)',
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
    const allowedSortFields = ['name', 'barcode', 'deletedAt', 'createdAt'];
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

    // Check if barcode is still unique (case-insensitive, another product might have been created with the same barcode)
    const existingProduct = await this.productRepository
      .createQueryBuilder('product')
      .where('LOWER(product.barcode) = LOWER(:barcode)', { barcode: product.barcode })
      .andWhere('product.id != :id', { id: product.id })
      .getOne();

    if (existingProduct) {
      throw new ConflictException(
        `Cannot restore product: barcode '${product.barcode}' is now used by another active product`
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
   * Permanently delete a product from database
   */
  async permanentDelete(id: string, userId?: string): Promise<void> {
    this.logger.log(`Permanently deleting product with ID: ${id}`);

    // Find the product (including soft-deleted ones)
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['salesOrderItems', 'purchaseOrderItems', 'stockMovements'],
      withDeleted: true,
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    // Ensure product is already soft-deleted
    if (!product.deletedAt) {
      throw new BadRequestException(
        'Product must be soft-deleted first before permanent deletion. Use regular delete endpoint first.'
      );
    }

    // Check if product has any active dependencies that prevent permanent deletion
    if (product.salesOrderItems?.length > 0 || product.purchaseOrderItems?.length > 0) {
      throw new BadRequestException(
        'Cannot permanently delete product that has associated sales orders or purchase orders'
      );
    }

    // If there are stock movements, we should allow deletion but log it
    if (product.stockMovements?.length > 0) {
      this.logger.warn(
        `Permanently deleting product with ${product.stockMovements.length} stock movement records: ${product.barcode}`
      );
    }

    // Hard delete the product from database
    await this.productRepository.delete(id);

    // Log audit event
    await this.auditService.logProductEvent(
      product.id,
      'PRODUCT_PERMANENTLY_DELETED',
      `Product ${product.name} (${product.barcode}) permanently deleted from database`,
      userId,
    );

    this.logger.log(`Product permanently deleted: ${id}`);
  }

  /**
   * Bulk permanently delete products from database
   */
  async bulkPermanentDelete(
    productIds: string[], 
    userId?: string
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${productIds.length} products`);
    
    if (!productIds || productIds.length === 0) {
      return { deletedCount: 0, failedIds: [] };
    }

    const failedIds: string[] = [];
    let deletedCount = 0;

    // Process each product individually to handle failures gracefully
    for (const id of productIds) {
      try {
        // Find the product (including soft-deleted ones)
        const product = await this.productRepository.findOne({
          where: { id },
          relations: ['salesOrderItems', 'purchaseOrderItems', 'stockMovements'],
          withDeleted: true,
        });

        if (!product) {
          this.logger.warn(`Product with ID '${id}' not found`);
          failedIds.push(id);
          continue;
        }

        // Ensure product is already soft-deleted
        if (!product.deletedAt) {
          this.logger.warn(`Product with ID '${id}' is not soft-deleted`);
          failedIds.push(id);
          continue;
        }

        // Check if product has any active dependencies that prevent permanent deletion
        if (product.salesOrderItems?.length > 0 || product.purchaseOrderItems?.length > 0) {
          this.logger.warn(
            `Product with ID '${id}' has associated orders and cannot be permanently deleted`
          );
          failedIds.push(id);
          continue;
        }

        // If there are stock movements, we allow deletion but log it
        if (product.stockMovements?.length > 0) {
          this.logger.warn(
            `Permanently deleting product with ${product.stockMovements.length} stock movement records: ${product.barcode}`
          );
        }

        // Hard delete the product from database
        await this.productRepository.delete(id);

        // Log audit event
        await this.auditService.logProductEvent(
          product.id,
          'PRODUCT_PERMANENTLY_DELETED',
          `Product ${product.name} (${product.barcode}) permanently deleted from database (bulk operation)`,
          userId,
        );

        deletedCount++;
        this.logger.log(`Product permanently deleted: ${id}`);
      } catch (error) {
        this.logger.error(`Failed to permanently delete product ${id}: ${error.message}`);
        failedIds.push(id);
      }
    }

    this.logger.log(
      `Bulk permanent delete completed: ${deletedCount} succeeded, ${failedIds.length} failed`
    );

    return { deletedCount, failedIds };
  }

  /**
   * Update a product
   */
  async update(id: string, updateProductDto: UpdateProductDto, userId?: string): Promise<ProductResponseDto> {
    this.logger.log(`Updating product with ID: ${id}`);
    console.log('🚀 UPDATE METHOD CALLED - CODE VERSION 2.0');

    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    // Check for name conflicts if name is being changed (case-insensitive)
    if (updateProductDto.name && updateProductDto.name.toLowerCase() !== product.name.toLowerCase()) {
      const existingProductByName = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.name) = LOWER(:name)', { name: updateProductDto.name.trim() })
        .andWhere('product.id != :id', { id: product.id })
        .withDeleted()
        .getOne();

      if (existingProductByName) {
        if (existingProductByName.deletedAt) {
          throw new ConflictException(
            `Product with name '${updateProductDto.name}' was previously deleted but cannot be reused. ` +
            `Please choose a different name or restore the deleted product.`
          );
        } else {
          throw new ConflictException(`Product with name '${updateProductDto.name}' already exists`);
        }
      }
    }

    // Check for barcode conflicts if barcode is being changed (case-insensitive)
    if (updateProductDto.barcode && updateProductDto.barcode.toLowerCase() !== product.barcode?.toLowerCase()) {
      const existingProduct = await this.productRepository
        .createQueryBuilder('product')
        .where('LOWER(product.barcode) = LOWER(:barcode)', { barcode: updateProductDto.barcode.trim() })
        .andWhere('product.id != :id', { id: product.id })
        .withDeleted()
        .getOne();

      if (existingProduct) {
        if (existingProduct.deletedAt) {
          throw new ConflictException(
            `Product with barcode '${updateProductDto.barcode}' was previously deleted but cannot be reused. ` +
            `Please choose a different barcode or restore the deleted product.`
          );
        } else {
          throw new ConflictException(`Product with barcode '${updateProductDto.barcode}' already exists`);
        }
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

    // Transform DTO fields to match entity fields FIRST
    const updateData: any = { ...updateProductDto };
    
    // Map currentStock to stockQuantity if present
    if (updateProductDto.hasOwnProperty('currentStock')) {
      updateData.stockQuantity = updateProductDto.currentStock;
      delete updateData.currentStock;
    }

    // Validate pricing if being updated (use transformed data)
    if (this.hasPricingChanges(updateData)) {
      this.validatePricing({ ...product, ...updateData } as any);
    }

    // Debug logging
    console.log('=== PRODUCT UPDATE DEBUG ===');
    console.log('Current product.categoryId:', product.categoryId);
    console.log('Original DTO:', updateProductDto);
    console.log('Transformed updateData:', updateData);
    console.log('Update DTO categoryId:', updateData.categoryId);

    // Track changes for audit (use transformed data)
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== product[key]) {
        changes[key] = { from: product[key], to: updateData[key] };
      }
    });

    console.log('Detected changes:', changes);

    // Update product with transformed data
    Object.assign(product, updateData);
    
    console.log('After Object.assign - product.categoryId:', product.categoryId);
    console.log('=============================');

    // Update stock status if quantities changed
    if (updateProductDto.hasOwnProperty('currentStock') || updateData.hasOwnProperty('stockQuantity')) {
      product.updateStockStatus();
    }

    // Use direct update for better control over what gets updated
    const updateResult = await this.productRepository.update(
      { id: product.id },
      updateData
    );
    console.log('UPDATE RESULT:', updateResult);

    const updatedProduct = await this.productRepository.findOne({
      where: { id: product.id },
    });
    console.log('POST-UPDATE updatedProduct.categoryId:', updatedProduct?.categoryId);

    // Reload the product with category relation to ensure fresh data
    const productWithCategory = await this.productRepository.findOne({
      where: { id: product.id },
      relations: ['category'],
    });
    console.log('RELOADED productWithCategory.categoryId:', productWithCategory?.categoryId);
    console.log('RELOADED productWithCategory.category:', productWithCategory?.category?.name);

    // Log audit event
    if (Object.keys(changes).length > 0) {
      await this.auditService.logProductEvent(
        updatedProduct.id,
        'PRODUCT_UPDATED',
        `Product ${updatedProduct.name} (${updatedProduct.barcode}) updated`,
        userId,
        { changes },
      );
    }

    this.logger.log(`Product updated successfully: ${updatedProduct.id}`);
    return this.toResponseDto(productWithCategory!);
  }

  /**
   * Delete a product (soft delete using TypeORM)
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

    // Use TypeORM soft delete (sets deletedAt timestamp)
    await this.productRepository.softDelete(id);

    // Log audit event
    await this.auditService.logProductEvent(
      product.id,
      'PRODUCT_DELETED',
      `Product ${product.name} (${product.barcode}) soft deleted`,
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
            `Bulk price update for ${product.name} (${product.barcode})`,
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
        'product.barcode',
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
      barcode: result.product_barcode,
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
   * Get dashboard statistics for inventory overview
   */
  async getDashboardStats(): Promise<{
    totalProducts: number;
    totalCategories: number;
    inventoryValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    recentMovements: number;
    categoryBreakdown: Array<{ category: string; count: number; value: number }>;
    stockHealthMetrics: {
      inStockPercentage: number;
      lowStockPercentage: number;
      outOfStockPercentage: number;
      averageValue: number;
    };
  }> {
    this.logger.log('Fetching dashboard statistics');

    // Get total products count
    const totalProducts = await this.productRepository.count({
      where: { deletedAt: null }
    });

    // Get total categories count
    const totalCategories = await this.categoryRepository.count({
      where: { isActive: true }
    });

    // Get all active products with category info for calculations
    const products = await this.productRepository.find({
      relations: ['category'],
      where: { deletedAt: null }
    });

    // Calculate comprehensive statistics
    let inventoryValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const categoryMap = new Map<string, { count: number; value: number }>();

    products.forEach(product => {
      const stock = Number(product.stockQuantity) || 0;
      const price = Number(product.retailPrice) || 0;
      const reorderLevel = Number(product.reorderLevel) || 0;
      
      // Calculate inventory value
      inventoryValue += stock * price;

      // Count low stock and out of stock
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= reorderLevel) {
        lowStockCount++;
      }

      // Category breakdown
      const categoryName = product.category?.name || 'Uncategorized';
      const existing = categoryMap.get(categoryName) || { count: 0, value: 0 };
      existing.count += 1;
      existing.value += stock * price;
      categoryMap.set(categoryName, existing);
    });

    // Convert category map to array and sort by value
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 categories

    // Calculate stock health metrics
    const inStockCount = totalProducts - outOfStockCount;
    const stockHealthMetrics = {
      inStockPercentage: totalProducts > 0 ? Math.round((inStockCount / totalProducts) * 100) : 0,
      lowStockPercentage: totalProducts > 0 ? Math.round((lowStockCount / totalProducts) * 100) : 0,
      outOfStockPercentage: totalProducts > 0 ? Math.round((outOfStockCount / totalProducts) * 100) : 0,
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
   * Convert product entity to response DTO
   */
  private toResponseDto(product: Product): ProductResponseDto {
    return {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
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
      grossMarginSpecial: product.grossMarginSpecial,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /**
   * Validate product pricing logic
   */
  private validatePricing(productData: any): void {
    const { baseCost, retailPrice, wholesalePrice, specialPrice } = productData;

    // Only validate selling prices against base cost if they are greater than 0
    // This allows base cost to be higher than selling prices (negative margins)
    if (retailPrice > 0 && retailPrice < baseCost) {
      this.logger.warn(`Retail price (${retailPrice}) is lower than base cost (${baseCost}) - negative margin`);
    }

    if (wholesalePrice > 0 && wholesalePrice < baseCost) {
      this.logger.warn(`Wholesale price (${wholesalePrice}) is lower than base cost (${baseCost}) - negative margin`);
    }

    if (specialPrice > 0 && specialPrice < baseCost) {
      this.logger.warn(`Special price (${specialPrice}) is lower than base cost (${baseCost}) - negative margin`);
    }

    // Keep the wholesale vs retail validation as it's a business logic rule
    if (wholesalePrice > 0 && retailPrice > 0 && wholesalePrice > retailPrice) {
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