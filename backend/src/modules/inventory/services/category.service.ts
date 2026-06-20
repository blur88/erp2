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
  FindOptionsWhere,
} from 'typeorm';
import { applyPagination } from '@/common/pagination/apply-pagination';
import { BaseCrudService } from '../../../common/services/base-crud.service';
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
  CategoryProductDto,
} from '../dto/category.dto';
import { ValidationUtil, BulkOperationUtil, BulkOperationResponse } from '../../../common/utils/validation.util';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class CategoryService extends BaseCrudService<
  Category,
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryCategoriesDto
> {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>, // Changed from TreeRepository to Repository
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    auditLogService: AuditLogService,
  ) {
    super(categoryRepository, auditLogService);
  }

  getEntityType(): string {
    return 'Category';
  }

  buildWhereClause(query: QueryCategoriesDto): FindOptionsWhere<Category> {
    const where: FindOptionsWhere<Category> = {};

    if (query.parentId !== undefined) {
      where.parentId = query.parentId;
    }

    return where;
  }

  protected applyQueryBuilder(qb: any, query: QueryCategoriesDto): any {
    if (query.includeTree && !query.parentId) {
      qb = qb.andWhere('category.level = 0');
    }

    if (query.parentId !== undefined) {
      if (query.parentId === null) {
        qb = qb.andWhere('category.parentId IS NULL');
      } else {
        qb = qb.andWhere('category.parentId = :parentId', { parentId: query.parentId });
      }
    }

    qb = qb
      .orderBy('UPPER(COALESCE(category.path, category.name))', 'ASC')
      .addOrderBy('category.level', 'ASC');

    const sortField = ['name', 'createdAt'].includes(query.sortBy ?? '') ? query.sortBy! : 'name';
    if (sortField === 'name') {
      qb = qb.addOrderBy('UPPER(category.name)', query.sortOrder ?? 'ASC');
    } else {
      qb = qb.addOrderBy(`category.${sortField}`, query.sortOrder ?? 'ASC');
    }

    return qb;
  }

  protected applySearch(qb: any, search: string, _alias: string): any {
    return qb.andWhere('category.name ILIKE :search', { search: `%${search}%` });
  }

  protected get allowedSortFields(): string[] {
    return ['name', 'createdAt', 'updatedAt', 'deletedAt'];
  }

  private buildCategoryListQuery(query: QueryCategoriesDto, options: { includeDeleted: boolean }) {
    let queryBuilder = this.categoryRepository.createQueryBuilder('category');

    if (options.includeDeleted) {
      queryBuilder = queryBuilder.withDeleted().where('category.deletedAt IS NOT NULL');
    } else {
      queryBuilder = queryBuilder.where('1=1');
    }

    if (query.search) {
      queryBuilder = this.applySearch(queryBuilder, query.search, 'category');
    }

    return this.applyQueryBuilder(queryBuilder, query);
  }

  /**
   * Create a new category
   */
  async create(
    createCategoryDto: CreateCategoryDto,
    userId?: string,
    username?: string,
  ): Promise<CategoryResponseDto> {
    this.logger.log(`Creating category: ${createCategoryDto.name}`);

    // Check if name already exists at the same level
    await this.validateCategoryName(createCategoryDto.name, createCategoryDto.parentId);

    // Validate parent category if provided
    let parent: Category | undefined;
    if (createCategoryDto.parentId) {
      parent = await this.categoryRepository.findOne({
        where: { id: createCategoryDto.parentId },
      });

      if (!parent) {
        throw new NotFoundException(`Parent category with ID '${createCategoryDto.parentId}' not found or inactive`);
      }
    }

    // Calculate level and path
    const level = parent ? parent.level + 1 : 0;
    const path = parent ? `${parent.path || parent.name}.${createCategoryDto.name}` : createCategoryDto.name;

    // Create category
    const category = this.categoryRepository.create({
      ...createCategoryDto,
      level,
      path,
      parentId: createCategoryDto.parentId,
    });

    const savedCategory = await this.categoryRepository.save(category);

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'Category',
      `Created category: ${savedCategory.name}`,
      {
        entityId: savedCategory.id,
        userId: userId || 'system',
        username,
        newValues: {
          name: savedCategory.name,
          parentId: savedCategory.parentId,
          level: savedCategory.level,
        },
      }
    );

    this.logger.log(`Category created successfully with ID: ${savedCategory.id}`);
    return this.toResponseDto(savedCategory);
  }

  /**
   * Find all categories with filtering, sorting, and pagination
   */
  async findAll(query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    const {
      page,
      limit,
      includeTree = false,
      includeProductCount = false,
    } = query;
    const queryBuilder = this.buildCategoryListQuery(query, { includeDeleted: false });

    // Apply pagination
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [categories, total] = await queryBuilder.getManyAndCount();

    let data: CategoryResponseDto[] = [];

    if (includeTree && !query.parentId) {
      // Load full tree structure for root categories
      const treeData = await Promise.all(
        categories.map(async (category) => {
          const categoryWithChildren = await this.loadCategoryTree(category);
          return this.toResponseDto(categoryWithChildren, true, includeProductCount);
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
        total,
        ...(shouldPaginate && { page }),
        ...(shouldPaginate && { limit }),
        ...(shouldPaginate && { totalPages: Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasNextPage: page < Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasPreviousPage: page > 1 }),
      },
    };
  }

  async getCategoryProducts(id: string): Promise<{ data: CategoryProductDto[] }> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    const products = await this.productRepository.find({
      where: { categoryId: id },
      select: { id: true, name: true, stockQuantity: true },
    });

    return { data: products as CategoryProductDto[] };
  }

  /**
   * Find all soft-deleted categories
   */
  async findDeleted(query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    this.logger.log('Fetching deleted categories with filters:', query);

    const {
      page,
      limit,
    } = query;
    const shouldPaginate = page !== undefined && limit !== undefined;
    const deletedQuery = {
      ...query,
      sortBy: this.allowedSortFields.includes(query.sortBy ?? '') ? query.sortBy : 'deletedAt',
      sortOrder: query.sortOrder ?? 'DESC',
    } as QueryCategoriesDto;
    const queryBuilder = this.buildCategoryListQuery(deletedQuery, { includeDeleted: true });

    applyPagination(queryBuilder, page, limit);

    const [categories, total] = await queryBuilder.getManyAndCount();

    const data = await Promise.all(
      categories.map(async (category) =>
        await this.toResponseDto(category, false, false)
      ),
    );

    return {
      data,
      meta: {
        total,
        ...(shouldPaginate && { page }),
        ...(shouldPaginate && { limit }),
        ...(shouldPaginate && { totalPages: Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasNextPage: page < Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasPreviousPage: page > 1 }),
      },
    };
  }

  /**
   * Get complete category tree
   */
  async getTree(includeProductCount = false): Promise<CategoryTreeResponseDto> {
    try {
      // Get all root categories (level 0) with case-insensitive name sorting
      const rootCategories = await this.categoryRepository
        .createQueryBuilder('category')
        .where('category.level = 0')
        .orderBy('UPPER(category.name)', 'ASC')
        .getMany();
      
      const data = await Promise.all(
        rootCategories.map(async (category) => {
          const categoryWithChildren = await this.loadCategoryTree(category);
          return this.toResponseDto(categoryWithChildren, true, includeProductCount);
        }),
      );

      // Calculate metadata
      const allCategories = await this.categoryRepository.find();
      const maxDepth = allCategories.length > 0 ? Math.max(...allCategories.map(c => c.level), 0) : 0;
      const rootCategoriesCount = allCategories.filter(c => c.level === 0).length;

      return {
        data,
        meta: {
          totalCategories: allCategories.length,
          maxDepth,
          rootCategories: rootCategoriesCount,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting category tree: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find one category by ID
   */
  async findOne(id: string, includeChildren = false, includeProductCount = false): Promise<CategoryResponseDto> {
    let category: Category | null;

    category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (category && includeChildren) {
      category = await this.loadCategoryTree(category);
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

    const ancestors = await this.loadAncestors(category);
    
    return {
      id: category.id,
      ancestors: await Promise.all(ancestors.map(ancestor => this.toResponseDto(ancestor))),
      category: await this.toResponseDto(category),
      breadcrumbs: [...ancestors.map(a => a.name), category.name],
    };
  }

  /**
   * Update a category
   */
  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    userId?: string,
    username?: string,
  ): Promise<CategoryResponseDto> {
    this.logger.log(`Updating category with ID: ${id}`);

    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    // Check if name is being changed - this requires updating all descendant paths
    const nameChanged = updateCategoryDto.name && updateCategoryDto.name !== category.name;
    
    // Check if parent is being changed - this also requires updating levels and paths
    const parentChanged = updateCategoryDto.hasOwnProperty('parentId') && updateCategoryDto.parentId !== category.parentId;

    // Check for name conflicts if name is being changed or parent is being changed
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      // Name is changing - validate against the new parent (if also changing parent)
      const parentIdForValidation = updateCategoryDto.hasOwnProperty('parentId') 
        ? updateCategoryDto.parentId 
        : category.parentId;
      await this.validateCategoryName(updateCategoryDto.name, parentIdForValidation, id);
    } else if (parentChanged) {
      // Only parent is changing - validate current name against new parent
      await this.validateCategoryName(category.name, updateCategoryDto.parentId, id);
    }

    // Track changes for audit
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateCategoryDto).forEach(key => {
      if (updateCategoryDto[key] !== category[key]) {
        changes[key] = { from: category[key], to: updateCategoryDto[key] };
      }
    });
    
    this.logger.log(`Name changed: ${nameChanged}, Parent changed: ${parentChanged}`);
    this.logger.log(`Old parent: ${category.parentId}, New parent: ${updateCategoryDto.parentId}`);

    // Validate parent change to prevent circular references
    if (parentChanged && updateCategoryDto.parentId) {
      const newParent = await this.categoryRepository.findOne({
        where: { id: updateCategoryDto.parentId },
      });

      if (!newParent) {
        throw new NotFoundException(`New parent category with ID '${updateCategoryDto.parentId}' not found`);
      }

      // Check if the new parent is a descendant of the current category
      const descendants = await this.loadAllDescendants(category);
      if (descendants.some(desc => desc.id === updateCategoryDto.parentId)) {
        throw new BadRequestException('Cannot move category to one of its descendants');
      }
    }

    // Update category
    Object.assign(category, updateCategoryDto);
    const updatedCategory = await this.categoryRepository.save(category);

    // If name or parent changed, update paths and levels for this category and all descendants
    if (nameChanged || parentChanged) {
      this.logger.log(`Updating paths and levels for category ${updatedCategory.name} and its descendants`);
      
      // Recalculate level and path for the updated category
      if (updatedCategory.parentId) {
        const parent = await this.categoryRepository.findOne({
          where: { id: updatedCategory.parentId }
        });
        if (parent) {
          updatedCategory.level = parent.level + 1;
          updatedCategory.path = parent.path ? `${parent.path}.${updatedCategory.name}` : `${parent.name}.${updatedCategory.name}`;
        }
      } else {
        // Moving to root level
        updatedCategory.level = 0;
        updatedCategory.path = updatedCategory.name;
      }
      
      this.logger.log(`Updated category level: ${updatedCategory.level}, path: "${updatedCategory.path}"`);
      await this.categoryRepository.save(updatedCategory);

      // Update levels and paths for all descendants
      await this.updateDescendantLevelsAndPaths(updatedCategory);
      this.logger.log(`Finished updating descendant paths for category ${updatedCategory.name}`);
    }

    // Log audit trail for update
    if (Object.keys(changes).length > 0) {
      await this.auditLogService.log(
        'UPDATE',
        'Category',
        `Updated category: ${updatedCategory.name}`,
        {
          entityId: updatedCategory.id,
          userId: userId || 'system',
          username,
          oldValues: Object.fromEntries(
            Object.entries(changes).map(([key, val]) => [key, val.from])
          ),
          newValues: Object.fromEntries(
            Object.entries(changes).map(([key, val]) => [key, val.to])
          ),
        }
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
      const descendants = await this.loadAllDescendants(category);
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

    const movedCategory = await this.categoryRepository.save(category);

    // Update levels and paths for all descendants
    await this.updateDescendantLevelsAndPaths(movedCategory);

    // Audit logging removed with authentication system

    this.logger.log(`Category moved successfully: ${movedCategory.id}`);
    return this.toResponseDto(movedCategory);
  }

  /**
   * Delete a category with hybrid approach
   */
  async remove(id: string, userId?: string, options?: {
    force?: boolean;
    moveToUncategorized?: boolean;
  }, username?: string): Promise<{ message: string; moved?: number }> {
    this.logger.log(`Deleting category with ID: ${id}`, { options });

    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: { children: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

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

    this.logger.log(`Found category: ${category.name} with ${activeProductCount} active products and ${category.children?.length || 0} children`);

    // Handle categories with products
    if (activeProductCount > 0) {
      if (!options?.force) {
        // Default behavior: prevent deletion with detailed error
        throw new BadRequestException({
          message: `Cannot delete category '${category.name}' because it contains ${activeProductCount} product${activeProductCount === 1 ? '' : 's'}.`,
          productCount: activeProductCount,
          categoryName: category.name,
          suggestions: [
            'Move products to another category first',
            'Delete products individually',
            'Force delete and move products to Uncategorized category'
          ]
        });
      }

      if (options.moveToUncategorized) {
        // Move products to Uncategorized before deletion
        const movedCount = await this.moveProductsToUncategorized(id, userId);
        await this.categoryRepository.softDelete(id);

        this.logger.log(`Category deleted successfully with ${movedCount} products moved to Uncategorized`);
        return {
          moved: movedCount,
          message: `Category '${category.name}' deleted. ${movedCount} product${movedCount === 1 ? '' : 's'} moved to Uncategorized.`
        };
      } else {
        // Force delete without moving (this would orphan products, but we'll prevent this)
        throw new BadRequestException(
          'Force deletion without moving products is not allowed. Use moveToUncategorized option.'
        );
      }
    }

    // Normal deletion (no products)
    await this.categoryRepository.softDelete(id);

    // Log audit trail for delete
    await this.auditLogService.log(
      'DELETE',
      'Category',
      `Deleted category: ${category.name}`,
      {
        entityId: category.id,
        userId: userId || 'system',
        username,
        oldValues: {
          name: category.name,
          parentId: category.parentId,
          level: category.level,
        },
      }
    );

    this.logger.log(`Category deleted successfully: ${id}`);
    return { message: `Category '${category.name}' deleted successfully.` };
  }

  /**
   * Restore a soft-deleted category
   */
  async restore(id: string, userId?: string, username?: string): Promise<CategoryResponseDto> {
    this.logger.log(`Restoring category with ID: ${id}`);

    const category = await this.categoryRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
    });

    // Use standardized validation
    ValidationUtil.validateForRestore(category, 'Category', id);

    // Restore the category (clears deletedAt)
    await this.categoryRepository.restore(id);

    // Also update isActive to true since this project uses both soft delete approaches
    await this.categoryRepository.update(id, {
      isActive: true,
    });

    // Fetch the updated category after restore
    const restoredCategory = await this.categoryRepository.findOne({
      where: { id },
    });

    // Log audit trail for restore
    await this.auditLogService.log(
      'RESTORE',
      'Category',
      `Restored category: ${restoredCategory.name}`,
      {
        entityId: restoredCategory.id,
        userId: userId || 'system',
        username,
        newValues: {
          name: restoredCategory.name,
          parentId: restoredCategory.parentId,
          level: restoredCategory.level,
        },
      }
    );

    this.logger.log(`Category restored successfully: ${restoredCategory.id}`);
    return this.toResponseDto(restoredCategory);
  }

  /**
   * Permanently delete a category from database
   */
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Permanently deleting category with ID: ${id}`);

    // Find the category (including soft-deleted ones)
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: { children: true, products: true },
      withDeleted: true,
    });

    // Use standardized validation
    ValidationUtil.validateForPermanentDelete(category, 'Category', id);

    // Check comprehensive dependencies with standardized error messaging
    const dependencies = [
      { name: 'subcategory', count: category.children?.length || 0 },
      { name: 'product', count: category.products?.length || 0 },
    ];

    const activeDependencies = dependencies.filter(dep => dep.count > 0);
    if (activeDependencies.length > 0) {
      throw new BadRequestException(
        ValidationUtil.createDependencyErrorMessage('category', activeDependencies)
      );
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'Category',
      `Permanently deleted category: ${category.name}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: {
          name: category.name,
          parentId: category.parentId,
          level: category.level,
        },
      }
    );

    // Perform the permanent deletion
    await this.categoryRepository.remove(category);

    this.logger.log(`Category permanently deleted successfully: ${id}`);
  }

  /**
   * Bulk restore soft-deleted categories
   */
  async bulkRestore(
    categoryIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    this.logger.log(`Bulk restoring ${categoryIds.length} categories`);

    if (!categoryIds || categoryIds.length === 0) {
      return BulkOperationUtil.createResponse('restored', 'category', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const categoryId of categoryIds) {
      try {
        const category = await this.categoryRepository.findOne({
          where: { id: categoryId },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForRestore(category, 'Category', categoryId);
        } catch (error) {
          BulkOperationUtil.addFailure(
            failedItems,
            categoryId,
            error.message,
            'VALIDATION_ERROR'
          );
          continue;
        }

        // Restore the category (clears deletedAt)
        await this.categoryRepository.restore(categoryId);

        // Also update isActive to true since this project uses both soft delete approaches
        await this.categoryRepository.update(categoryId, {
          isActive: true,
        });

        await this.auditLogService.log(
          'RESTORE',
          'Category',
          `Restored category: ${category.name}`,
          { entityId: categoryId, userId: userId || 'system', username }
        );

        successCount++;
        this.logger.log(`Category restored: ${categoryId}`);
      } catch (error) {
        this.logger.error(`Failed to restore category ${categoryId}: ${error.message}`);
        BulkOperationUtil.addFailure(
          failedItems,
          categoryId,
          error.message,
          'UNEXPECTED_ERROR'
        );
      }
    }

    return BulkOperationUtil.createResponse('restored', 'category', successCount, failedItems);
  }

  /**
   * Bulk permanently delete categories from database
   */
  async bulkPermanentDelete(
    categoryIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    this.logger.log(`Bulk permanently deleting ${categoryIds.length} categories`);

    if (!categoryIds || categoryIds.length === 0) {
      return BulkOperationUtil.createResponse('permanently deleted', 'category', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const categoryId of categoryIds) {
      try {
        const category = await this.categoryRepository.findOne({
          where: { id: categoryId },
          relations: { children: true, products: true },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForPermanentDelete(category, 'Category', categoryId);
        } catch (error) {
          BulkOperationUtil.addFailure(
            failedItems,
            categoryId,
            error.message,
            'VALIDATION_ERROR'
          );
          continue;
        }

        // Check dependencies with standardized error messaging
        const dependencies = [
          { name: 'subcategory', count: category.children?.length || 0 },
          { name: 'product', count: category.products?.length || 0 },
        ];

        const activeDependencies = dependencies.filter(dep => dep.count > 0);
        if (activeDependencies.length > 0) {
          BulkOperationUtil.addFailure(
            failedItems,
            categoryId,
            ValidationUtil.createDependencyErrorMessage('category', activeDependencies),
            'DEPENDENCY_ERROR'
          );
          continue;
        }

        // Perform the permanent deletion
        await this.auditLogService.log(
          'PERMANENT_DELETE',
          'Category',
          `Permanently deleted category: ${category.name}`,
          { entityId: categoryId, userId: userId || 'system', username }
        );
        await this.categoryRepository.remove(category);

        successCount++;
        this.logger.log(`Category permanently deleted: ${categoryId}`);
      } catch (error) {
        this.logger.error(`Failed to permanently delete category ${categoryId}: ${error.message}`);
        BulkOperationUtil.addFailure(
          failedItems,
          categoryId,
          error.message,
          'UNEXPECTED_ERROR'
        );
      }
    }

    return BulkOperationUtil.createResponse('permanently deleted', 'category', successCount, failedItems);
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


      // Track changes
      const changes: Record<string, { from: any; to: any }> = {};
      ['name', 'parentId'].forEach(field => {
        if (categoryUpdate[field] !== undefined && categoryUpdate[field] !== category[field]) {
          changes[field] = { from: category[field], to: categoryUpdate[field] };
        }
      });

      // Apply updates
      Object.assign(category, categoryUpdate);
      
      const updatedCategory = await this.categoryRepository.save(category);

      // Audit logging removed with authentication system

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
      0, // Active products - not applicable without isActive
      0, // Inactive products - not applicable without isActive,
      directProductsQuery.clone().andWhere('product.stockQuantity <= product.reorderLevel').getCount(),
      directProductsQuery.clone().andWhere('(product.stockQuantity - product.reservedQuantity) <= 0').getCount(),
    ]);

    // Get all descendants for total counts
    const descendants = await this.loadAllDescendants(category);
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
      path: category.path,
      level: category.level,
      parentId: category.parentId,
      fullPath: category.fullPath,
      isRoot: category.isRoot,
      hasChildren: category.hasChildren,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      ...(category.deletedAt && { deletedAt: category.deletedAt }),
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
   * Check for duplicate category names (including soft-deleted)
   */
  async checkDuplicate(params: {
    name?: string;
    parentId?: string;
    excludeId?: string;
  }): Promise<{
    nameExists: boolean;
    nameConflict?: {
      id: string;
      name: string;
      isDeleted: boolean;
      parentId?: string;
    };
  }> {
    this.logger.log(`Checking duplicate for category name: "${params.name}", parentId: "${params.parentId}"`);

    const result = {
      nameExists: false,
      nameConflict: undefined as any,
    };

    // Check name duplicate
    if (params.name && params.name.trim()) {
      const nameQuery = this.categoryRepository
        .createQueryBuilder('category')
        .where('LOWER(category.name) = LOWER(:name)', { name: params.name.trim() })
        .withDeleted();

      if (params.parentId) {
        nameQuery.andWhere('category.parentId = :parentId', { parentId: params.parentId });
      } else {
        nameQuery.andWhere('category.parentId IS NULL');
      }

      if (params.excludeId) {
        nameQuery.andWhere('category.id != :excludeId', { excludeId: params.excludeId });
      }

      const existingByName = await nameQuery.getOne();

      if (existingByName) {
        result.nameExists = true;
        result.nameConflict = {
          id: existingByName.id,
          name: existingByName.name,
          isDeleted: !!existingByName.deletedAt,
          parentId: existingByName.parentId,
        };
      }
    }

    this.logger.log(`Duplicate check result: nameExists=${result.nameExists}`);
    return result;
  }


  /**
   * Load category tree with all children recursively
   */
  private async loadCategoryTree(category: Category): Promise<Category> {
    const children = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.parentId = :parentId', { parentId: category.id })
      .orderBy('UPPER(category.name)', 'ASC')
      .getMany();

    if (children.length > 0) {
      const childrenWithSubchildren = await Promise.all(
        children.map(child => this.loadCategoryTree(child))
      );
      category.children = childrenWithSubchildren;
    } else {
      category.children = [];
    }

    return category;
  }

  /**
   * Load all ancestors of a category
   */
  private async loadAncestors(category: Category): Promise<Category[]> {
    const ancestors: Category[] = [];
    let currentCategory = category;

    while (currentCategory.parentId) {
      const parent = await this.categoryRepository.findOne({
        where: { id: currentCategory.parentId },
      });
      if (parent) {
        ancestors.unshift(parent); // Add to beginning
        currentCategory = parent;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Load all descendants of a category
   */
  private async loadAllDescendants(category: Category): Promise<Category[]> {
    const descendants: Category[] = [];
    
    const loadChildren = async (parentCategory: Category) => {
      const children = await this.categoryRepository.find({
        where: { parentId: parentCategory.id },
      });
      
      for (const child of children) {
        descendants.push(child);
        await loadChildren(child); // Recursive call
      }
    };

    await loadChildren(category);
    return descendants;
  }

  /**
   * Update levels and paths for all descendants after moving a category
   */
  private async updateDescendantLevelsAndPaths(category: Category): Promise<void> {
    const descendants = await this.loadAllDescendants(category);

    const updates = descendants.map(async (descendant) => {
      // Recalculate level and path
      const ancestors = await this.loadAncestors(descendant);
      descendant.level = ancestors.length;
      descendant.path = ancestors.length > 0
        ? `${ancestors.map(a => a.name).join('.')}.${descendant.name}`
        : descendant.name;

      return this.categoryRepository.save(descendant);
    });

    await Promise.all(updates);
  }

  /**
   * Move all products from a category to Uncategorized category
   */
  private async moveProductsToUncategorized(categoryId: string, userId?: string): Promise<number> {
    this.logger.log(`Moving products from category ${categoryId} to Uncategorized`);

    // Find or create "Uncategorized" category
    let uncategorizedCategory = await this.categoryRepository.findOne({
      where: { name: 'Uncategorized' },
      withDeleted: true // Include soft-deleted records
    });

    if (!uncategorizedCategory) {
      this.logger.log('Creating Uncategorized category');
      uncategorizedCategory = this.categoryRepository.create({
        name: 'Uncategorized',
        level: 0,
        path: 'Uncategorized',
        fullPath: 'Uncategorized',
        isRoot: true,
        parentId: null,
      });
      uncategorizedCategory = await this.categoryRepository.save(uncategorizedCategory);
      this.logger.log(`Created Uncategorized category with ID: ${uncategorizedCategory.id}`);
    } else if (uncategorizedCategory.deletedAt) {
      // Restore soft-deleted Uncategorized category
      this.logger.log(`Restoring soft-deleted Uncategorized category with ID: ${uncategorizedCategory.id}`);
      await this.categoryRepository.restore(uncategorizedCategory.id);
      // Update isActive to true since this project uses both soft delete approaches
      await this.categoryRepository.update(uncategorizedCategory.id, {
        isActive: true,
      });
      uncategorizedCategory = await this.categoryRepository.findOne({
        where: { id: uncategorizedCategory.id }
      });
      this.logger.log(`Restored Uncategorized category with ID: ${uncategorizedCategory.id}`);
    } else {
      this.logger.log(`Found existing active Uncategorized category with ID: ${uncategorizedCategory.id}`);
    }

    // Count products to be moved (both active and soft-deleted)
    const totalProductCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.categoryId = :categoryId', { categoryId })
      .withDeleted() // Include soft-deleted records
      .getCount();

    if (totalProductCount === 0) {
      this.logger.log('No products to move');
      return 0;
    }

    // Update all products (including soft-deleted ones) to reference the Uncategorized category
    this.logger.log(`Updating ${totalProductCount} products from category ${categoryId} to ${uncategorizedCategory.id}`);
    await this.productRepository.manager.query(
      'UPDATE products SET "categoryId" = $1, "updatedAt" = NOW() WHERE "categoryId" = $2',
      [uncategorizedCategory.id, categoryId]
    );

    // Verify the update worked
    const remainingCount = await this.productRepository.manager.query(
      'SELECT COUNT(*) as count FROM products WHERE "categoryId" = $1',
      [categoryId]
    );

    this.logger.log(`Products moved successfully. Remaining products in old category: ${remainingCount[0]?.count || 0}`);

    return totalProductCount;
  }
}
