import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  // TreeRepository, // Temporarily disabled due to tree structure issues
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
import { generateBaseSlug } from '../../../common/utils/slug.util';
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
    return ['name', 'createdAt', 'updatedAt'];
  }

  private buildCategoryListQuery(query: QueryCategoriesDto) {
    let queryBuilder = this.categoryRepository
      .createQueryBuilder('category')
      .where('1=1');

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

    const slug = await this.generateUniqueSlug(createCategoryDto.name);

    // Create category
    const category = this.categoryRepository.create({
      ...createCategoryDto,
      slug,
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
    const fp = (await this.resolveFullPaths([savedCategory.id])).get(savedCategory.id) ?? savedCategory.name;
    return this.toResponseDto(savedCategory, false, false, fp);
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
    const queryBuilder = this.buildCategoryListQuery(query);

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
          return this.toResponseDto(categoryWithChildren, true, includeProductCount, categoryWithChildren.name);
        }),
      );
      data = treeData;
    } else {
      // Regular list view
      const fullPathMap = await this.resolveFullPaths(categories.map((c) => c.id));
      data = await Promise.all(
        categories.map((category) =>
          this.toResponseDto(category, false, includeProductCount, fullPathMap.get(category.id) ?? category.name),
        ),
      );
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
        hasNextPage: shouldPaginate ? page < Math.ceil(total / limit) : false,
        hasPreviousPage: shouldPaginate ? page > 1 : false,
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
          return this.toResponseDto(categoryWithChildren, true, includeProductCount, categoryWithChildren.name);
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

    const fp = (await this.resolveFullPaths([category.id])).get(category.id) ?? category.name;
    return this.toResponseDto(category, includeChildren, includeProductCount, fp);
  }

  async findBySlug(slug: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { slug },
      relations: { parent: true },
    });
    if (!category) {
      throw new NotFoundException(`Category with slug '${slug}' not found`);
    }
    const fp = (await this.resolveFullPaths([category.id])).get(category.id) ?? category.name;
    const response = await this.toResponseDto(category, false, true, fp);
    if (category.parent) {
      response.parent = {
        id: category.parent.id,
        name: category.parent.name,
        slug: category.parent.slug,
      };
    }
    return response;
  }

  async setEnabled(id: string, enabled: boolean): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }
    if (!enabled) {
      const enabledChildren = await this.categoryRepository.find({
        where: { parentId: id, isEnabled: true },
      });
      if (enabledChildren.length > 0) {
        const names = enabledChildren.map((c) => c.name).join(', ');
        throw new BadRequestException(
          `Cannot deactivate '${category.name}' while it has active subcategories: ${names}`,
        );
      }
    }
    category.isEnabled = enabled;
    const saved = await this.categoryRepository.save(category);
    const fp = (await this.resolveFullPaths([saved.id])).get(saved.id) ?? saved.name;
    return this.toResponseDto(saved, false, true, fp);
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
    
    const chain = [...ancestors, category];
    const fpMap = await this.resolveFullPaths(chain.map((c) => c.id));
    
    return {
      id: category.id,
      ancestors: await Promise.all(
        ancestors.map((a) => this.toResponseDto(a, false, false, fpMap.get(a.id) ?? a.name)),
      ),
      category: await this.toResponseDto(category, false, false, fpMap.get(category.id) ?? category.name),
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
    if (nameChanged) {
      category.slug = await this.generateUniqueSlug(updateCategoryDto.name!, id);
    }
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
    const fp = (await this.resolveFullPaths([updatedCategory.id])).get(updatedCategory.id) ?? updatedCategory.name;
    return this.toResponseDto(updatedCategory, false, false, fp);
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
      category.path = newParent.path
        ? `${newParent.path}.${category.name}`
        : `${newParent.name}.${category.name}`;
    } else {
      // Moving to root level
      category.parent = null;
      category.parentId = null;
      category.level = 0;
      category.path = category.name;
    }

    const movedCategory = await this.categoryRepository.save(category);

    // Update levels and paths for all descendants
    await this.updateDescendantLevelsAndPaths(movedCategory);

    // Audit logging removed with authentication system

    this.logger.log(`Category moved successfully: ${movedCategory.id}`);
    const fp = (await this.resolveFullPaths([movedCategory.id])).get(movedCategory.id) ?? movedCategory.name;
    return this.toResponseDto(movedCategory, false, false, fp);
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

    const fp = (await this.resolveFullPaths([category.id])).get(category.id) ?? category.name;

    return {
      id: category.id,
      name: category.name,
      fullPath: fp,
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
    includeChildren: boolean,
    includeProductCount: boolean,
    fullPath: string,
  ): Promise<CategoryResponseDto> {
    const response: CategoryResponseDto = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      isEnabled: category.isEnabled,
      description: category.description,
      level: category.level,
      parentId: category.parentId,
      fullPath,
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
      const selfPath = response.fullPath;
      response.children = await Promise.all(
        category.children.map((child) =>
          this.toResponseDto(child, includeChildren, includeProductCount, `${selfPath} > ${child.name}`),
        ),
      );
    }

    return response;
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = generateBaseSlug(name);
    let slug = base;
    let counter = 1;
    while (true) {
      const existing = await this.categoryRepository.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${counter++}`;
    }
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
        .where('LOWER(category.name) = LOWER(:name)', { name: params.name.trim() });

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
   * Resolve each given category id to its human-readable full path
   * ("Ancestor > ... > Self") using the real parent chain. The materialized
   * `path` column is NOT used — it is unreliable for display.
   */
  async resolveFullPaths(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return result;

    // Single bounded query: load every category's {id, name, parentId} into an
    // in-memory map, then walk ancestor chains without further DB round-trips.
    // Avoids the N×depth findOne fan-out a per-row parent-walk would cause.
    const all = await this.categoryRepository.find({
      select: { id: true, name: true, parentId: true },
    });
    const byId = new Map<string, Pick<Category, 'id' | 'name' | 'parentId'>>(
      all.map((c) => [c.id, c]),
    );

    for (const id of uniqueIds) {
      const names: string[] = [];
      const seen = new Set<string>();
      let current = byId.get(id);
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      if (names.length) result.set(id, names.join(' > '));
    }
    return result;
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
