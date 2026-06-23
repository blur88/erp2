import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  // Tree,        // Temporarily disabled
  // TreeParent,  // Temporarily disabled
  // TreeChildren,// Temporarily disabled
} from 'typeorm';
import { randomUUID } from 'crypto';
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
import { generateBaseSlug } from '../../common/utils/slug.util';

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

  /**
   * Guarantee a non-null, unique slug on every insert path.
   * CategoryService.create() sets a clean, human-readable unique slug before
   * save; this hook only fires when slug is unset (direct repo inserts, test
   * fixtures), appending a short random suffix to avoid unique-index clashes.
   */
  @BeforeInsert()
  ensureSlug(): void {
    if (!this.slug) {
      const base = generateBaseSlug(this.name || 'category');
      this.slug = `${base}-${randomUUID().slice(0, 8)}`;
    }
  }

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
   * Human-readable full path requires DB/service context (ancestor names);
   * the entity alone only knows its own name. CategoryService.resolveFullPaths
   * builds the real ancestor path. This getter is a safe single-level fallback.
   */
  get fullPath(): string {
    return this.name || 'Unnamed Category';
  }
}
