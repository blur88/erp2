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
  // TreeRepository, // Temporarily disabled due to tree structure issues
  FindManyOptions,
  SelectQueryBuilder,
  In,
} from 'typeorm';
import { Category } from '../../../database/entities/category.entity';
import { Product } from '../../../database/entities/product.entity';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryCategoriesDto,
  CategoryResponseDto,
  CategoryListResponseDto,
  CategoryTreeResponseDto,
  MoveCategoryDto,
  BulkUpdateCategoriesDto,
  CategoryStatsDto,
  CategoryAncestorsDto,
} from '../dto/category.dto';
import { AuditService } from './audit.service';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>, // Changed from TreeRepository to Repository
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new category
   */
  async create(createCategoryDto: CreateCategoryDto, userId?: string): Promise<CategoryResponseDto> {
    this.logger.log(`Creating category: ${createCategoryDto.name}`);

    // Check if name already exists at the same level
    await this.validateCategoryName(createCategoryDto.name, createCategoryDto.parentId);

    // Convert empty string code to null to prevent unique constraint violations
    const code = createCategoryDto.code?.trim() || null;

    // Check if code already exists (if provided)
    if (code) {
      await this.validateCategoryCode(code);
    }

    // Validate parent category if provided
    let parent: Category | undefined;
    if (createCategoryDto.parentId) {
      parent = await this.categoryRepository.findOne({
        where: { id: createCategoryDto.parentId, isActive: true },
      });

      if (!parent) {
        throw new NotFoundException(`Parent category with ID '${createCategoryDto.parentId}' not found or inactive`);
      }
    }

    // Calculate level
    const level = parent ? parent.level + 1 : 0;

    // Create category
    const category = this.categoryRepository.create({
      ...createCategoryDto,
      code,
      level,
      parent,
      isActive: createCategoryDto.isActive ?? true,
      sortOrder: createCategoryDto.sortOrder ?? 0,
    });

    const savedCategory = await this.categoryRepository.save(category);

    // Log audit event (temporarily disabled due to audit schema mismatch)
    try {
      await this.auditService.logCategoryEvent(
        savedCategory.id,
        'CATEGORY_CREATED',
        `Category ${savedCategory.name} created`,
        userId,
        {
          parentId: parent?.id,
          level: savedCategory.level,
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to log audit event: ${error.message}`);
    }

    this.logger.log(`Category created successfully with ID: ${savedCategory.id}`);
    return this.toResponseDto(savedCategory);
  }

  /**
   * Find all categories with filtering, sorting, and pagination
   */
  async findAll(query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    const {
      page = 1,
      limit = 20,
      search,
      parentId,
      isActive,
      includeTree = false,
      includeProductCount = false,
      sortBy = 'name',
      sortOrder = 'ASC',
    } = query;

    let queryBuilder: SelectQueryBuilder<Category>;

    if (includeTree && !parentId) {
      // For tree view, start with root categories only
      queryBuilder = this.categoryRepository
        .createQueryBuilder('category')
        .where('category.level = 0');
    } else {
      queryBuilder = this.categoryRepository
        .createQueryBuilder('category')
        .where('1=1');
    }

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(category.name ILIKE :search OR category.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (parentId !== undefined) {
      if (parentId === null) {
        queryBuilder.andWhere('category.parentId IS NULL');
      } else {
        queryBuilder.andWhere('category.parentId = :parentId', { parentId });
      }
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('category.isActive = :isActive', { isActive });
    }

    // Apply sorting
    const validSortFields = ['name', 'code', 'createdAt', 'sortOrder'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    queryBuilder.orderBy(`category.${sortField}`, sortOrder);

    // Add secondary sort by sortOrder if not primary sort
    if (sortField !== 'sortOrder') {
      queryBuilder.addOrderBy('category.sortOrder', 'ASC');
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [categories, total] = await queryBuilder.getManyAndCount();

    let data: CategoryResponseDto[] = [];

    if (includeTree && !parentId) {
      // Load full tree structure for root categories
      const treeData = await Promise.all(
        categories.map(async (category) => {
          const tree = await this.categoryRepository.findDescendantsTree(category);
          return this.toResponseDto(tree, true, includeProductCount);
        }),
      );
      data = treeData;
    } else {
      // Regular list view
      data = await Promise.all(
        categories.map(async (category) => 
          this.toResponseDto(category, false, includeProductCount)
        ),
      );
    }

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
   * Get complete category tree
   */
  async getTree(includeProductCount = false): Promise<CategoryTreeResponseDto> {
    const trees = await this.categoryRepository.findTrees();
    
    const data = await Promise.all(
      trees.map(async (tree) => this.toResponseDto(tree, true, includeProductCount)),
    );

    // Calculate metadata
    const allCategories = await this.categoryRepository.find();
    const maxDepth = Math.max(...allCategories.map(c => c.level), 0);
    const rootCategories = allCategories.filter(c => c.level === 0).length;

    return {
      data,
      meta: {
        totalCategories: allCategories.length,
        maxDepth,
        rootCategories,
      },
    };
  }

  /**
   * Find one category by ID
   */
  async findOne(id: string, includeChildren = false, includeProductCount = false): Promise<CategoryResponseDto> {
    let category: Category | null;

    if (includeChildren) {
      category = await this.categoryRepository.findOne({
        where: { id },
      });

      if (category) {
        category = await this.categoryRepository.findDescendantsTree(category);
      }
    } else {
      category = await this.categoryRepository.findOne({
        where: { id },
      });
    }

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    return this.toResponseDto(category, includeChildren, includeProductCount);
  }

  /**
   * Get category ancestors (breadcrumb path)
   */
  async getAncestors(id: string): Promise<CategoryAncestorsDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    
    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    const ancestors = await this.categoryRepository.findAncestors(category);
    
    // Remove the category itself from ancestors and reverse order (root first)
    const ancestorList = ancestors
      .filter(ancestor => ancestor.id !== category.id)
      .reverse();

    return {
      id: category.id,
      ancestors: ancestorList.map(ancestor => this.toResponseDto(ancestor)),
      category: this.toResponseDto(category),
      breadcrumbs: [...ancestorList.map(a => a.name), category.name],
    };
  }

  /**
   * Update a category
   */
  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId?: string): Promise<CategoryResponseDto> {
    this.logger.log(`Updating category with ID: ${id}`);

    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    // Check for name conflicts if name is being changed
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      await this.validateCategoryName(updateCategoryDto.name, category.parentId, id);
    }

    // Convert empty string code to null and check for code conflicts if code is being changed
    const code = updateCategoryDto.code !== undefined ? (updateCategoryDto.code?.trim() || null) : undefined;
    if (code !== undefined && code !== category.code) {
      if (code) {
        await this.validateCategoryCode(code, id);
      }
      updateCategoryDto.code = code;
    }
    
    // Additional safety check: ensure no empty strings are passed to database
    if (updateCategoryDto.code === '') {
      updateCategoryDto.code = null;
    }

    // Track changes for audit
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateCategoryDto).forEach(key => {
      if (updateCategoryDto[key] !== category[key]) {
        changes[key] = { from: category[key], to: updateCategoryDto[key] };
      }
    });

    // Update category
    Object.assign(category, updateCategoryDto);
    const updatedCategory = await this.categoryRepository.save(category);

    // Log audit event
    if (Object.keys(changes).length > 0) {
      await this.auditService.logCategoryEvent(
        updatedCategory.id,
        'CATEGORY_UPDATED',
        `Category ${updatedCategory.name} updated`,
        userId,
        { changes },
      );
    }

    this.logger.log(`Category updated successfully: ${updatedCategory.id}`);
    return this.toResponseDto(updatedCategory);
  }

  /**
   * Move category to a new parent
   */
  async moveCategory(id: string, moveCategoryDto: MoveCategoryDto, userId?: string): Promise<CategoryResponseDto> {
    this.logger.log(`Moving category ${id} to parent ${moveCategoryDto.newParentId}`);

    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    // Prevent circular references
    if (moveCategoryDto.newParentId) {
      const newParent = await this.categoryRepository.findOne({
        where: { id: moveCategoryDto.newParentId },
      });

      if (!newParent) {
        throw new NotFoundException(`New parent category with ID '${moveCategoryDto.newParentId}' not found`);
      }

      // Check if the new parent is a descendant of the current category
      const descendants = await this.categoryRepository.findDescendants(category);
      if (descendants.some(desc => desc.id === moveCategoryDto.newParentId)) {
        throw new BadRequestException('Cannot move category to one of its descendants');
      }

      category.parent = newParent;
      category.parentId = moveCategoryDto.newParentId;
      category.level = newParent.level + 1;
    } else {
      // Moving to root level
      category.parent = null;
      category.parentId = null;
      category.level = 0;
    }

    if (moveCategoryDto.sortOrder !== undefined) {
      category.sortOrder = moveCategoryDto.sortOrder;
    }

    const movedCategory = await this.categoryRepository.save(category);

    // Update levels for all descendants
    await this.updateDescendantLevels(movedCategory);

    // Log audit event
    await this.auditService.logCategoryEvent(
      movedCategory.id,
      'CATEGORY_MOVED',
      `Category ${movedCategory.name} moved to new parent`,
      userId,
      {
        oldParentId: category.parentId,
        newParentId: moveCategoryDto.newParentId,
        newLevel: movedCategory.level,
      },
    );

    this.logger.log(`Category moved successfully: ${movedCategory.id}`);
    return this.toResponseDto(movedCategory);
  }

  /**
   * Delete a category
   */
  async remove(id: string, userId?: string): Promise<void> {
    this.logger.log(`Deleting category with ID: ${id}`);

    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['children', 'products'],
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    this.logger.log(`Found category: ${category.name} with ${category.products?.length || 0} products and ${category.children?.length || 0} children`);

    // Check if category has children
    if (category.children && category.children.length > 0) {
      throw new BadRequestException(
        'Cannot delete category that has subcategories. Move or delete subcategories first.',
      );
    }

    // Check if category has active products by querying directly
    const activeProductCount = await this.productRepository.count({
      where: { categoryId: id }
    });
    
    // Also check for soft-deleted products that still reference this category
    const allProductCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.categoryId = :categoryId', { categoryId: id })
      .withDeleted() // Include soft-deleted records
      .getCount();
    
    this.logger.log(`Active product count: ${activeProductCount}, All products (including deleted): ${allProductCount}`);

    // Handle all products (including soft-deleted ones) that reference this category
    if (allProductCount > 0) {
      this.logger.log(`Moving ${allProductCount} products (including deleted) to Uncategorized category`);
      
      // Find or create "Uncategorized" category (including soft-deleted ones)
      let uncategorizedCategory = await this.categoryRepository.findOne({
        where: { name: 'Uncategorized' },
        withDeleted: true // Include soft-deleted records
      });
      
      if (!uncategorizedCategory) {
        this.logger.log('Creating Uncategorized category');
        uncategorizedCategory = this.categoryRepository.create({
          name: 'Uncategorized',
          code: 'UNCAT',
          description: 'Products without specific category',
          isActive: true,
          sortOrder: 999,
          level: 0,
          path: null,
          fullPath: 'Uncategorized',
          isRoot: true,
          parentId: null,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        uncategorizedCategory = await this.categoryRepository.save(uncategorizedCategory);
        this.logger.log(`Created Uncategorized category with ID: ${uncategorizedCategory.id}`);
      } else if (uncategorizedCategory.deletedAt) {
        // Restore soft-deleted Uncategorized category
        this.logger.log(`Restoring soft-deleted Uncategorized category with ID: ${uncategorizedCategory.id}`);
        uncategorizedCategory.deletedAt = null;
        uncategorizedCategory.isActive = true;
        uncategorizedCategory.updatedBy = userId || null;
        uncategorizedCategory.updatedAt = new Date();
        uncategorizedCategory = await this.categoryRepository.save(uncategorizedCategory);
        this.logger.log(`Restored Uncategorized category with ID: ${uncategorizedCategory.id}`);
      } else {
        this.logger.log(`Found existing active Uncategorized category with ID: ${uncategorizedCategory.id}`);
      }
      
      // Update all products (including soft-deleted ones) to reference the Uncategorized category
      this.logger.log(`Updating products from category ${id} to ${uncategorizedCategory.id}`);
      const updateResult = await this.productRepository.manager.query(
        'UPDATE products SET "categoryId" = $1, "updatedBy" = $2, "updatedAt" = NOW() WHERE "categoryId" = $3',
        [uncategorizedCategory.id, userId || null, id]
      );
      this.logger.log(`Update result executed successfully`);
      
      // Verify the update worked (check both active and soft-deleted)
      const remainingActiveCount = await this.productRepository.count({
        where: { categoryId: id }
      });
      const remainingAllCount = await this.productRepository.manager.query(
        'SELECT COUNT(*) as count FROM products WHERE "categoryId" = $1',
        [id]
      );
      this.logger.log(`Remaining products with old category - Active: ${remainingActiveCount}, All: ${remainingAllCount[0]?.count || 0}`);
    }

    // Use soft delete instead of hard delete to preserve referential integrity
    await this.categoryRepository.softRemove(category);

    // Log audit event
    await this.auditService.logCategoryEvent(
      id,
      'CATEGORY_DELETED',
      `Category ${category.name} deleted, ${category.products?.length || 0} products uncategorized`,
      userId,
    );

    this.logger.log(`Category deleted successfully: ${id}`);
  }

  /**
   * Restore a soft-deleted category
   */
  async restore(id: string, userId?: string): Promise<CategoryResponseDto> {
    this.logger.log(`Restoring category with ID: ${id}`);

    const category = await this.categoryRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    if (!category.deletedAt) {
      throw new BadRequestException(`Category '${category.name}' is not deleted`);
    }

    // Restore the category
    category.deletedAt = null;
    category.isActive = true;
    category.updatedBy = userId || null;
    category.updatedAt = new Date();

    const restoredCategory = await this.categoryRepository.save(category);

    // Log audit event
    await this.auditService.logCategoryEvent(
      restoredCategory.id,
      'CATEGORY_RESTORED',
      `Category ${restoredCategory.name} restored`,
      userId,
    );

    this.logger.log(`Category restored successfully: ${restoredCategory.id}`);
    return this.toResponseDto(restoredCategory);
  }

  /**
   * Bulk update categories
   */
  async bulkUpdate(bulkUpdateDto: BulkUpdateCategoriesDto, userId?: string): Promise<void> {
    this.logger.log(`Bulk updating ${bulkUpdateDto.categories.length} categories`);

    const categoryIds = bulkUpdateDto.categories.map(c => c.id);
    const categories = await this.categoryRepository.findBy({ id: In(categoryIds) });

    if (categories.length !== categoryIds.length) {
      const foundIds = categories.map(c => c.id);
      const missingIds = categoryIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Categories not found: ${missingIds.join(', ')}`);
    }

    const updates = bulkUpdateDto.categories.map(async (categoryUpdate) => {
      const category = categories.find(c => c.id === categoryUpdate.id)!;
      
      // Validate name conflicts if name is changing
      if (categoryUpdate.name && categoryUpdate.name !== category.name) {
        await this.validateCategoryName(categoryUpdate.name, category.parentId, category.id);
      }

      // Convert empty string code to null
      if (categoryUpdate.code !== undefined) {
        categoryUpdate.code = categoryUpdate.code?.trim() || null;
      }

      // Track changes
      const changes: Record<string, { from: any; to: any }> = {};
      ['name', 'isActive', 'sortOrder', 'parentId'].forEach(field => {
        if (categoryUpdate[field] !== undefined && categoryUpdate[field] !== category[field]) {
          changes[field] = { from: category[field], to: categoryUpdate[field] };
        }
      });

      // Apply updates
      Object.assign(category, categoryUpdate);
      
      const updatedCategory = await this.categoryRepository.save(category);

      // Log audit event
      if (Object.keys(changes).length > 0) {
        await this.auditService.logCategoryEvent(
          updatedCategory.id,
          'CATEGORY_BULK_UPDATED',
          `Category ${updatedCategory.name} bulk updated`,
          userId,
          { changes },
        );
      }

      return updatedCategory;
    });

    await Promise.all(updates);

    this.logger.log(`Bulk update completed for ${updates.length} categories`);
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(id: string): Promise<CategoryStatsDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    // Get direct products count
    const directProductsQuery = this.productRepository
      .createQueryBuilder('product')
      .where('product.categoryId = :categoryId', { categoryId: id });

    const [
      directProducts,
      directProductCount,
      activeProducts,
      inactiveProducts,
      lowStockProducts,
      outOfStockProducts,
    ] = await Promise.all([
      directProductsQuery.getMany(),
      directProductsQuery.getCount(),
      directProductsQuery.clone().andWhere('product.isActive = true').getCount(),
      directProductsQuery.clone().andWhere('product.isActive = false').getCount(),
      directProductsQuery.clone().andWhere('product.stockQuantity <= product.reorderLevel').getCount(),
      directProductsQuery.clone().andWhere('(product.stockQuantity - product.reservedQuantity) <= 0').getCount(),
    ]);

    // Get all descendants for total counts
    const descendants = await this.categoryRepository.findDescendants(category);
    const allCategoryIds = [id, ...descendants.map(d => d.id)];

    const totalProductsQuery = this.productRepository
      .createQueryBuilder('product')
      .where('product.categoryId IN (:...categoryIds)', { categoryIds: allCategoryIds });

    const [totalProductCount, totalSubcategoryCount] = await Promise.all([
      totalProductsQuery.getCount(),
      Promise.resolve(descendants.length),
    ]);

    // Calculate price statistics
    const priceStats = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'AVG(product.retailPrice) as avgPrice',
        'MAX(product.retailPrice) as maxPrice',
        'MIN(product.retailPrice) as minPrice',
        'SUM(product.stockQuantity * product.baseCost) as totalStockValue',
      ])
      .where('product.categoryId = :categoryId', { categoryId: id })
      .getRawOne();

    // Count direct subcategories
    const directSubcategoryCount = await this.categoryRepository.count({
      where: { parentId: id },
    });

    return {
      id: category.id,
      name: category.name,
      fullPath: category.fullPath,
      directProductCount,
      totalProductCount,
      subcategoryCount: directSubcategoryCount,
      totalSubcategoryCount,
      totalStockValue: Number(priceStats.totalStockValue || 0),
      activeProductCount: activeProducts,
      inactiveProductCount: inactiveProducts,
      lowStockProductCount: lowStockProducts,
      outOfStockProductCount: outOfStockProducts,
      averageRetailPrice: Number(priceStats.avgPrice || 0),
      highestPrice: Number(priceStats.maxPrice || 0),
      lowestPrice: Number(priceStats.minPrice || 0),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  /**
   * Convert category entity to response DTO
   */
  private async toResponseDto(
    category: Category, 
    includeChildren = false, 
    includeProductCount = false,
  ): Promise<CategoryResponseDto> {
    const response: CategoryResponseDto = {
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      imageUrl: category.imageUrl,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      path: category.path,
      level: category.level,
      parentId: category.parentId,
      fullPath: category.fullPath,
      isRoot: category.isRoot,
      hasChildren: category.hasChildren,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };

    // Include product count if requested
    if (includeProductCount) {
      response.productCount = await this.productRepository.count({
        where: { categoryId: category.id },
      });
    }

    // Include children if requested and available
    if (includeChildren && category.children) {
      response.children = await Promise.all(
        category.children.map(child => 
          this.toResponseDto(child, includeChildren, includeProductCount)
        ),
      );
    }

    return response;
  }

  /**
   * Validate category name uniqueness at the same level
   */
  private async validateCategoryName(name: string, parentId?: string, excludeId?: string): Promise<void> {
    const query = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.name = :name', { name });

    if (parentId) {
      query.andWhere('category.parentId = :parentId', { parentId });
    } else {
      query.andWhere('category.parentId IS NULL');
    }

    if (excludeId) {
      query.andWhere('category.id != :excludeId', { excludeId });
    }

    const existingCategory = await query.getOne();

    if (existingCategory) {
      throw new ConflictException(
        `Category with name '${name}' already exists at this level`,
      );
    }
  }

  /**
   * Validate category code uniqueness
   */
  private async validateCategoryCode(code: string, excludeId?: string): Promise<void> {
    const query = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.code = :code', { code });

    if (excludeId) {
      query.andWhere('category.id != :excludeId', { excludeId });
    }

    const existingCategory = await query.getOne();

    if (existingCategory) {
      throw new ConflictException(`Category with code '${code}' already exists`);
    }
  }

  /**
   * Update levels for all descendants after moving a category
   */
  private async updateDescendantLevels(category: Category): Promise<void> {
    const descendants = await this.categoryRepository.findDescendants(category);
    
    const updates = descendants.map(async (descendant) => {
      if (descendant.id !== category.id) {
        // Calculate new level based on the path from the moved category
        const ancestors = await this.categoryRepository.findAncestors(descendant);
        descendant.level = ancestors.length - 1; // Subtract 1 because ancestors include the descendant itself
        return this.categoryRepository.save(descendant);
      }
    });

    await Promise.all(updates.filter(Boolean));
  }
}