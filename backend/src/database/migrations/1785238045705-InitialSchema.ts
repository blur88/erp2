import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785238045705 implements MigrationInterface {
    name = 'InitialSchema1785238045705'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_account_type_enum" AS ENUM('Asset', 'Liability', 'Equity', 'Income', 'Expense')`);
        await queryRunner.query(`CREATE TABLE "chart_of_account" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "code" character varying(20) NOT NULL, "name" character varying(120) NOT NULL, "type" "public"."chart_of_account_type_enum" NOT NULL, "parentId" uuid, "description" text, "createdBy" character varying(120), "isSystem" boolean NOT NULL DEFAULT false, "isPostable" boolean NOT NULL DEFAULT true, "openingBalance" numeric(18,4) NOT NULL DEFAULT '0', CONSTRAINT "PK_365a21e0767428d1ca45472f57c" PRIMARY KEY ("id")); COMMENT ON COLUMN "chart_of_account"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_de745245954d5662abfe10a466" ON "chart_of_account"  ("code") `);
        await queryRunner.query(`CREATE TABLE "accounting_settings" ("id" boolean NOT NULL DEFAULT true, "cashAccountId" uuid NOT NULL, "bankAccountId" uuid NOT NULL, "inventoryAccountId" uuid NOT NULL, "supplierDepositAccountId" uuid NOT NULL, "customerDepositAccountId" uuid NOT NULL, "openingBalanceEquityAccountId" uuid NOT NULL, "salesRevenueAccountId" uuid NOT NULL, "cogsAccountId" uuid NOT NULL, "defaultExpenseAccountId" uuid NOT NULL, CONSTRAINT "PK_25b7d2f4a7d4b10aa42422df298" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "code" character varying(20) NOT NULL, "name" character varying(100) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "useForPurchases" boolean NOT NULL DEFAULT true, "accountingChannel" character varying(4) NOT NULL DEFAULT 'BANK', CONSTRAINT "UQ_f8aad3eab194dfdae604ca11125" UNIQUE ("code"), CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY ("id")); COMMENT ON COLUMN "payment_methods"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "payment_methods"."code" IS 'Unique code e.g. CASH, TNG, SHOPEE'; COMMENT ON COLUMN "payment_methods"."name" IS 'Display name e.g. Touch n Go, Shopee'; COMMENT ON COLUMN "payment_methods"."sortOrder" IS 'Display order in dropdowns'; COMMENT ON COLUMN "payment_methods"."useForPurchases" IS 'Whether this method is used for purchase order payments'; COMMENT ON COLUMN "payment_methods"."accountingChannel" IS 'Accounting channel: CASH or BANK'`);
        await queryRunner.query(`CREATE INDEX "IDX_c6243f21a7c99c9558984c267e" ON "payment_methods"  ("isActive") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f8aad3eab194dfdae604ca1112" ON "payment_methods"  ("code") `);
        await queryRunner.query(`CREATE TABLE "expense_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "expenseId" uuid NOT NULL, "paymentMethodId" uuid NOT NULL, "paymentDate" date NOT NULL, "amount" numeric(18,4) NOT NULL, "reference" character varying(100), "sourcePaymentId" uuid, CONSTRAINT "PK_7cf2ee63bae4c852652405ad292" PRIMARY KEY ("id")); COMMENT ON COLUMN "expense_payments"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_26e0e019ef44a6751fefc53b2e" ON "expense_payments"  ("sourcePaymentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_777f83f5ffac50dde77a5bd4ec" ON "expense_payments"  ("paymentDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_34f8d735e63d4666142059af29" ON "expense_payments"  ("expenseId") `);
        await queryRunner.query(`CREATE TYPE "public"."expenses_documentstatus_enum" AS ENUM('DRAFT', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."expenses_paymentstatus_enum" AS ENUM('UNPAID', 'PARTIAL', 'PAID')`);
        await queryRunner.query(`CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "expenseNumber" character varying(30) NOT NULL, "expenseDate" date NOT NULL, "payee" character varying(200), "description" character varying(500) NOT NULL, "expenseAccountId" uuid NOT NULL, "totalAmount" numeric(18,4) NOT NULL, "paidAmount" numeric(18,4) NOT NULL DEFAULT '0.0000', "balance" numeric(18,4) NOT NULL, "documentStatus" "public"."expenses_documentstatus_enum" NOT NULL DEFAULT 'DRAFT', "paymentStatus" "public"."expenses_paymentstatus_enum" NOT NULL DEFAULT 'UNPAID', "notes" text, CONSTRAINT "UQ_57552c177da550b3271a2cfb646" UNIQUE ("expenseNumber"), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id")); COMMENT ON COLUMN "expenses"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_6fdf195686fae846af43f454b7" ON "expenses"  ("paymentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_02fb625b48131aa070a708916c" ON "expenses"  ("documentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_36d05d47bb0de4b4952fece892" ON "expenses"  ("expenseAccountId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f52fb01c27607bb74ba05abf16" ON "expenses"  ("expenseDate") `);
        await queryRunner.query(`CREATE TABLE "journal_entry_line" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "entryId" uuid NOT NULL, "accountId" uuid NOT NULL, "debit" numeric(18,4) NOT NULL DEFAULT '0', "credit" numeric(18,4) NOT NULL DEFAULT '0', CONSTRAINT "PK_432d39d19aab3111f4446c161ec" PRIMARY KEY ("id")); COMMENT ON COLUMN "journal_entry_line"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_77825e21d0e79de7fa546175ac" ON "journal_entry_line"  ("entryId") `);
        await queryRunner.query(`CREATE INDEX "IDX_13c69697d8aaa2300f46d37950" ON "journal_entry_line"  ("accountId") `);
        await queryRunner.query(`CREATE TYPE "public"."journal_entry_sourcetype_enum" AS ENUM('SALES_ORDER', 'PURCHASE_ORDER', 'STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'EXPENSE')`);
        await queryRunner.query(`CREATE TYPE "public"."journal_entry_postingtype_enum" AS ENUM('OPENING_BALANCE', 'SALES_PAYMENT', 'SALES_FULFILLMENT_REVENUE', 'SALES_FULFILLMENT_COGS', 'SALES_REFUND', 'PURCHASE_PAYMENT', 'PURCHASE_RECEIVE', 'PURCHASE_REFUND', 'STOCK_ADJUSTMENT', 'EXPENSE_PAYMENT', 'EXPENSE_REFUND')`);
        await queryRunner.query(`CREATE TABLE "journal_entry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "journalNo" character varying(40) NOT NULL, "createdBy" character varying(120), "entryDate" date NOT NULL, "sourceType" "public"."journal_entry_sourcetype_enum" NOT NULL, "sourceDocumentId" uuid, "sourceEventId" uuid, "sourceRef" character varying(60), "postingType" "public"."journal_entry_postingtype_enum" NOT NULL, "description" text, "reversalOfEntryId" uuid, CONSTRAINT "PK_69167f660c807d2aa178f0bd7e6" PRIMARY KEY ("id")); COMMENT ON COLUMN "journal_entry"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_028b8eead9971a021ec1e5744b" ON "journal_entry"  ("journalNo") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ca79e4fb545584a31cd41ea526" ON "journal_entry"  ("reversalOfEntryId") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "userId" character varying(100) NOT NULL, "username" character varying(255), "action" character varying(50) NOT NULL, "entityType" character varying(100) NOT NULL, "entityId" uuid, "description" text NOT NULL, "oldValues" jsonb, "newValues" jsonb, "ipAddress" character varying(45), "userAgent" text, "metadata" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")); COMMENT ON COLUMN "audit_logs"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON "audit_logs"  ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs"  ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f23279fad63453147a8efb46cf" ON "audit_logs"  ("entityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_01993ae76b293d3b866cc3a125" ON "audit_logs"  ("entityType") `);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs"  ("action") `);
        await queryRunner.query(`CREATE TABLE "backup_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "filename" character varying(255) NOT NULL, "filepath" character varying(500) NOT NULL, "backupType" character varying(20) NOT NULL DEFAULT 'manual', "status" character varying(20) NOT NULL DEFAULT 'in_progress', "size" bigint, "databases" text NOT NULL DEFAULT '', "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, "createdBy" character varying(100) NOT NULL DEFAULT 'system', "metadata" jsonb, "error" text, CONSTRAINT "PK_e4a327a96ae7cff4eae6db70fa5" PRIMARY KEY ("id")); COMMENT ON COLUMN "backup_logs"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_bb12067d5d0ba5ee841e5aefb8" ON "backup_logs"  ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_107b126397721c443ffee292b8" ON "backup_logs"  ("status") `);
        await queryRunner.query(`CREATE TABLE "backup_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "name" character varying(100) NOT NULL, "frequency" character varying(20) NOT NULL DEFAULT 'daily', "cronExpression" character varying(20), "time" character varying(5) NOT NULL DEFAULT '02:00', "dayOfWeek" integer, "dayOfMonth" integer, "databases" text NOT NULL DEFAULT 'postgresql,redis', "includeSettings" boolean NOT NULL DEFAULT true, "retentionDays" integer NOT NULL DEFAULT '30', "enabled" boolean NOT NULL DEFAULT false, "lastRunAt" TIMESTAMP, "nextRunAt" TIMESTAMP, "createdBy" character varying(100) NOT NULL DEFAULT 'system', "notifications" jsonb, CONSTRAINT "UQ_f51948f41861c1e5a769145ae69" UNIQUE ("name"), CONSTRAINT "PK_14429218ef83c8eae127050e2fa" PRIMARY KEY ("id")); COMMENT ON COLUMN "backup_schedules"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_143ccd21e172092cd54d7f266c" ON "backup_schedules"  ("isActive") `);
        await queryRunner.query(`CREATE TABLE "backup_retention_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "retentionDays" integer NOT NULL DEFAULT '30', "autoCleanupEnabled" boolean NOT NULL DEFAULT true, "cleanupTime" character varying(10) NOT NULL DEFAULT '02:00', "maximumBackupsToKeep" integer, "maximumTotalSize" bigint, CONSTRAINT "PK_37bef020a863ca26521b5afbb20" PRIMARY KEY ("id")); COMMENT ON COLUMN "backup_retention_settings"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "backup_retention_settings"."retentionDays" IS 'Number of days to retain backups before auto-cleanup (max 365)'; COMMENT ON COLUMN "backup_retention_settings"."autoCleanupEnabled" IS 'Enable automatic backup cleanup'; COMMENT ON COLUMN "backup_retention_settings"."cleanupTime" IS 'Time of day to run cleanup (HH:MM)'; COMMENT ON COLUMN "backup_retention_settings"."maximumBackupsToKeep" IS 'Maximum number of backups to keep (null for unlimited)'; COMMENT ON COLUMN "backup_retention_settings"."maximumTotalSize" IS 'Maximum total size of all backups in bytes (null for unlimited, max 104857600 bytes = 100MB)'`);
        await queryRunner.query(`CREATE TYPE "public"."stock_movements_movementtype_enum" AS ENUM('purchase_receipt', 'sales_return', 'sale_reversal', 'production_receipt', 'transfer_in', 'adjustment_increase', 'initial_stock', 'sale', 'purchase_return', 'production_consumption', 'transfer_out', 'adjustment_decrease', 'damage', 'expiry', 'theft', 'loss')`);
        await queryRunner.query(`CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "movementType" "public"."stock_movements_movementtype_enum" NOT NULL, "movementDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "quantity" numeric(15,4) NOT NULL, "previousBalance" numeric(15,4) NOT NULL, "newBalance" numeric(15,4) NOT NULL, "unitValue" numeric(15,4), "totalValue" numeric(15,4), "referenceType" character varying(50), "referenceId" uuid, "reason" text, "notes" text, "productId" uuid NOT NULL, CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id")); COMMENT ON COLUMN "stock_movements"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "stock_movements"."movementType" IS 'Type of stock movement'; COMMENT ON COLUMN "stock_movements"."movementDate" IS 'Date and time of movement'; COMMENT ON COLUMN "stock_movements"."quantity" IS 'Quantity moved (positive for inward, negative for outward)'; COMMENT ON COLUMN "stock_movements"."previousBalance" IS 'Stock quantity before this movement'; COMMENT ON COLUMN "stock_movements"."newBalance" IS 'Stock quantity after this movement'; COMMENT ON COLUMN "stock_movements"."unitValue" IS 'Unit cost/price at time of movement'; COMMENT ON COLUMN "stock_movements"."totalValue" IS 'Total value of this movement'; COMMENT ON COLUMN "stock_movements"."referenceType" IS 'Type of source document (sales_order, purchase_order, etc.)'; COMMENT ON COLUMN "stock_movements"."referenceId" IS 'ID of the source document'; COMMENT ON COLUMN "stock_movements"."reason" IS 'Reason or notes for this movement'; COMMENT ON COLUMN "stock_movements"."notes" IS 'Additional notes'; COMMENT ON COLUMN "stock_movements"."productId" IS 'Product ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_804c9e218b77e89e488b7fbfba" ON "stock_movements"  ("quantity") `);
        await queryRunner.query(`CREATE INDEX "IDX_17e3734d294fe84a440c9f304d" ON "stock_movements"  ("referenceType", "referenceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b9ab4db6fbe12384c8f7e6eb30" ON "stock_movements"  ("movementDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_591aca148f00fd61c720c81424" ON "stock_movements"  ("movementType") `);
        await queryRunner.query(`CREATE INDEX "IDX_a3acb59db67e977be45e382fc5" ON "stock_movements"  ("productId") `);
        await queryRunner.query(`CREATE TYPE "public"."sales_order_items_discounttype_enum" AS ENUM('percentage', 'amount')`);
        await queryRunner.query(`CREATE TABLE "sales_order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "lineNumber" integer NOT NULL, "quantity" integer NOT NULL, "unitPrice" numeric(15,4) NOT NULL, "discountType" "public"."sales_order_items_discounttype_enum" NOT NULL DEFAULT 'percentage', "discountPercent" numeric(5,2) NOT NULL DEFAULT '0', "discountAmount" numeric(15,4) NOT NULL DEFAULT '0', "totalAmount" numeric(15,4) NOT NULL DEFAULT '0', "unitCost" numeric(15,4) NOT NULL, "notes" text, "salesOrderId" uuid NOT NULL, "productId" uuid NOT NULL, CONSTRAINT "PK_a5f8d983ae4db44dcc923faf2ef" PRIMARY KEY ("id")); COMMENT ON COLUMN "sales_order_items"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "sales_order_items"."lineNumber" IS 'Line item sequence number within the order'; COMMENT ON COLUMN "sales_order_items"."quantity" IS 'Ordered quantity'; COMMENT ON COLUMN "sales_order_items"."unitPrice" IS 'Unit price at time of order'; COMMENT ON COLUMN "sales_order_items"."discountType" IS 'Type of discount: percentage or fixed amount'; COMMENT ON COLUMN "sales_order_items"."discountPercent" IS 'Line item discount percentage (0-100)'; COMMENT ON COLUMN "sales_order_items"."discountAmount" IS 'Line item discount amount (fixed amount or calculated from percentage)'; COMMENT ON COLUMN "sales_order_items"."totalAmount" IS 'Line item total amount (after discount)'; COMMENT ON COLUMN "sales_order_items"."unitCost" IS 'Product cost at time of order'; COMMENT ON COLUMN "sales_order_items"."notes" IS 'Special instructions for this item'; COMMENT ON COLUMN "sales_order_items"."salesOrderId" IS 'Sales order ID'; COMMENT ON COLUMN "sales_order_items"."productId" IS 'Product ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_95836cf122ca5a4eb2e40ea552" ON "sales_order_items"  ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6b67146a69ed5fe5fe7f3224d3" ON "sales_order_items"  ("salesOrderId") `);
        await queryRunner.query(`CREATE TABLE "sales_order_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salesOrderId" uuid NOT NULL, "paymentMethodId" uuid NOT NULL, "referenceNumber" character varying(100), "amount" numeric(15,4) NOT NULL, "paymentDate" date NOT NULL, "notes" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8aaf67ce330f15f10bbfe436f0d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5f7beb77e4898dc93207580976" ON "sales_order_payments"  ("paymentDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_25b96f4ab4eeffb86b4de31600" ON "sales_order_payments"  ("salesOrderId") `);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('completed', 'pending', 'failed', 'cancelled', 'refunded')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'completed', "paymentMethodId" uuid, "paymentDate" date NOT NULL, "amount" numeric(15,4) NOT NULL, "notes" text, "customerId" uuid NOT NULL, "salesOrderId" uuid, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")); COMMENT ON COLUMN "payments"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "payments"."status" IS 'Payment status'; COMMENT ON COLUMN "payments"."paymentMethodId" IS 'Payment method entity ID'; COMMENT ON COLUMN "payments"."paymentDate" IS 'Payment date'; COMMENT ON COLUMN "payments"."amount" IS 'Payment amount'; COMMENT ON COLUMN "payments"."notes" IS 'Payment notes or description'; COMMENT ON COLUMN "payments"."customerId" IS 'Customer ID'; COMMENT ON COLUMN "payments"."salesOrderId" IS 'Related sales order ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_cbe18cae039006a9c217d5a66a" ON "payments"  ("paymentMethodId") `);
        await queryRunner.query(`CREATE INDEX "IDX_27faf14e8959f0e40d7b722dc0" ON "payments"  ("paymentDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON "payments"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_101d241c3e9916b8795c438562" ON "payments"  ("salesOrderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_824be6feda5e655c49c4e0c534" ON "payments"  ("customerId") `);
        await queryRunner.query(`CREATE TYPE "public"."sales_orders_status_enum" AS ENUM('DRAFT', 'READY', 'FULFILLED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."sales_orders_paymentstatus_enum" AS ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID')`);
        await queryRunner.query(`CREATE TABLE "sales_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "orderNumber" character varying(30) NOT NULL, "orderDate" date NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'USD', "status" "public"."sales_orders_status_enum" NOT NULL DEFAULT 'DRAFT', "paymentStatus" "public"."sales_orders_paymentstatus_enum" NOT NULL DEFAULT 'UNPAID', "subtotal" numeric(15,4) NOT NULL DEFAULT '0', "shippingAmount" numeric(15,4) NOT NULL DEFAULT '0', "totalAmount" numeric(15,4) NOT NULL DEFAULT '0', "paidAmount" numeric(15,4) NOT NULL DEFAULT '0', "balanceDue" numeric(15,4) NOT NULL DEFAULT '0', "notes" text, "fulfilledAt" TIMESTAMP, "customerId" uuid NOT NULL, CONSTRAINT "UQ_ea901f7691ec7f314f072d9dee8" UNIQUE ("orderNumber"), CONSTRAINT "PK_5328297e067ca929fbe7cf989dd" PRIMARY KEY ("id")); COMMENT ON COLUMN "sales_orders"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "sales_orders"."fulfilledAt" IS 'Actual fulfillment timestamp (set when status -> FULFILLED)'`);
        await queryRunner.query(`CREATE INDEX "IDX_ae5e0306e55a3b695ea60c7b5f" ON "sales_orders"  ("paymentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_9af7d43703f16f9e51db693679" ON "sales_orders"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_fffc00bae87b600c1979dc0159" ON "sales_orders"  ("orderDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_9978ca165b4c0f27571f3d1d92" ON "sales_orders"  ("customerId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ea901f7691ec7f314f072d9dee" ON "sales_orders"  ("orderNumber") `);
        await queryRunner.query(`CREATE TYPE "public"."customers_type_enum" AS ENUM('individual', 'business')`);
        await queryRunner.query(`CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "type" "public"."customers_type_enum" NOT NULL DEFAULT 'individual', "name" character varying(200) NOT NULL, "slug" character varying(255), "phone" character varying(20), "email" character varying(255), "billingStreetAddress" character varying(255), "billingStreetAddress2" character varying(255), "billingCity" character varying(100), "billingState" character varying(100), "billingPostalCode" character varying(20), "billingCountry" character varying(100), "shippingStreetAddress" character varying(255), "shippingStreetAddress2" character varying(255), "shippingCity" character varying(100), "shippingState" character varying(100), "shippingPostalCode" character varying(20), "shippingCountry" character varying(100), "priceListId" uuid, "totalSales" numeric(15,4) NOT NULL DEFAULT '0', "totalOrders" integer NOT NULL DEFAULT '0', "lastPurchaseDate" TIMESTAMP WITH TIME ZONE, "firstPurchaseDate" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id")); COMMENT ON COLUMN "customers"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "customers"."type" IS 'Customer type (individual/business)'; COMMENT ON COLUMN "customers"."name" IS 'Customer name or business name'; COMMENT ON COLUMN "customers"."slug" IS 'URL-friendly identifier derived from name'; COMMENT ON COLUMN "customers"."phone" IS 'Primary phone number'; COMMENT ON COLUMN "customers"."email" IS 'Email address'; COMMENT ON COLUMN "customers"."billingStreetAddress" IS 'Billing street address line 1'; COMMENT ON COLUMN "customers"."billingStreetAddress2" IS 'Billing street address line 2'; COMMENT ON COLUMN "customers"."billingCity" IS 'Billing city'; COMMENT ON COLUMN "customers"."billingState" IS 'Billing state or province'; COMMENT ON COLUMN "customers"."billingPostalCode" IS 'Billing postal or ZIP code'; COMMENT ON COLUMN "customers"."billingCountry" IS 'Billing country'; COMMENT ON COLUMN "customers"."shippingStreetAddress" IS 'Shipping street address line 1'; COMMENT ON COLUMN "customers"."shippingStreetAddress2" IS 'Shipping street address line 2'; COMMENT ON COLUMN "customers"."shippingCity" IS 'Shipping city'; COMMENT ON COLUMN "customers"."shippingState" IS 'Shipping state or province'; COMMENT ON COLUMN "customers"."shippingPostalCode" IS 'Shipping postal or ZIP code'; COMMENT ON COLUMN "customers"."shippingCountry" IS 'Shipping country'; COMMENT ON COLUMN "customers"."priceListId" IS 'Foreign key to price_lists table'; COMMENT ON COLUMN "customers"."totalSales" IS 'Total sales amount to this customer'; COMMENT ON COLUMN "customers"."totalOrders" IS 'Total number of orders'; COMMENT ON COLUMN "customers"."lastPurchaseDate" IS 'Date of last purchase'; COMMENT ON COLUMN "customers"."firstPurchaseDate" IS 'Date of first purchase'; COMMENT ON COLUMN "customers"."notes" IS 'Internal notes about the customer'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_082b57a14467f4d6a19a41d483" ON "customers"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_40946e98ab87148f58703fa1c5" ON "customers"  ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_73ebdf90f8ae51734cddc69aec" ON "customers"  ("priceListId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd44f67433aadad2785aecd5be" ON "customers"  ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_88acd889fbe17d0e16cc4bc917" ON "customers"  ("phone") `);
        await queryRunner.query(`CREATE TABLE "price_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "description" text, "isDefault" boolean NOT NULL DEFAULT false, "effectiveFrom" date, "effectiveTo" date, "priority" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_de7a058bf061cbc078a74da8904" UNIQUE ("code"), CONSTRAINT "PK_fd66ee20b065696da25c97fa45a" PRIMARY KEY ("id")); COMMENT ON COLUMN "price_lists"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_000f630a35f803ec1024403ee3" ON "price_lists"  ("isDefault") `);
        await queryRunner.query(`CREATE INDEX "IDX_4770ad80432882ee086d7a638f" ON "price_lists"  ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_de7a058bf061cbc078a74da890" ON "price_lists"  ("code") `);
        await queryRunner.query(`CREATE TABLE "price_list_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "priceListId" uuid NOT NULL, "productId" uuid NOT NULL, "price" numeric(12,4) NOT NULL, "costBasis" numeric(12,4), "marginPercent" numeric(5,2), "minimumPrice" numeric(12,4), "effectiveFrom" date, "effectiveTo" date, CONSTRAINT "UQ_7aa4b6c9ab36d8ddc38caafcce4" UNIQUE ("priceListId", "productId"), CONSTRAINT "PK_cdb44449658589feac39de86695" PRIMARY KEY ("id")); COMMENT ON COLUMN "price_list_items"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_f4460b6ee8677a87247e107e2b" ON "price_list_items"  ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_97f080960141255e54eecb9bdb" ON "price_list_items"  ("priceListId") `);
        await queryRunner.query(`CREATE TYPE "public"."products_type_enum" AS ENUM('Stocked Product', 'Service')`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "name" character varying(200) NOT NULL, "slug" character varying(255), "description" text, "barcode" character varying(100), "type" "public"."products_type_enum" NOT NULL DEFAULT 'Stocked Product', "baseCost" numeric(15,4) NOT NULL, "stockQuantity" numeric(15,4) NOT NULL DEFAULT '0', "notes" text, "categoryId" uuid NOT NULL, CONSTRAINT "UQ_adfc522baf9d9b19cd7d9461b7e" UNIQUE ("barcode"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id")); COMMENT ON COLUMN "products"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "products"."name" IS 'Product name'; COMMENT ON COLUMN "products"."slug" IS 'URL-friendly identifier derived from name'; COMMENT ON COLUMN "products"."description" IS 'Detailed product description'; COMMENT ON COLUMN "products"."barcode" IS 'Product barcode - unique product identifier'; COMMENT ON COLUMN "products"."type" IS 'Product type (goods/service)'; COMMENT ON COLUMN "products"."baseCost" IS 'Base cost price'; COMMENT ON COLUMN "products"."stockQuantity" IS 'Current stock quantity'; COMMENT ON COLUMN "products"."notes" IS 'Internal notes about the product'; COMMENT ON COLUMN "products"."categoryId" IS 'Product category ID'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_464f927ae360106b783ed0b410" ON "products"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_ff39b9ac40872b2de41751eedc" ON "products"  ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_d5662d5ea5da62fc54b0f12a46" ON "products"  ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_ff56834e735fa78a15d0cf2192" ON "products"  ("categoryId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4c9fb58de893725258746385e1" ON "products"  ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_adfc522baf9d9b19cd7d9461b7" ON "products"  ("barcode") `);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "name" character varying(100) NOT NULL, "slug" character varying(140) NOT NULL, "isEnabled" boolean NOT NULL DEFAULT true, "description" text, "path" character varying(500), "level" integer NOT NULL DEFAULT '0', "parentId" uuid, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id")); COMMENT ON COLUMN "categories"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "categories"."name" IS 'Category name'; COMMENT ON COLUMN "categories"."slug" IS 'URL slug (unique)'; COMMENT ON COLUMN "categories"."isEnabled" IS 'Active/inactive business status (separate from soft-delete isActive)'; COMMENT ON COLUMN "categories"."description" IS 'Category description (multiline)'; COMMENT ON COLUMN "categories"."path" IS 'Materialized path for tree structure (auto-managed)'; COMMENT ON COLUMN "categories"."level" IS 'Depth level in the tree (0 = root)'; COMMENT ON COLUMN "categories"."parentId" IS 'Parent category ID'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0" ON "categories"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_ca4efcb2224db51459f018ee2e" ON "categories"  ("path") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a6f051e66982b5f0318981bca" ON "categories"  ("parentId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a1c9067a5e8b5aa4b5a9b357ec" ON "categories"  ("name", "parentId") `);
        await queryRunner.query(`CREATE TABLE "company_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "name" character varying(255) NOT NULL, "address" text NOT NULL, "city" character varying(100) NOT NULL, "state" character varying(100), "postalCode" character varying(20), "country" character varying(100) NOT NULL, "phone" character varying(50), "email" character varying(255), "website" character varying(255), "miscInfo" text, "logoUrl" character varying(500), CONSTRAINT "PK_036b4634217db79c17305442dbe" PRIMARY KEY ("id")); COMMENT ON COLUMN "company_settings"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE TABLE "document_number_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "documentName" character varying(50) NOT NULL, "prefix" character varying(10) NOT NULL, "paddingDigits" smallint NOT NULL DEFAULT '3', "nextNumber" integer NOT NULL DEFAULT '1', "lastResetYear" smallint NOT NULL, CONSTRAINT "UQ_87177891d3752f62710447bc072" UNIQUE ("documentName"), CONSTRAINT "PK_053dbfdfd309f3fbdf54d8a9a11" PRIMARY KEY ("id")); COMMENT ON COLUMN "document_number_settings"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_87177891d3752f62710447bc07" ON "document_number_settings"  ("documentName") `);
        await queryRunner.query(`CREATE TABLE "regional_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "currency" character varying(10) NOT NULL DEFAULT 'MYR', "costingMethod" character varying(50) NOT NULL DEFAULT 'AVERAGE', "dateFormat" character varying(20) NOT NULL DEFAULT 'DD/MM/YYYY', "timeFormat" character varying(10) NOT NULL DEFAULT '24h', "numberFormat" character varying(20) NOT NULL DEFAULT '1,234.56', "timezone" character varying(100) NOT NULL DEFAULT 'Asia/Kuala_Lumpur', "lowStockThreshold" integer NOT NULL DEFAULT '10', "startOfWeek" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_f6e6715c5542651fe579f0058cf" PRIMARY KEY ("id")); COMMENT ON COLUMN "regional_settings"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE TABLE "print_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "logoUrl" character varying(500), "companyName" character varying(255), "address" text, "city" character varying(100), "state" character varying(100), "postalCode" character varying(20), "country" character varying(100), "phone" character varying(50), "email" character varying(255), "website" character varying(255), "miscInfo" text, "salesPerPageFooter" text, "salesEndOfDocFooter" text, "purchasingPerPageFooter" text, "purchasingEndOfDocFooter" text, "inventoryPerPageFooter" text, "inventoryEndOfDocFooter" text, "reportPerPageFooter" text, "reportEndOfDocFooter" text, "salesOrderTemplate" jsonb, "invoiceTemplate" jsonb, "paymentReceiptTemplate" jsonb, "purchaseOrderTemplate" jsonb, "grnTemplate" jsonb, "vendorPaymentTemplate" jsonb, CONSTRAINT "PK_bcdd1972ac4884eb966f9756f38" PRIMARY KEY ("id")); COMMENT ON COLUMN "print_settings"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE TABLE "purchase_cost_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "productId" uuid NOT NULL, "purchaseOrderId" uuid, "unitCost" numeric(15,4) NOT NULL, "shippingPerUnit" numeric(15,4) NOT NULL DEFAULT '0', "landedCost" numeric(15,4) NOT NULL, "receivedQuantity" numeric(15,4) NOT NULL, "remainingQuantity" numeric(15,4) NOT NULL, "receivedDate" TIMESTAMP NOT NULL, CONSTRAINT "PK_b82957e1288fdf48a2857f14420" PRIMARY KEY ("id")); COMMENT ON COLUMN "purchase_cost_history"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "purchase_cost_history"."productId" IS 'Product ID'; COMMENT ON COLUMN "purchase_cost_history"."purchaseOrderId" IS 'Purchase order ID or special UUID for opening balance'; COMMENT ON COLUMN "purchase_cost_history"."unitCost" IS 'Purchase unit cost (excluding shipping)'; COMMENT ON COLUMN "purchase_cost_history"."shippingPerUnit" IS 'Allocated shipping cost per unit (BY VALUE)'; COMMENT ON COLUMN "purchase_cost_history"."landedCost" IS 'Total landed cost per unit (unitCost + shippingPerUnit)'; COMMENT ON COLUMN "purchase_cost_history"."receivedQuantity" IS 'Original quantity received'; COMMENT ON COLUMN "purchase_cost_history"."remainingQuantity" IS 'Current quantity remaining in stock (for weighted average)'; COMMENT ON COLUMN "purchase_cost_history"."receivedDate" IS 'Date goods were received'`);
        await queryRunner.query(`CREATE INDEX "IDX_fbb017b75d15fa15e821535ab2" ON "purchase_cost_history"  ("productId", "receivedDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_c929408ab43003b2a331322fb3" ON "purchase_cost_history"  ("productId", "remainingQuantity") `);
        await queryRunner.query(`CREATE TYPE "public"."suppliers_type_enum" AS ENUM('local', 'international')`);
        await queryRunner.query(`CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "type" "public"."suppliers_type_enum" NOT NULL DEFAULT 'local', "companyName" character varying(200) NOT NULL, "slug" character varying(255), "contactPerson" character varying(200), "phone" character varying(20), "email" character varying(255), "billingStreetAddress" character varying(255), "billingStreetAddress2" character varying(255), "billingCity" character varying(100), "billingState" character varying(100), "billingPostalCode" character varying(20), "billingCountry" character varying(100), "shippingStreetAddress" character varying(255), "shippingStreetAddress2" character varying(255), "shippingCity" character varying(100), "shippingState" character varying(100), "shippingPostalCode" character varying(20), "shippingCountry" character varying(100), "totalPurchases" numeric(15,4) NOT NULL DEFAULT '0', "totalOrders" integer NOT NULL DEFAULT '0', "lastPurchaseDate" TIMESTAMP WITH TIME ZONE, "firstPurchaseDate" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id")); COMMENT ON COLUMN "suppliers"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "suppliers"."type" IS 'Supplier type (local/international)'; COMMENT ON COLUMN "suppliers"."companyName" IS 'Supplier company name'; COMMENT ON COLUMN "suppliers"."slug" IS 'URL-friendly identifier derived from companyName'; COMMENT ON COLUMN "suppliers"."contactPerson" IS 'Contact person name'; COMMENT ON COLUMN "suppliers"."phone" IS 'Primary phone number'; COMMENT ON COLUMN "suppliers"."email" IS 'Email address'; COMMENT ON COLUMN "suppliers"."billingStreetAddress" IS 'Billing street address line 1'; COMMENT ON COLUMN "suppliers"."billingStreetAddress2" IS 'Billing street address line 2'; COMMENT ON COLUMN "suppliers"."billingCity" IS 'Billing city'; COMMENT ON COLUMN "suppliers"."billingState" IS 'Billing state or province'; COMMENT ON COLUMN "suppliers"."billingPostalCode" IS 'Billing postal or ZIP code'; COMMENT ON COLUMN "suppliers"."billingCountry" IS 'Billing country'; COMMENT ON COLUMN "suppliers"."shippingStreetAddress" IS 'Shipping street address line 1'; COMMENT ON COLUMN "suppliers"."shippingStreetAddress2" IS 'Shipping street address line 2'; COMMENT ON COLUMN "suppliers"."shippingCity" IS 'Shipping city'; COMMENT ON COLUMN "suppliers"."shippingState" IS 'Shipping state or province'; COMMENT ON COLUMN "suppliers"."shippingPostalCode" IS 'Shipping postal or ZIP code'; COMMENT ON COLUMN "suppliers"."shippingCountry" IS 'Shipping country'; COMMENT ON COLUMN "suppliers"."totalPurchases" IS 'Total purchase amount from this supplier'; COMMENT ON COLUMN "suppliers"."totalOrders" IS 'Total number of purchase orders'; COMMENT ON COLUMN "suppliers"."lastPurchaseDate" IS 'Date of last purchase'; COMMENT ON COLUMN "suppliers"."firstPurchaseDate" IS 'Date of first purchase'; COMMENT ON COLUMN "suppliers"."notes" IS 'Internal notes about the supplier'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2ab512720a1b9de8624a3dcf20" ON "suppliers"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_876c06b5396f3c4acb7144ca92" ON "suppliers"  ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_73ea4840fc9114a341502b5054" ON "suppliers"  ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_ef7f8f1699296ab0bfabc5fd48" ON "suppliers"  ("phone") `);
        await queryRunner.query(`CREATE TYPE "public"."purchase_order_items_status_enum" AS ENUM('pending', 'approved', 'ordered', 'partially_received', 'received', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "purchase_order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "lineNumber" integer NOT NULL, "status" "public"."purchase_order_items_status_enum" NOT NULL DEFAULT 'pending', "quantity" numeric(15,4) NOT NULL, "receivedQuantity" numeric(15,4) NOT NULL DEFAULT '0', "unitCost" numeric(15,4) NOT NULL, "discountType" character varying(20) NOT NULL DEFAULT 'percentage', "discountPercent" numeric(5,2) NOT NULL DEFAULT '0', "discountAmount" numeric(15,4) NOT NULL DEFAULT '0', "totalAmount" numeric(15,4) NOT NULL DEFAULT '0', "purchaseOrderId" uuid NOT NULL, "productId" uuid NOT NULL, CONSTRAINT "PK_e8b7568d25c41e3290db596b312" PRIMARY KEY ("id")); COMMENT ON COLUMN "purchase_order_items"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "purchase_order_items"."lineNumber" IS 'Line item sequence number within the order'; COMMENT ON COLUMN "purchase_order_items"."status" IS 'Item status'; COMMENT ON COLUMN "purchase_order_items"."quantity" IS 'Ordered quantity'; COMMENT ON COLUMN "purchase_order_items"."receivedQuantity" IS 'Received quantity so far'; COMMENT ON COLUMN "purchase_order_items"."unitCost" IS 'Unit cost price'; COMMENT ON COLUMN "purchase_order_items"."discountType" IS 'Discount type: percentage or fixed_amount'; COMMENT ON COLUMN "purchase_order_items"."discountPercent" IS 'Line item discount percentage'; COMMENT ON COLUMN "purchase_order_items"."discountAmount" IS 'Line item discount amount (total for all units or per-unit based on discountType)'; COMMENT ON COLUMN "purchase_order_items"."totalAmount" IS 'Line item total amount (after discount)'; COMMENT ON COLUMN "purchase_order_items"."purchaseOrderId" IS 'Purchase order ID'; COMMENT ON COLUMN "purchase_order_items"."productId" IS 'Product ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_1b086ceed97e71200cdfd8a9de" ON "purchase_order_items"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_f87b1b82a3aff16d1cb5e49a65" ON "purchase_order_items"  ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1de7eb246940b05765d2c99a7e" ON "purchase_order_items"  ("purchaseOrderId") `);
        await queryRunner.query(`CREATE TABLE "vendor_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "supplierId" uuid NOT NULL, "purchaseOrderId" uuid, "amount" numeric(12,4) NOT NULL DEFAULT '0', "paymentDate" date NOT NULL, "paymentMethodId" uuid, "referenceNumber" character varying(100), "notes" text, "status" character varying(20) NOT NULL DEFAULT 'pending', CONSTRAINT "PK_90ac4c49a72f71adc03762add2d" PRIMARY KEY ("id")); COMMENT ON COLUMN "vendor_payments"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_f1d44769daeb2f0c001f640e89" ON "vendor_payments"  ("paymentDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_7fb50d0b66a6167f82314895f5" ON "vendor_payments"  ("supplierId", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."purchase_orders_status_enum" AS ENUM('DRAFT', 'READY', 'RECEIVED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."purchase_orders_paymentstatus_enum" AS ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID')`);
        await queryRunner.query(`CREATE TABLE "purchase_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "orderNumber" character varying(30) NOT NULL, "orderDate" date NOT NULL, "receivedDate" date, "subtotal" numeric(15,4) NOT NULL DEFAULT '0', "discountPercent" numeric(5,2) NOT NULL DEFAULT '0', "discountAmount" numeric(15,4) NOT NULL DEFAULT '0', "shippingAmount" numeric(15,4) NOT NULL DEFAULT '0', "totalAmount" numeric(15,4) NOT NULL DEFAULT '0', "paidAmount" numeric(15,4) NOT NULL DEFAULT '0', "status" "public"."purchase_orders_status_enum" NOT NULL DEFAULT 'DRAFT', "paymentStatus" "public"."purchase_orders_paymentstatus_enum" NOT NULL DEFAULT 'UNPAID', "notes" text, "supplierId" uuid NOT NULL, CONSTRAINT "UQ_0a4ef1738b13da938b62393dc04" UNIQUE ("orderNumber"), CONSTRAINT "PK_05148947415204a897e8beb2553" PRIMARY KEY ("id")); COMMENT ON COLUMN "purchase_orders"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "purchase_orders"."orderNumber" IS 'Unique purchase order number'; COMMENT ON COLUMN "purchase_orders"."orderDate" IS 'Purchase order date'; COMMENT ON COLUMN "purchase_orders"."receivedDate" IS 'Date goods were received (set on RECEIVED transition)'; COMMENT ON COLUMN "purchase_orders"."subtotal" IS 'Subtotal amount (before tax and discounts)'; COMMENT ON COLUMN "purchase_orders"."discountPercent" IS 'Discount percentage'; COMMENT ON COLUMN "purchase_orders"."discountAmount" IS 'Discount amount'; COMMENT ON COLUMN "purchase_orders"."shippingAmount" IS 'Shipping/freight charges'; COMMENT ON COLUMN "purchase_orders"."totalAmount" IS 'Total order amount'; COMMENT ON COLUMN "purchase_orders"."paidAmount" IS 'Total amount paid'; COMMENT ON COLUMN "purchase_orders"."status" IS 'Purchase order lifecycle status'; COMMENT ON COLUMN "purchase_orders"."paymentStatus" IS 'Derived payment status'; COMMENT ON COLUMN "purchase_orders"."notes" IS 'Special instructions or notes'; COMMENT ON COLUMN "purchase_orders"."supplierId" IS 'Supplier ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_628fbe62ebdd5309e3466f5013" ON "purchase_orders"  ("paymentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_5272ac3aa931eedb14cd8789d6" ON "purchase_orders"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_8be43e7dd0ae89d236418c690c" ON "purchase_orders"  ("orderDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_0c3ff892a9f2ed16f59d31ccca" ON "purchase_orders"  ("supplierId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0a4ef1738b13da938b62393dc0" ON "purchase_orders"  ("orderNumber") `);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "username" character varying(50) NOT NULL, "email" character varying(100), "password" character varying(255) NOT NULL, "firstName" character varying(100), "lastName" character varying(100), "phoneNumber" character varying(20), "role" "public"."users_role_enum" NOT NULL DEFAULT 'sales_staff', "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "lastLoginAt" TIMESTAMP WITH TIME ZONE, "lastLoginIp" character varying(45), "failedLoginAttempts" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP WITH TIME ZONE, "notes" text, "requiresPasswordChange" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")); COMMENT ON COLUMN "users"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "users"."username" IS 'Unique username for login'; COMMENT ON COLUMN "users"."email" IS 'User email address'; COMMENT ON COLUMN "users"."password" IS 'Hashed password'; COMMENT ON COLUMN "users"."firstName" IS 'User first name'; COMMENT ON COLUMN "users"."lastName" IS 'User last name'; COMMENT ON COLUMN "users"."phoneNumber" IS 'User phone number'; COMMENT ON COLUMN "users"."role" IS 'User role for access control'; COMMENT ON COLUMN "users"."status" IS 'User account status'; COMMENT ON COLUMN "users"."lastLoginAt" IS 'Last login timestamp'; COMMENT ON COLUMN "users"."lastLoginIp" IS 'Last login IP address'; COMMENT ON COLUMN "users"."failedLoginAttempts" IS 'Number of failed login attempts'; COMMENT ON COLUMN "users"."lockedUntil" IS 'Account locked until this timestamp'; COMMENT ON COLUMN "users"."notes" IS 'User profile notes or description'; COMMENT ON COLUMN "users"."requiresPasswordChange" IS 'Whether user must change password before accessing app'`);
        await queryRunner.query(`CREATE INDEX "IDX_994af44e59f0a97eb2e21a5f66" ON "users"  ("isActive", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_d6ee2d4bf901675877bb94977c" ON "users"  ("role", "status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users"  ("username") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "tokenHash" character varying(255) NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "deviceInfo" text, "ipAddress" character varying(45), CONSTRAINT "UQ_c25bc63d248ca90e8dcc1d92d06" UNIQUE ("tokenHash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")); COMMENT ON COLUMN "refresh_tokens"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "refresh_tokens"."tokenHash" IS 'SHA-256 hash of the refresh token'; COMMENT ON COLUMN "refresh_tokens"."userId" IS 'Foreign key to users table'; COMMENT ON COLUMN "refresh_tokens"."expiresAt" IS 'Token expiration timestamp'; COMMENT ON COLUMN "refresh_tokens"."deviceInfo" IS 'Device user agent for audit tracking'; COMMENT ON COLUMN "refresh_tokens"."ipAddress" IS 'IP address for audit tracking'`);
        await queryRunner.query(`CREATE INDEX "IDX_56b91d98f71e3d1b649ed6e9f3" ON "refresh_tokens"  ("expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens"  ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens"  ("tokenHash") `);
        await queryRunner.query(`CREATE TABLE "search_queries" ("id" uuid NOT NULL, "query" character varying(500) NOT NULL, "user_id" uuid NOT NULL, "result_count" integer NOT NULL, "execution_time_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2945172d2d9a9f6b2339dd036e7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4981129d48833f45cc3e70f06b" ON "search_queries"  ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_b3f9a7099bd43b431de8e95dca" ON "search_queries"  ("result_count", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_65121ce59bf1c4494a6dba198f" ON "search_queries"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "search_clicks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "search_query_id" uuid, "query" character varying(500) NOT NULL, "result_type" character varying(100) NOT NULL, "result_id" character varying(255) NOT NULL, "result_label" character varying(255), "position" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_93b47d43bd22156a7208dcc8a3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2ccac1b7ddd1b101f17845a6ce" ON "search_clicks"  ("search_query_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_8dc36f8afc4975f27074d0bf5c" ON "search_clicks"  ("created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."stock_adjustments_status_enum" AS ENUM('draft', 'completed', 'reverted')`);
        await queryRunner.query(`CREATE TABLE "stock_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "adjustmentNumber" character varying(50) NOT NULL, "adjustmentDate" date NOT NULL, "status" "public"."stock_adjustments_status_enum" NOT NULL DEFAULT 'draft', "notes" text, "itemCount" integer NOT NULL DEFAULT '0', "totalValue" numeric(15,4) NOT NULL DEFAULT '0', CONSTRAINT "UQ_043a83d3e28667389c00b71a22c" UNIQUE ("adjustmentNumber"), CONSTRAINT "PK_7dc03d92f242dd489d33b80d063" PRIMARY KEY ("id")); COMMENT ON COLUMN "stock_adjustments"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "stock_adjustments"."adjustmentNumber" IS 'Stock adjustment number (SA-XXXXXX)'; COMMENT ON COLUMN "stock_adjustments"."adjustmentDate" IS 'Date of adjustment (calendar date, no time component)'; COMMENT ON COLUMN "stock_adjustments"."status" IS 'Adjustment status'; COMMENT ON COLUMN "stock_adjustments"."notes" IS 'Adjustment notes/reason'; COMMENT ON COLUMN "stock_adjustments"."itemCount" IS 'Number of line items'; COMMENT ON COLUMN "stock_adjustments"."totalValue" IS 'Total adjustment value (absolute sum)'`);
        await queryRunner.query(`CREATE INDEX "IDX_2717eb052d24c9623498b7e8a1" ON "stock_adjustments"  ("adjustmentDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_45080b47646b52ab371e4bf001" ON "stock_adjustments"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_043a83d3e28667389c00b71a22" ON "stock_adjustments"  ("adjustmentNumber") `);
        await queryRunner.query(`CREATE TABLE "stock_adjustment_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "stockAdjustmentId" uuid NOT NULL, "productId" uuid NOT NULL, "oldQuantity" numeric(15,4) NOT NULL, "newQuantity" numeric(15,4) NOT NULL, "difference" numeric(15,4) NOT NULL, "unitCost" numeric(15,4), "totalValue" numeric(15,4), "notes" text, CONSTRAINT "PK_428a603db1761a92d021d00f65f" PRIMARY KEY ("id")); COMMENT ON COLUMN "stock_adjustment_items"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "stock_adjustment_items"."stockAdjustmentId" IS 'Stock adjustment header ID'; COMMENT ON COLUMN "stock_adjustment_items"."productId" IS 'Product ID'; COMMENT ON COLUMN "stock_adjustment_items"."oldQuantity" IS 'Quantity before adjustment'; COMMENT ON COLUMN "stock_adjustment_items"."newQuantity" IS 'Quantity after adjustment'; COMMENT ON COLUMN "stock_adjustment_items"."difference" IS 'Difference (newQuantity - oldQuantity)'; COMMENT ON COLUMN "stock_adjustment_items"."unitCost" IS 'Unit cost at time of adjustment'; COMMENT ON COLUMN "stock_adjustment_items"."totalValue" IS 'Total value of this line (absolute difference * unit cost)'; COMMENT ON COLUMN "stock_adjustment_items"."notes" IS 'Reason for this specific item adjustment'`);
        await queryRunner.query(`CREATE INDEX "IDX_89f7d0e12b07146088771d9292" ON "stock_adjustment_items"  ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a23bf8737a4dd516f5736376e9" ON "stock_adjustment_items"  ("stockAdjustmentId") `);
        await queryRunner.query(`ALTER TABLE "chart_of_account" ADD CONSTRAINT "FK_18b0dec274845ee97da2a96ab49" FOREIGN KEY ("parentId") REFERENCES "chart_of_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_34f8d735e63d4666142059af296" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_94bee561eb464b4c15aa22a5c9a" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_26e0e019ef44a6751fefc53b2ef" FOREIGN KEY ("sourcePaymentId") REFERENCES "expense_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_36d05d47bb0de4b4952fece8927" FOREIGN KEY ("expenseAccountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "journal_entry_line" ADD CONSTRAINT "FK_77825e21d0e79de7fa546175ac3" FOREIGN KEY ("entryId") REFERENCES "journal_entry"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "journal_entry_line" ADD CONSTRAINT "FK_13c69697d8aaa2300f46d37950b" FOREIGN KEY ("accountId") REFERENCES "chart_of_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "journal_entry" ADD CONSTRAINT "FK_ca79e4fb545584a31cd41ea5268" FOREIGN KEY ("reversalOfEntryId") REFERENCES "journal_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD CONSTRAINT "FK_6b67146a69ed5fe5fe7f3224d31" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD CONSTRAINT "FK_95836cf122ca5a4eb2e40ea552c" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales_order_payments" ADD CONSTRAINT "FK_25b96f4ab4eeffb86b4de316008" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales_order_payments" ADD CONSTRAINT "FK_899dbc4613d051b78326ab2a2a6" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_824be6feda5e655c49c4e0c534b" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_101d241c3e9916b8795c4385622" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_cbe18cae039006a9c217d5a66a6" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD CONSTRAINT "FK_9978ca165b4c0f27571f3d1d924" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "FK_73ebdf90f8ae51734cddc69aec7" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "price_list_items" ADD CONSTRAINT "FK_97f080960141255e54eecb9bdbd" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "price_list_items" ADD CONSTRAINT "FK_f4460b6ee8677a87247e107e2b7" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_a200937c3bef6072ce44d760fe3" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD CONSTRAINT "FK_1de7eb246940b05765d2c99a7ec" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD CONSTRAINT "FK_f87b1b82a3aff16d1cb5e49a656" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_10e453c3de2d44d36c05fa3a531" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_4336c8e492b1a628c00c89345c9" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_9984b82043c7026cd378db66947" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_0c3ff892a9f2ed16f59d31cccae" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "search_clicks" ADD CONSTRAINT "FK_2ccac1b7ddd1b101f17845a6ced" FOREIGN KEY ("search_query_id") REFERENCES "search_queries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "FK_a23bf8737a4dd516f5736376e90" FOREIGN KEY ("stockAdjustmentId") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "FK_89f7d0e12b07146088771d9292a" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // ---- Canonical seed data -------------------------------------------
        // Values are fixed literals: migrations must be deterministic, so no
        // new Date() anywhere. lastResetYear is -1, an unambiguous non-year
        // sentinel; settings.service.ts:389 tests `lastResetYear !== currentYY`,
        // so the first document issued in any year triggers the annual reset and
        // writes the true year.
        await queryRunner.query(`
      INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
      VALUES
        ('Sales Orders',     'SO',  3, 1, -1),
        ('Purchase Orders',  'PO',  3, 1, -1),
        ('Stock Adjustment', 'SA',  3, 1, -1),
        ('Expenses',         'EXP', 3, 1, -1),
        ('Journal Entries',  'JE',  3, 1, -1)
    `);

        // requiresSettlement is deliberately absent: RemoveAccountingModule
        // (#884) dropped that column and the v1 rebuild never restored it.
        await queryRunner.query(`
      INSERT INTO "payment_methods"
        ("code", "name", "sortOrder", "useForPurchases", "accountingChannel")
      VALUES
        ('CASH',   'Cash',          1, true, 'CASH'),
        ('BANK',   'Bank Transfer', 2, true, 'BANK'),
        ('TNG',    'Touch n Go',    3, true, 'BANK'),
        ('CC',     'Credit Card',   4, true, 'BANK'),
        ('ATOME',  'Atome',         5, true, 'BANK'),
        ('SHOPEE', 'Shopee',        6, true, 'BANK'),
        ('TIKTOK', 'TikTok',        7, true, 'BANK')
    `);

        // Chart of accounts and settings wiring are FROZEN local constants.
        //
        // Deliberately NOT imported from src/modules/accounting/data/standard-coa.ts:
        // a migration must describe a fixed historical change. If it read live
        // application constants, editing those constants later would silently
        // change what a fresh database receives while already-migrated databases
        // kept the old data — divergence with no migration recording it. Changing
        // the seeded chart of accounts must require a NEW migration.
        //
        // standard-coa.spec.ts compares this frozen dataset against the current
        // constants, so a drift between them fails the build.
        //
        // Type is passed as text; Postgres coerces it to the generated enum type,
        // so this does not hardcode the enum type name.
        const COA_GROUPS: Array<[string, string, string]> = [
          ['1000', 'Assets', 'Asset'],
          ['2000', 'Liabilities', 'Liability'],
          ['3000', 'Equity', 'Equity'],
          ['4000', 'Income', 'Income'],
          ['5000', 'Cost of Sales', 'Expense'],
          ['6000', 'Expenses', 'Expense'],
        ];

        const COA_CHILDREN: Array<[string, string, string, string]> = [
          ['1100', 'Cash', 'Asset', '1000'],
          ['1200', 'Bank', 'Asset', '1000'],
          ['1300', 'Inventory', 'Asset', '1000'],
          ['1400', 'Supplier Deposit', 'Asset', '1000'],
          ['2100', 'Customer Deposit', 'Liability', '2000'],
          ['3100', 'Owner Capital', 'Equity', '3000'],
          ['3200', 'Opening Balance Equity', 'Equity', '3000'],
          ['4100', 'Sales Revenue', 'Income', '4000'],
          ['5100', 'Cost of Goods Sold', 'Expense', '5000'],
          ['6990', 'Other Expenses', 'Expense', '6000'],
        ];

        // settings column -> COA code. Frozen for the same reason.
        const SETTINGS_ACCOUNTS: Array<[string, string]> = [
          ['cashAccountId', '1100'],
          ['bankAccountId', '1200'],
          ['inventoryAccountId', '1300'],
          ['supplierDepositAccountId', '1400'],
          ['customerDepositAccountId', '2100'],
          ['openingBalanceEquityAccountId', '3200'],
          ['salesRevenueAccountId', '4100'],
          ['cogsAccountId', '5100'],
          ['defaultExpenseAccountId', '6990'],
        ];

        for (const [code, name, type] of COA_GROUPS) {
          await queryRunner.query(
            `INSERT INTO "chart_of_account" ("code", "name", "type", "isSystem", "isPostable")
         VALUES ($1, $2, $3, true, false)`,
            [code, name, type],
          );
        }

        for (const [code, name, type, parentCode] of COA_CHILDREN) {
          await queryRunner.query(
            `INSERT INTO "chart_of_account"
           ("code", "name", "type", "parentId", "isSystem", "isPostable")
         VALUES ($1, $2, $3,
                 (SELECT id FROM chart_of_account WHERE code = $4), true, true)`,
            [code, name, type, parentCode],
          );
        }

        await queryRunner.query(`
      INSERT INTO "accounting_settings" ("id", ${SETTINGS_ACCOUNTS.map(
        ([col]) => `"${col}"`,
      ).join(', ')})
      SELECT true, ${SETTINGS_ACCOUNTS.map(
        ([, code]) =>
          `(SELECT id FROM chart_of_account WHERE code='${code}')`,
      ).join(', ')}
    `);

        // regional_settings is the only singleton with meaningful entity defaults.
        // company_settings and print_settings are deliberately NOT seeded: their
        // services create the row on first read (settings.service.ts:58,
        // print-settings.service.ts:25), and company_settings' NOT NULL columns
        // would force duplicating the service's placeholder strings here.
        await queryRunner.query(`
      INSERT INTO "regional_settings"
        ("currency", "costingMethod", "dateFormat", "timeFormat",
         "numberFormat", "timezone", "lowStockThreshold", "startOfWeek")
      VALUES ('MYR', 'AVERAGE', 'DD/MM/YYYY', '24h', '1,234.56',
              'Asia/Kuala_Lumpur', 10, 1)
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_89f7d0e12b07146088771d9292a"`);
        await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_a23bf8737a4dd516f5736376e90"`);
        await queryRunner.query(`ALTER TABLE "search_clicks" DROP CONSTRAINT "FK_2ccac1b7ddd1b101f17845a6ced"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_0c3ff892a9f2ed16f59d31cccae"`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" DROP CONSTRAINT "FK_9984b82043c7026cd378db66947"`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" DROP CONSTRAINT "FK_4336c8e492b1a628c00c89345c9"`);
        await queryRunner.query(`ALTER TABLE "vendor_payments" DROP CONSTRAINT "FK_10e453c3de2d44d36c05fa3a531"`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP CONSTRAINT "FK_f87b1b82a3aff16d1cb5e49a656"`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP CONSTRAINT "FK_1de7eb246940b05765d2c99a7ec"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_a200937c3bef6072ce44d760fe3"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`);
        await queryRunner.query(`ALTER TABLE "price_list_items" DROP CONSTRAINT "FK_f4460b6ee8677a87247e107e2b7"`);
        await queryRunner.query(`ALTER TABLE "price_list_items" DROP CONSTRAINT "FK_97f080960141255e54eecb9bdbd"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_73ebdf90f8ae51734cddc69aec7"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP CONSTRAINT "FK_9978ca165b4c0f27571f3d1d924"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_cbe18cae039006a9c217d5a66a6"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_101d241c3e9916b8795c4385622"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_824be6feda5e655c49c4e0c534b"`);
        await queryRunner.query(`ALTER TABLE "sales_order_payments" DROP CONSTRAINT "FK_899dbc4613d051b78326ab2a2a6"`);
        await queryRunner.query(`ALTER TABLE "sales_order_payments" DROP CONSTRAINT "FK_25b96f4ab4eeffb86b4de316008"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP CONSTRAINT "FK_95836cf122ca5a4eb2e40ea552c"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP CONSTRAINT "FK_6b67146a69ed5fe5fe7f3224d31"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_a3acb59db67e977be45e382fc56"`);
        await queryRunner.query(`ALTER TABLE "journal_entry" DROP CONSTRAINT "FK_ca79e4fb545584a31cd41ea5268"`);
        await queryRunner.query(`ALTER TABLE "journal_entry_line" DROP CONSTRAINT "FK_13c69697d8aaa2300f46d37950b"`);
        await queryRunner.query(`ALTER TABLE "journal_entry_line" DROP CONSTRAINT "FK_77825e21d0e79de7fa546175ac3"`);
        await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_36d05d47bb0de4b4952fece8927"`);
        await queryRunner.query(`ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_26e0e019ef44a6751fefc53b2ef"`);
        await queryRunner.query(`ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_94bee561eb464b4c15aa22a5c9a"`);
        await queryRunner.query(`ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_34f8d735e63d4666142059af296"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" DROP CONSTRAINT "FK_18b0dec274845ee97da2a96ab49"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a23bf8737a4dd516f5736376e9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_89f7d0e12b07146088771d9292"`);
        await queryRunner.query(`DROP TABLE "stock_adjustment_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_043a83d3e28667389c00b71a22"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_45080b47646b52ab371e4bf001"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2717eb052d24c9623498b7e8a1"`);
        await queryRunner.query(`DROP TABLE "stock_adjustments"`);
        await queryRunner.query(`DROP TYPE "public"."stock_adjustments_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8dc36f8afc4975f27074d0bf5c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ccac1b7ddd1b101f17845a6ce"`);
        await queryRunner.query(`DROP TABLE "search_clicks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_65121ce59bf1c4494a6dba198f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b3f9a7099bd43b431de8e95dca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4981129d48833f45cc3e70f06b"`);
        await queryRunner.query(`DROP TABLE "search_queries"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_56b91d98f71e3d1b649ed6e9f3"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d6ee2d4bf901675877bb94977c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_994af44e59f0a97eb2e21a5f66"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0a4ef1738b13da938b62393dc0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0c3ff892a9f2ed16f59d31ccca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8be43e7dd0ae89d236418c690c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5272ac3aa931eedb14cd8789d6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_628fbe62ebdd5309e3466f5013"`);
        await queryRunner.query(`DROP TABLE "purchase_orders"`);
        await queryRunner.query(`DROP TYPE "public"."purchase_orders_paymentstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."purchase_orders_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7fb50d0b66a6167f82314895f5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1d44769daeb2f0c001f640e89"`);
        await queryRunner.query(`DROP TABLE "vendor_payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1de7eb246940b05765d2c99a7e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f87b1b82a3aff16d1cb5e49a65"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1b086ceed97e71200cdfd8a9de"`);
        await queryRunner.query(`DROP TABLE "purchase_order_items"`);
        await queryRunner.query(`DROP TYPE "public"."purchase_order_items_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ef7f8f1699296ab0bfabc5fd48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_73ea4840fc9114a341502b5054"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_876c06b5396f3c4acb7144ca92"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ab512720a1b9de8624a3dcf20"`);
        await queryRunner.query(`DROP TABLE "suppliers"`);
        await queryRunner.query(`DROP TYPE "public"."suppliers_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c929408ab43003b2a331322fb3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fbb017b75d15fa15e821535ab2"`);
        await queryRunner.query(`DROP TABLE "purchase_cost_history"`);
        await queryRunner.query(`DROP TABLE "print_settings"`);
        await queryRunner.query(`DROP TABLE "regional_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87177891d3752f62710447bc07"`);
        await queryRunner.query(`DROP TABLE "document_number_settings"`);
        await queryRunner.query(`DROP TABLE "company_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a1c9067a5e8b5aa4b5a9b357ec"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a6f051e66982b5f0318981bca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ca4efcb2224db51459f018ee2e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_420d9f679d41281f282f5bc7d0"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_adfc522baf9d9b19cd7d9461b7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c9fb58de893725258746385e1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff56834e735fa78a15d0cf2192"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5662d5ea5da62fc54b0f12a46"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff39b9ac40872b2de41751eedc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_464f927ae360106b783ed0b410"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TYPE "public"."products_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97f080960141255e54eecb9bdb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f4460b6ee8677a87247e107e2b"`);
        await queryRunner.query(`DROP TABLE "price_list_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de7a058bf061cbc078a74da890"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4770ad80432882ee086d7a638f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_000f630a35f803ec1024403ee3"`);
        await queryRunner.query(`DROP TABLE "price_lists"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88acd889fbe17d0e16cc4bc917"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dd44f67433aadad2785aecd5be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_73ebdf90f8ae51734cddc69aec"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40946e98ab87148f58703fa1c5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_082b57a14467f4d6a19a41d483"`);
        await queryRunner.query(`DROP TABLE "customers"`);
        await queryRunner.query(`DROP TYPE "public"."customers_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ea901f7691ec7f314f072d9dee"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9978ca165b4c0f27571f3d1d92"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fffc00bae87b600c1979dc0159"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9af7d43703f16f9e51db693679"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae5e0306e55a3b695ea60c7b5f"`);
        await queryRunner.query(`DROP TABLE "sales_orders"`);
        await queryRunner.query(`DROP TYPE "public"."sales_orders_paymentstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."sales_orders_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_824be6feda5e655c49c4e0c534"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_101d241c3e9916b8795c438562"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_32b41cdb985a296213e9a928b5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_27faf14e8959f0e40d7b722dc0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cbe18cae039006a9c217d5a66a"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_25b96f4ab4eeffb86b4de31600"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5f7beb77e4898dc93207580976"`);
        await queryRunner.query(`DROP TABLE "sales_order_payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b67146a69ed5fe5fe7f3224d3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95836cf122ca5a4eb2e40ea552"`);
        await queryRunner.query(`DROP TABLE "sales_order_items"`);
        await queryRunner.query(`DROP TYPE "public"."sales_order_items_discounttype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a3acb59db67e977be45e382fc5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_591aca148f00fd61c720c81424"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b9ab4db6fbe12384c8f7e6eb30"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_17e3734d294fe84a440c9f304d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_804c9e218b77e89e488b7fbfba"`);
        await queryRunner.query(`DROP TABLE "stock_movements"`);
        await queryRunner.query(`DROP TYPE "public"."stock_movements_movementtype_enum"`);
        await queryRunner.query(`DROP TABLE "backup_retention_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_143ccd21e172092cd54d7f266c"`);
        await queryRunner.query(`DROP TABLE "backup_schedules"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_107b126397721c443ffee292b8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bb12067d5d0ba5ee841e5aefb8"`);
        await queryRunner.query(`DROP TABLE "backup_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01993ae76b293d3b866cc3a125"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f23279fad63453147a8efb46cf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c69efb19bf127c97e6740ad530"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ca79e4fb545584a31cd41ea526"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_028b8eead9971a021ec1e5744b"`);
        await queryRunner.query(`DROP TABLE "journal_entry"`);
        await queryRunner.query(`DROP TYPE "public"."journal_entry_postingtype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."journal_entry_sourcetype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_13c69697d8aaa2300f46d37950"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77825e21d0e79de7fa546175ac"`);
        await queryRunner.query(`DROP TABLE "journal_entry_line"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f52fb01c27607bb74ba05abf16"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_36d05d47bb0de4b4952fece892"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_02fb625b48131aa070a708916c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6fdf195686fae846af43f454b7"`);
        await queryRunner.query(`DROP TABLE "expenses"`);
        await queryRunner.query(`DROP TYPE "public"."expenses_paymentstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."expenses_documentstatus_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_34f8d735e63d4666142059af29"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_777f83f5ffac50dde77a5bd4ec"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_26e0e019ef44a6751fefc53b2e"`);
        await queryRunner.query(`DROP TABLE "expense_payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f8aad3eab194dfdae604ca1112"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6243f21a7c99c9558984c267e"`);
        await queryRunner.query(`DROP TABLE "payment_methods"`);
        await queryRunner.query(`DROP TABLE "accounting_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de745245954d5662abfe10a466"`);
        await queryRunner.query(`DROP TABLE "chart_of_account"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_account_type_enum"`);
    }

}
