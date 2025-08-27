import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Tree,
  TreeParent,
  TreeChildren,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Product } from './product.entity';

/**
 * Category entity for hierarchical product categorization
 * Supports tree structure for nested categories
 * Optimized with path materialization for better query performance
 */
@Entity('categories')
@Tree('materialized-path')
@Index(['name'], { unique: true })
@Index(['code'], { unique: true, where: 'code IS NOT NULL' })
@Index(['isActive'])
@Index(['parentId'])
@Index(['path'])
export class Category extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Category name',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    nullable: true,
    comment: 'Unique category code/SKU prefix',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Category description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Category image URL or path',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the category is active',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Display order for sorting',
  })
  @IsInt()
  @Min(0)
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Materialized path for tree structure (auto-managed)',
  })
  @IsOptional()
  @IsString()
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

  // Tree relationships
  @TreeParent()
  @ManyToOne(() => Category, (category) => category.children, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Category;

  @TreeChildren()
  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  // Product relationship
  @OneToMany(() => Product, (product) => product.category, {
    cascade: false,
  })
  products: Product[];

  // Computed properties
  get isRoot(): boolean {
    return this.level === 0;
  }

  get hasChildren(): boolean {
    return this.children && this.children.length > 0;
  }

  get fullPath(): string {
    if (this.path) {
      return this.path
        .split('.')
        .filter(Boolean)
        .join(' > ');
    }
    return this.name;
  }

  // Helper methods
  getAncestors(): string[] {
    if (!this.path) return [];
    return this.path.split('.').filter(Boolean);
  }

  isDescendantOf(categoryId: string): boolean {
    return this.getAncestors().includes(categoryId);
  }

  isAncestorOf(category: Category): boolean {
    return category.isDescendantOf(this.id);
  }
}