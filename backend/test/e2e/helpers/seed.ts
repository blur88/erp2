import { DataSource } from 'typeorm';
import { User, UserRole, UserStatus } from '../../../src/database/entities/user.entity';
import { Category } from '../../../src/database/entities/category.entity';
import { Product } from '../../../src/database/entities/product.entity';
import { PaymentMethodEntity } from '../../../src/database/entities/payment-method.entity';
import * as bcrypt from 'bcrypt';

/**
 * Truncates all business tables in dependency order so any spec can start clean.
 * Uses CASCADE so FK chains are handled automatically.
 */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    TRUNCATE TABLE
      journal_entry_lines,
      journal_entries,
      invoices,
      payments,
      sales_order_items,
      sales_orders,
      vendor_payments,
      goods_received_note_items,
      goods_received_notes,
      purchase_order_items,
      purchase_orders,
      customers,
      suppliers,
      stock_movements,
      stock_adjustments,
      price_list_items,
      products,
      categories,
      refresh_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function seedAdmin(dataSource: DataSource): Promise<User> {
  const userRepo = dataSource.getRepository(User);
  const hashed = await bcrypt.hash('Admin@123!', 12);
  return userRepo.save(userRepo.create({
    username: 'admin',
    email: 'admin@test.com',
    password: hashed,
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    isActive: true,
    failedLoginAttempts: 0,
  }));
}

export async function seedCategory(dataSource: DataSource, name = 'Test Category'): Promise<Category> {
  const categoryRepo = dataSource.getRepository(Category);
  return categoryRepo.save(categoryRepo.create({ name, level: 0 }));
}

export async function seedProduct(
  dataSource: DataSource,
  categoryId: string,
  overrides: Partial<{ name: string; baseCost: number; stockQuantity: number }> = {},
): Promise<Product> {
  const productRepo = dataSource.getRepository(Product);
  return productRepo.save(productRepo.create({
    name: overrides.name ?? 'Test Product',
    categoryId,
    baseCost: overrides.baseCost ?? 100,
    stockQuantity: overrides.stockQuantity ?? 0,
    isActive: true,
  }));
}

export async function seedPaymentMethod(dataSource: DataSource): Promise<PaymentMethodEntity> {
  const pmRepo = dataSource.getRepository(PaymentMethodEntity);
  let pm = await pmRepo.findOne({ where: { code: 'CASH' } });
  if (!pm) {
    pm = await pmRepo.save(pmRepo.create({ code: 'CASH', name: 'Cash', requiresSettlement: false }));
  }
  return pm;
}

export async function seedDocumentNumberSettings(dataSource: DataSource): Promise<void> {
  const currentYY = new Date().getFullYear() % 100;
  const configs = [
    { documentName: 'Purchase Orders', prefix: 'PO', paddingDigits: 3 },
    { documentName: 'Goods Received', prefix: 'GRN', paddingDigits: 3 },
    { documentName: 'Vendor Payments', prefix: 'VP', paddingDigits: 3 },
    { documentName: 'Journal Entries', prefix: 'JE', paddingDigits: 4 },
  ];
  for (const cfg of configs) {
    await dataSource.query(
      `INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT ("documentName") DO NOTHING`,
      [cfg.documentName, cfg.prefix, cfg.paddingDigits, currentYY],
    );
  }
}
