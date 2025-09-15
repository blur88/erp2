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
  Like,
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

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>, // Changed from TreeRepository to Repository
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * Create a new category
   */
  async create(createCategoryDto: CreateCategoryDto, userId?: string): Promise<CategoryResponseDto> {
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
      sortOrder: createCategoryDto.sortOrder ?? 0,
    });

    const savedCategory = await this.categoryRepository.save(category);

    // Audit logging removed with authentication system

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
        '(category.name ILIKE :search)',
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


    // Apply hierarchical sorting
    const validSortFields = ['name', 'createdAt', 'sortOrder'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    
    // For hierarchical ordering, sort by path first (maintains parent-child relationships)
    // Use COALESCE to handle null paths and fall back to name
    queryBuilder.orderBy('COALESCE(category.path, category.name)', 'ASC');
    
    // Then sort by level to ensure proper nesting
    queryBuilder.addOrderBy('category.level', 'ASC');
    
    // Finally apply the requested sort within each level
    queryBuilder.addOrderBy(`category.${sortField}`, sortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [categories, total] = await queryBuilder.getManyAndCount();

    let data: CategoryResponseDto[] = [];

    if (includeTree && !parentId) {
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
   * Find all soft-deleted categories
   */
  async findDeleted(query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    this.logger.log('Fetching deleted categories with filters:', query);

    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
    } = query;

    // Use find method with withDeleted option to properly include soft-deleted records
    const where: any = {};

    if (search) {
      where.name = Like(`%${search}%`);
    }

    // Sorting
    const allowedSortFields = ['name', 'deletedAt', 'createdAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'deletedAt';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const skip = (page - 1) * limit;

    const [categories, total] = await this.categoryRepository.findAndCount({
      where,
      withDeleted: true,
      order: { [safeSortBy]: safeSortOrder },
      skip,
      take: limit,
    });

    // Filter only soft-deleted categories
    const deletedCategories = categories.filter(cat => cat.deletedAt !== null);
    const deletedTotal = await this.categoryRepository.count({
      where,
      withDeleted: true,
    }).then(count => 
      // We need to count manually since TypeORM doesn't filter in count
      this.categoryRepository.find({ where, withDeleted: true })
        .then(all => all.filter(cat => cat.deletedAt !== null).length)
    );

    const data = await Promise.all(
      deletedCategories.map(async (category) => 
        await this.toResponseDto(category, false, false)
      ),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total: deletedTotal,
        totalPages: Math.ceil(deletedTotal / limit),
        hasNextPage: page < Math.ceil(deletedTotal / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get complete category tree
   */
  async getTree(includeProductCount = false): Promise<CategoryTreeResponseDto> {
    try {
      // Get all root categories (level 0)
      const rootCategories = await this.categoryRepository.find({
        where: { level: 0 },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      
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
  async update(id: string, updateCategoryDto: UpdateCategoryDto, userId?: string): Promise<CategoryResponseDto> {
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

    // Audit logging removed with authentication system

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

    if (moveCategoryDto.sortOrder !== undefined) {
      category.sortOrder = moveCategoryDto.sortOrder;
    }

    const movedCategory = await this.categoryRepository.save(category);

    // Update levels and paths for all descendants
    await this.updateDescendantLevelsAndPaths(movedCategory);

    // Audit logging removed with authentication system

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
        await this.categoryRepository.restore(uncategorizedCategory.id);
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

    // Use soft delete
    await this.categoryRepository.save(category);
    await this.categoryRepository.softDelete(id);

    // Audit logging removed with authentication system

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
    await this.categoryRepository.restore(id);

    const restoredCategory = await this.categoryRepository.save(category);

    // Audit logging removed with authentication system

    this.logger.log(`Category restored successfully: ${restoredCategory.id}`);
    return this.toResponseDto(restoredCategory);
  }

  /**
   * Permanently delete a category from database
   */
  async permanentDelete(id: string, userId?: string): Promise<void> {
    this.logger.log(`Permanently deleting category with ID: ${id}`);
    
    // Find the category (including soft-deleted ones)
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['children', 'products'],
      withDeleted: true,
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    // Ensure category is already soft-deleted
    if (!category.deletedAt) {
      throw new BadRequestException(
        'Category must be soft-deleted first before permanent deletion. Use regular delete endpoint first.'
      );
    }

    // Check if category has any active dependencies that prevent permanent deletion
    if (category.children?.length > 0) {
      throw new BadRequestException(
        'Cannot permanently delete category that has subcategories'
      );
    }

    if (category.products?.length > 0) {
      throw new BadRequestException(
        'Cannot permanently delete category that has products assigned to it'
      );
    }

    // Perform the permanent deletion
    await this.categoryRepository.remove(category);

    // Audit logging removed with authentication system

    this.logger.log(`Category permanently deleted successfully: ${id}`);
  }

  /**
   * Bulk restore soft-deleted categories
   */
  async bulkRestore(categoryIds: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${categoryIds.length} categories`);

    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const categoryId of categoryIds) {
      try {
        const category = await this.categoryRepository.findOne({
          where: { id: categoryId },
          withDeleted: true,
        });

        if (!category) {
          this.logger.warn(`Category not found: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        if (!category.deletedAt) {
          this.logger.warn(`Category is not deleted: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        // Restore the category
        await this.categoryRepository.restore(categoryId);

        await this.categoryRepository.save(category);

        // Audit logging removed with authentication system

        restoredCount++;
        this.logger.log(`Category restored: ${categoryId}`);
      } catch (error) {
        this.logger.error(`Failed to restore category ${categoryId}: ${error.message}`);
        failedIds.push(categoryId);
      }
    }

    this.logger.log(`Bulk restore completed: ${restoredCount} restored, ${failedIds.length} failed`);
    return { restoredCount, failedIds };
  }

  /**
   * Bulk permanently delete categories from database
   */
  async bulkPermanentDelete(categoryIds: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${categoryIds.length} categories`);

    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const categoryId of categoryIds) {
      try {
        const category = await this.categoryRepository.findOne({
          where: { id: categoryId },
          relations: ['children', 'products'],
          withDeleted: true,
        });

        if (!category) {
          this.logger.warn(`Category not found: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        // Ensure category is already soft-deleted
        if (!category.deletedAt) {
          this.logger.warn(`Category must be soft-deleted first: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        // Check if category has any active dependencies
        if (category.children?.length > 0) {
          this.logger.warn(`Category has subcategories: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        if (category.products?.length > 0) {
          this.logger.warn(`Category has products: ${categoryId}`);
          failedIds.push(categoryId);
          continue;
        }

        // Perform the permanent deletion
        await this.categoryRepository.remove(category);

        // Audit logging removed with authentication system

        deletedCount++;
        this.logger.log(`Category permanently deleted: ${categoryId}`);
      } catch (error) {
        this.logger.error(`Failed to permanently delete category ${categoryId}: ${error.message}`);
        failedIds.push(categoryId);
      }
    }

    this.logger.log(`Bulk permanent delete completed: ${deletedCount} deleted, ${failedIds.length} failed`);
    return { deletedCount, failedIds };
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
      ['name', 'sortOrder', 'parentId'].forEach(field => {
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
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder,
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
   * Load category tree with all children recursively
   */
  private async loadCategoryTree(category: Category): Promise<Category> {
    const children = await this.categoryRepository.find({
      where: { parentId: category.id },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

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
}