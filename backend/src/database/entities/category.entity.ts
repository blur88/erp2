import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  // Tree,        // Temporarily disabled
  // TreeParent,  // Temporarily disabled
  // TreeChildren,// Temporarily disabled
} from 'typeorm';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Product } from './product.entity';

/**
 * Category entity for hierarchical product categorization
 * Supports tree structure for nested categories
 * Optimized with path materialization for better query performance
 */
@Entity('categories')
// @Tree('materialized-path') // Temporarily disabled due to TypeORM materialized path issues
@Index(['name', 'parentId'], { unique: true }) // Categories must be unique within same parent
@Index(['parentId'])
@Index(['path'])
@Index(['slug'], { unique: true })
export class Category extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Category name',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @Column({
    type: 'varchar',
    length: 140,
    comment: 'URL slug (unique)',
  })
  @IsString()
  slug: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Active/inactive business status (separate from soft-delete isActive)',
  })
  @IsOptional()
  isEnabled: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Category description (multiline)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Materialized path for tree structure (auto-managed)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9\-\.]*$/, { message: 'Path must contain only UUID characters, hyphens, and dots' })
  path?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Depth level in the tree (0 = root)',
  })
  @IsInt()
  @Min(0)
  level: number;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Parent category ID',
  })
  @IsOptional()
  parentId?: string;

  // Tree relationships (temporarily disabled due to TypeORM tree issues)
  // @TreeParent()
  @ManyToOne(() => Category, (category) => category.children, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Category;

  // @TreeChildren()
  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  // Product relationship
  @OneToMany(() => Product, (product) => product.category, {
    cascade: false,
  })
  products: Product[];

  // Computed properties
  /**
   * Check if this category is a root level category
   */
  get isRoot(): boolean {
    return this.level === 0;
  }

  /**
   * Check if this category has child categories
   */
  get hasChildren(): boolean {
    return this.children && this.children.length > 0;
  }

  /**
   * Get human-readable full path of the category hierarchy
   * @returns Formatted path string (e.g., "Electronics > Mobile Phones")
   */
  get fullPath(): string {
    if (this.path && typeof this.path === 'string') {
      const sanitizedPath = this.sanitizePath(this.path);
      return sanitizedPath
        .split('.')
        .filter(Boolean)
        .join(' > ');
    }
    return this.name || 'Unnamed Category';
  }

  // Helper methods
  /**
   * Get array of ancestor category IDs from the materialized path
   * @returns Array of UUID strings representing ancestor categories
   */
  getAncestors(): string[] {
    if (!this.path || typeof this.path !== 'string') return [];
    const sanitizedPath = this.sanitizePath(this.path);
    return sanitizedPath.split('.').filter(Boolean);
  }

  /**
   * Check if this category is a descendant of another category
   * @param categoryId UUID of the potential ancestor category
   * @returns True if this category is a descendant of the given category
   */
  isDescendantOf(categoryId: string): boolean {
    if (!categoryId || typeof categoryId !== 'string') return false;
    return this.getAncestors().includes(categoryId);
  }

  /**
   * Check if this category is an ancestor of another category
   * @param category The potential descendant category
   * @returns True if this category is an ancestor of the given category
   */
  isAncestorOf(category: Category): boolean {
    if (!category || !category.id) return false;
    return category.isDescendantOf(this.id);
  }

  /**
   * Sanitize path string to prevent path traversal attacks
   * @param path Raw path string
   * @returns Sanitized path string containing only valid UUID characters, hyphens, and dots
   */
  private sanitizePath(path: string): string {
    if (!path || typeof path !== 'string') return '';
    // Allow only UUID characters (a-f, 0-9), hyphens, and dots
    return path.replace(/[^a-f0-9\-\.]/gi, '');
  }
}