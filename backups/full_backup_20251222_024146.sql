--
-- PostgreSQL database cluster dump
--

\restrict EFtWVBRcZgeCEb0GTWXHFuT4Ym88GyJZjlIczh9X3KtSdTjGIwyc5isq6UZ148P

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE erp_user;
ALTER ROLE erp_user WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:Wr4UyDT0Cm7fYLfldzKWxw==$+raTaAeV7WfEKVp0Lz8UpTpm+fmEOw747fjI5rYXin0=:k8YlR3fLpAokjsXpgSKu5M8TbgA7l4E+pJMeMsasRWw=';

--
-- User Configurations
--








\unrestrict EFtWVBRcZgeCEb0GTWXHFuT4Ym88GyJZjlIczh9X3KtSdTjGIwyc5isq6UZ148P

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict ZQbdrTHFgaFhPAsar4YWOmmV7W77xGHHJeVBafd3GPKiTfReryLdGS8arloYDc3

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict ZQbdrTHFgaFhPAsar4YWOmmV7W77xGHHJeVBafd3GPKiTfReryLdGS8arloYDc3

--
-- Database "erp_db" dump
--

--
-- PostgreSQL database dump
--

\restrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: erp_db; Type: DATABASE; Schema: -; Owner: erp_user
--

CREATE DATABASE erp_db WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE erp_db OWNER TO erp_user;

\unrestrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr
\connect erp_db
\restrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE erp_db; Type: COMMENT; Schema: -; Owner: erp_user
--

COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: Asia/Kuala_Lumpur';


--
-- Name: erp_db; Type: DATABASE PROPERTIES; Schema: -; Owner: erp_user
--

ALTER DATABASE erp_db SET "TimeZone" TO 'UTC';


\unrestrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr
\connect erp_db
\restrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: erp_user
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO erp_user;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: erp_user
--

COMMENT ON SCHEMA public IS '';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: customers_type_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.customers_type_enum AS ENUM (
    'individual',
    'business'
);


ALTER TYPE public.customers_type_enum OWNER TO erp_user;

--
-- Name: goods_received_notes_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.goods_received_notes_status_enum AS ENUM (
    'draft',
    'received'
);


ALTER TYPE public.goods_received_notes_status_enum OWNER TO erp_user;

--
-- Name: invoice_items_discounttype_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.invoice_items_discounttype_enum AS ENUM (
    'percentage',
    'amount'
);


ALTER TYPE public.invoice_items_discounttype_enum OWNER TO erp_user;

--
-- Name: invoices_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.invoices_status_enum AS ENUM (
    'draft',
    'partial_paid',
    'paid'
);


ALTER TYPE public.invoices_status_enum OWNER TO erp_user;

--
-- Name: payments_paymentmethod_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.payments_paymentmethod_enum AS ENUM (
    'cash'
);


ALTER TYPE public.payments_paymentmethod_enum OWNER TO erp_user;

--
-- Name: payments_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.payments_status_enum AS ENUM (
    'completed'
);


ALTER TYPE public.payments_status_enum OWNER TO erp_user;

--
-- Name: plugins_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.plugins_status_enum AS ENUM (
    'installed',
    'active',
    'inactive',
    'error',
    'updating',
    'uninstalled'
);


ALTER TYPE public.plugins_status_enum OWNER TO erp_user;

--
-- Name: plugins_type_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.plugins_type_enum AS ENUM (
    'integration',
    'report',
    'workflow',
    'ui_extension',
    'data_connector',
    'payment_gateway',
    'shipping_provider',
    'notification',
    'analytics',
    'security',
    'other'
);


ALTER TYPE public.plugins_type_enum OWNER TO erp_user;

--
-- Name: products_type_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.products_type_enum AS ENUM (
    'Stocked Product',
    'Service'
);


ALTER TYPE public.products_type_enum OWNER TO erp_user;

--
-- Name: purchase_order_items_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.purchase_order_items_status_enum AS ENUM (
    'pending',
    'approved',
    'ordered',
    'partially_received',
    'received',
    'cancelled'
);


ALTER TYPE public.purchase_order_items_status_enum OWNER TO erp_user;

--
-- Name: sales_order_items_discounttype_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.sales_order_items_discounttype_enum AS ENUM (
    'percentage',
    'amount'
);


ALTER TYPE public.sales_order_items_discounttype_enum OWNER TO erp_user;

--
-- Name: settings_category_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.settings_category_enum AS ENUM (
    'general',
    'company',
    'inventory',
    'sales',
    'purchasing',
    'financial',
    'notifications',
    'system'
);


ALTER TYPE public.settings_category_enum OWNER TO erp_user;

--
-- Name: settings_datatype_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.settings_datatype_enum AS ENUM (
    'string',
    'number',
    'boolean',
    'json'
);


ALTER TYPE public.settings_datatype_enum OWNER TO erp_user;

--
-- Name: stock_adjustments_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.stock_adjustments_status_enum AS ENUM (
    'draft',
    'completed'
);


ALTER TYPE public.stock_adjustments_status_enum OWNER TO erp_user;

--
-- Name: stock_movements_movementtype_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.stock_movements_movementtype_enum AS ENUM (
    'purchase_receipt',
    'sales_return',
    'sale_reversal',
    'production_receipt',
    'transfer_in',
    'adjustment_increase',
    'initial_stock',
    'sale',
    'purchase_return',
    'production_consumption',
    'transfer_out',
    'adjustment_decrease',
    'damage',
    'expiry',
    'theft',
    'loss'
);


ALTER TYPE public.stock_movements_movementtype_enum OWNER TO erp_user;

--
-- Name: stock_movements_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.stock_movements_status_enum AS ENUM (
    'pending',
    'completed',
    'cancelled',
    'reversed'
);


ALTER TYPE public.stock_movements_status_enum OWNER TO erp_user;

--
-- Name: suppliers_type_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.suppliers_type_enum AS ENUM (
    'local',
    'international'
);


ALTER TYPE public.suppliers_type_enum OWNER TO erp_user;

--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.users_role_enum AS ENUM (
    'admin',
    'manager',
    'sales_staff',
    'inventory_staff',
    'procurement_staff'
);


ALTER TYPE public.users_role_enum OWNER TO erp_user;

--
-- Name: users_status_enum; Type: TYPE; Schema: public; Owner: erp_user
--

CREATE TYPE public.users_status_enum AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE public.users_status_enum OWNER TO erp_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    name character varying(100) NOT NULL,
    path character varying(500),
    level integer DEFAULT 0 NOT NULL,
    "parentId" uuid
);


ALTER TABLE public.categories OWNER TO erp_user;

--
-- Name: COLUMN categories."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.categories."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN categories.name; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.categories.name IS 'Category name';


--
-- Name: COLUMN categories.path; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.categories.path IS 'Materialized path for tree structure (auto-managed)';


--
-- Name: COLUMN categories.level; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.categories.level IS 'Depth level in the tree (0 = root)';


--
-- Name: COLUMN categories."parentId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.categories."parentId" IS 'Parent category ID';


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    name character varying(255) NOT NULL,
    address text NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(100),
    "postalCode" character varying(20),
    country character varying(100) NOT NULL,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    "miscInfo" text,
    "logoUrl" character varying(500)
);


ALTER TABLE public.company_settings OWNER TO erp_user;

--
-- Name: COLUMN company_settings."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.company_settings."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: customers; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    type public.customers_type_enum DEFAULT 'individual'::public.customers_type_enum NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(20),
    "totalSales" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalOrders" integer DEFAULT 0 NOT NULL,
    "lastPurchaseDate" timestamp with time zone,
    "firstPurchaseDate" timestamp with time zone,
    notes text,
    "pricingScheme" character varying(100) DEFAULT 'Retail'::character varying NOT NULL,
    "streetAddress" character varying(255),
    city character varying(100),
    state character varying(100),
    "postalCode" character varying(20),
    country character varying(100)
);


ALTER TABLE public.customers OWNER TO erp_user;

--
-- Name: COLUMN customers."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN customers.type; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.type IS 'Customer type (individual/business)';


--
-- Name: COLUMN customers.name; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.name IS 'Customer name or business name';


--
-- Name: COLUMN customers.phone; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.phone IS 'Primary phone number';


--
-- Name: COLUMN customers."totalSales"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."totalSales" IS 'Total sales amount to this customer';


--
-- Name: COLUMN customers."totalOrders"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."totalOrders" IS 'Total number of orders';


--
-- Name: COLUMN customers."lastPurchaseDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."lastPurchaseDate" IS 'Date of last purchase';


--
-- Name: COLUMN customers."firstPurchaseDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."firstPurchaseDate" IS 'Date of first purchase';


--
-- Name: COLUMN customers.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.notes IS 'Internal notes about the customer';


--
-- Name: COLUMN customers."pricingScheme"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."pricingScheme" IS 'Default pricing scheme name for this customer';


--
-- Name: COLUMN customers."streetAddress"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."streetAddress" IS 'Street address';


--
-- Name: COLUMN customers.city; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.city IS 'City';


--
-- Name: COLUMN customers.state; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.state IS 'State or province';


--
-- Name: COLUMN customers."postalCode"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers."postalCode" IS 'Postal or ZIP code';


--
-- Name: COLUMN customers.country; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.customers.country IS 'Country';


--
-- Name: goods_received_note_items; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.goods_received_note_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "lineNumber" integer NOT NULL,
    "orderedQuantity" numeric(15,4) NOT NULL,
    "receivedQuantity" numeric(15,4) NOT NULL,
    "grnId" uuid NOT NULL,
    "productId" uuid NOT NULL,
    "purchaseOrderItemId" uuid
);


ALTER TABLE public.goods_received_note_items OWNER TO erp_user;

--
-- Name: COLUMN goods_received_note_items."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN goods_received_note_items."lineNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."lineNumber" IS 'Line item sequence number within the GRN';


--
-- Name: COLUMN goods_received_note_items."orderedQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."orderedQuantity" IS 'Ordered quantity (from PO)';


--
-- Name: COLUMN goods_received_note_items."receivedQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."receivedQuantity" IS 'Quantity received';


--
-- Name: COLUMN goods_received_note_items."grnId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."grnId" IS 'Goods Received Note ID';


--
-- Name: COLUMN goods_received_note_items."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."productId" IS 'Product ID';


--
-- Name: COLUMN goods_received_note_items."purchaseOrderItemId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_note_items."purchaseOrderItemId" IS 'Reference to original purchase order item';


--
-- Name: goods_received_notes; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.goods_received_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "grnNumber" character varying(30) NOT NULL,
    status public.goods_received_notes_status_enum DEFAULT 'draft'::public.goods_received_notes_status_enum NOT NULL,
    "receivedDate" date NOT NULL,
    "totalQuantityReceived" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "purchaseOrderId" uuid,
    "supplierId" uuid NOT NULL
);


ALTER TABLE public.goods_received_notes OWNER TO erp_user;

--
-- Name: COLUMN goods_received_notes."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN goods_received_notes."grnNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."grnNumber" IS 'Unique GRN number';


--
-- Name: COLUMN goods_received_notes.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes.status IS 'GRN status';


--
-- Name: COLUMN goods_received_notes."receivedDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."receivedDate" IS 'Date goods were received';


--
-- Name: COLUMN goods_received_notes."totalQuantityReceived"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."totalQuantityReceived" IS 'Total quantity received';


--
-- Name: COLUMN goods_received_notes."purchaseOrderId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."purchaseOrderId" IS 'Related purchase order ID';


--
-- Name: COLUMN goods_received_notes."supplierId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.goods_received_notes."supplierId" IS 'Supplier ID';


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "lineNumber" integer NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "unitPrice" numeric(15,4) NOT NULL,
    discount numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "invoiceId" uuid NOT NULL,
    "productId" uuid NOT NULL,
    "discountType" public.invoice_items_discounttype_enum DEFAULT 'percentage'::public.invoice_items_discounttype_enum,
    "discountPercent" numeric(5,2) DEFAULT '0'::numeric
);


ALTER TABLE public.invoice_items OWNER TO erp_user;

--
-- Name: COLUMN invoice_items."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN invoice_items."lineNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."lineNumber" IS 'Line item sequence number within the invoice';


--
-- Name: COLUMN invoice_items.quantity; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items.quantity IS 'Invoiced quantity';


--
-- Name: COLUMN invoice_items."unitPrice"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."unitPrice" IS 'Unit price at time of invoice';


--
-- Name: COLUMN invoice_items.discount; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items.discount IS 'Line item discount amount';


--
-- Name: COLUMN invoice_items."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."totalAmount" IS 'Line item total amount (after discount)';


--
-- Name: COLUMN invoice_items."invoiceId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."invoiceId" IS 'Invoice ID';


--
-- Name: COLUMN invoice_items."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."productId" IS 'Product ID';


--
-- Name: COLUMN invoice_items."discountType"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."discountType" IS 'Type of discount: percentage or fixed amount';


--
-- Name: COLUMN invoice_items."discountPercent"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoice_items."discountPercent" IS 'Line item discount percentage (0-100)';


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "invoiceNumber" character varying(30) NOT NULL,
    status public.invoices_status_enum DEFAULT 'draft'::public.invoices_status_enum NOT NULL,
    "invoiceDate" date NOT NULL,
    "paidDate" date,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "paidAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "balanceDue" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "customerId" uuid NOT NULL,
    "salesOrderId" uuid,
    notes text,
    "shippingAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.invoices OWNER TO erp_user;

--
-- Name: COLUMN invoices."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN invoices."invoiceNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."invoiceNumber" IS 'Unique invoice number';


--
-- Name: COLUMN invoices.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices.status IS 'Invoice status';


--
-- Name: COLUMN invoices."invoiceDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."invoiceDate" IS 'Invoice date';


--
-- Name: COLUMN invoices."paidDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."paidDate" IS 'Date when invoice was fully paid';


--
-- Name: COLUMN invoices."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."totalAmount" IS 'Total invoice amount (same as subtotal - discounts tracked at line item level)';


--
-- Name: COLUMN invoices."paidAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."paidAmount" IS 'Total amount paid so far';


--
-- Name: COLUMN invoices."balanceDue"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."balanceDue" IS 'Remaining balance due';


--
-- Name: COLUMN invoices."customerId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."customerId" IS 'Customer ID';


--
-- Name: COLUMN invoices."salesOrderId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."salesOrderId" IS 'Related sales order ID (if applicable)';


--
-- Name: COLUMN invoices.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices.notes IS 'Invoice notes (synced from sales order)';


--
-- Name: COLUMN invoices."shippingAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.invoices."shippingAmount" IS 'Shipping/freight charges';


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO erp_user;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: erp_user
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.migrations_id_seq OWNER TO erp_user;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: erp_user
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "paymentNumber" character varying(30) NOT NULL,
    status public.payments_status_enum DEFAULT 'completed'::public.payments_status_enum NOT NULL,
    "paymentMethod" public.payments_paymentmethod_enum DEFAULT 'cash'::public.payments_paymentmethod_enum NOT NULL,
    "paymentDate" date NOT NULL,
    amount numeric(15,4) NOT NULL,
    notes text,
    "customerId" uuid NOT NULL,
    "invoiceId" uuid
);


ALTER TABLE public.payments OWNER TO erp_user;

--
-- Name: COLUMN payments."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN payments."paymentNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."paymentNumber" IS 'Unique payment reference number';


--
-- Name: COLUMN payments.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments.status IS 'Payment status';


--
-- Name: COLUMN payments."paymentMethod"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."paymentMethod" IS 'Payment method';


--
-- Name: COLUMN payments."paymentDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."paymentDate" IS 'Payment date';


--
-- Name: COLUMN payments.amount; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments.amount IS 'Payment amount';


--
-- Name: COLUMN payments.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments.notes IS 'Payment notes or description';


--
-- Name: COLUMN payments."customerId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."customerId" IS 'Customer ID';


--
-- Name: COLUMN payments."invoiceId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.payments."invoiceId" IS 'Related invoice ID';


--
-- Name: plugins; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.plugins (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    identifier character varying(100) NOT NULL,
    name character varying(200) NOT NULL,
    description text NOT NULL,
    version character varying(20) NOT NULL,
    type public.plugins_type_enum NOT NULL,
    status public.plugins_status_enum DEFAULT 'installed'::public.plugins_status_enum NOT NULL,
    author character varying(200) NOT NULL,
    license character varying(100),
    homepage character varying(255),
    repository character varying(255),
    "iconUrl" character varying(255),
    "installedDate" timestamp with time zone DEFAULT now() NOT NULL,
    "lastActivatedDate" timestamp with time zone,
    "lastUpdatedDate" timestamp with time zone,
    "installPath" character varying(500),
    dependencies json,
    requirements json,
    "configSchema" json,
    config json,
    "defaultConfig" json,
    hooks json,
    endpoints json,
    "uiComponents" json,
    "performanceMetrics" json,
    "usageStats" json,
    "lastError" text,
    "lastErrorAt" timestamp with time zone,
    "errorCount" integer DEFAULT 0 NOT NULL,
    tags json,
    media json,
    changelog json,
    metadata json
);


ALTER TABLE public.plugins OWNER TO erp_user;

--
-- Name: COLUMN plugins."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN plugins.identifier; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.identifier IS 'Unique plugin identifier/slug';


--
-- Name: COLUMN plugins.name; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.name IS 'Plugin display name';


--
-- Name: COLUMN plugins.description; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.description IS 'Plugin description';


--
-- Name: COLUMN plugins.version; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.version IS 'Plugin version';


--
-- Name: COLUMN plugins.type; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.type IS 'Plugin type/category';


--
-- Name: COLUMN plugins.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.status IS 'Plugin status';


--
-- Name: COLUMN plugins.author; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.author IS 'Plugin author/developer';


--
-- Name: COLUMN plugins.license; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.license IS 'Plugin license';


--
-- Name: COLUMN plugins.homepage; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.homepage IS 'Plugin homepage URL';


--
-- Name: COLUMN plugins.repository; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.repository IS 'Plugin repository URL';


--
-- Name: COLUMN plugins."iconUrl"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."iconUrl" IS 'Plugin icon URL or path';


--
-- Name: COLUMN plugins."installedDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."installedDate" IS 'Installation date';


--
-- Name: COLUMN plugins."lastActivatedDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."lastActivatedDate" IS 'Last activation date';


--
-- Name: COLUMN plugins."lastUpdatedDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."lastUpdatedDate" IS 'Last update date';


--
-- Name: COLUMN plugins."installPath"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."installPath" IS 'Installation path or location';


--
-- Name: COLUMN plugins.dependencies; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.dependencies IS 'Plugin dependencies';


--
-- Name: COLUMN plugins.requirements; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.requirements IS 'System requirements';


--
-- Name: COLUMN plugins."configSchema"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."configSchema" IS 'Plugin configuration schema';


--
-- Name: COLUMN plugins.config; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.config IS 'Current plugin configuration';


--
-- Name: COLUMN plugins."defaultConfig"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."defaultConfig" IS 'Default configuration values';


--
-- Name: COLUMN plugins.hooks; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.hooks IS 'Plugin hooks and event handlers';


--
-- Name: COLUMN plugins.endpoints; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.endpoints IS 'API endpoints provided by plugin';


--
-- Name: COLUMN plugins."uiComponents"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."uiComponents" IS 'UI components or routes added by plugin';


--
-- Name: COLUMN plugins."performanceMetrics"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."performanceMetrics" IS 'Plugin performance metrics';


--
-- Name: COLUMN plugins."usageStats"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."usageStats" IS 'Plugin usage statistics';


--
-- Name: COLUMN plugins."lastError"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."lastError" IS 'Last error message';


--
-- Name: COLUMN plugins."lastErrorAt"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."lastErrorAt" IS 'Last error timestamp';


--
-- Name: COLUMN plugins."errorCount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins."errorCount" IS 'Error count';


--
-- Name: COLUMN plugins.tags; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.tags IS 'Plugin tags for categorization';


--
-- Name: COLUMN plugins.media; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.media IS 'Plugin screenshots or media';


--
-- Name: COLUMN plugins.changelog; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.changelog IS 'Plugin changelog';


--
-- Name: COLUMN plugins.metadata; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.plugins.metadata IS 'Additional plugin metadata';


--
-- Name: price_costing_settings; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.price_costing_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    "costingMethod" character varying(50) DEFAULT 'AVERAGE'::character varying NOT NULL,
    "customerPricingSchemes" jsonb
);


ALTER TABLE public.price_costing_settings OWNER TO erp_user;

--
-- Name: COLUMN price_costing_settings."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.price_costing_settings."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: print_settings; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.print_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "logoUrl" character varying(500),
    "companyName" character varying(255),
    address text,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    "miscInfo" text,
    "salesPerPageFooter" text,
    "salesEndOfDocFooter" text,
    "purchasingPerPageFooter" text,
    "purchasingEndOfDocFooter" text,
    "inventoryPerPageFooter" text,
    "inventoryEndOfDocFooter" text,
    "reportPerPageFooter" text,
    "reportEndOfDocFooter" text,
    "salesOrderTemplate" jsonb,
    "invoiceTemplate" jsonb,
    "paymentReceiptTemplate" jsonb,
    "purchaseOrderTemplate" jsonb,
    "grnTemplate" jsonb,
    "vendorPaymentTemplate" jsonb,
    city character varying(100),
    state character varying(100),
    "postalCode" character varying(20),
    country character varying(100)
);


ALTER TABLE public.print_settings OWNER TO erp_user;

--
-- Name: COLUMN print_settings."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.print_settings."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: products; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    barcode character varying(100),
    type public.products_type_enum DEFAULT 'Stocked Product'::public.products_type_enum NOT NULL,
    "baseCost" numeric(15,4) NOT NULL,
    "stockQuantity" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    notes text,
    "categoryId" uuid NOT NULL,
    "pricingTiers" jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.products OWNER TO erp_user;

--
-- Name: COLUMN products."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN products.name; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products.name IS 'Product name';


--
-- Name: COLUMN products.description; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products.description IS 'Detailed product description';


--
-- Name: COLUMN products.barcode; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products.barcode IS 'Product barcode - unique product identifier';


--
-- Name: COLUMN products.type; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products.type IS 'Product type (goods/service)';


--
-- Name: COLUMN products."baseCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products."baseCost" IS 'Base cost price';


--
-- Name: COLUMN products."stockQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products."stockQuantity" IS 'Current stock quantity';


--
-- Name: COLUMN products.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products.notes IS 'Internal notes about the product';


--
-- Name: COLUMN products."categoryId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products."categoryId" IS 'Product category ID';


--
-- Name: COLUMN products."pricingTiers"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.products."pricingTiers" IS 'Dynamic pricing tiers from settings - { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }';


--
-- Name: purchase_cost_history; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.purchase_cost_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "productId" uuid NOT NULL,
    "grnId" uuid,
    "unitCost" numeric(15,4) NOT NULL,
    "shippingPerUnit" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "landedCost" numeric(15,4) NOT NULL,
    "receivedQuantity" numeric(15,4) NOT NULL,
    "remainingQuantity" numeric(15,4) NOT NULL,
    "receivedDate" timestamp without time zone NOT NULL
);


ALTER TABLE public.purchase_cost_history OWNER TO erp_user;

--
-- Name: COLUMN purchase_cost_history."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN purchase_cost_history."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."productId" IS 'Product ID';


--
-- Name: COLUMN purchase_cost_history."grnId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."grnId" IS 'GRN ID or special UUID for opening balance';


--
-- Name: COLUMN purchase_cost_history."unitCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."unitCost" IS 'Purchase unit cost (excluding shipping)';


--
-- Name: COLUMN purchase_cost_history."shippingPerUnit"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."shippingPerUnit" IS 'Allocated shipping cost per unit (BY VALUE)';


--
-- Name: COLUMN purchase_cost_history."landedCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."landedCost" IS 'Total landed cost per unit (unitCost + shippingPerUnit)';


--
-- Name: COLUMN purchase_cost_history."receivedQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."receivedQuantity" IS 'Original quantity received';


--
-- Name: COLUMN purchase_cost_history."remainingQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."remainingQuantity" IS 'Current quantity remaining in stock (for weighted average)';


--
-- Name: COLUMN purchase_cost_history."receivedDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_cost_history."receivedDate" IS 'Date goods were received';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "lineNumber" integer NOT NULL,
    status public.purchase_order_items_status_enum DEFAULT 'pending'::public.purchase_order_items_status_enum NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "receivedQuantity" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "unitCost" numeric(15,4) NOT NULL,
    "discountType" character varying(20) DEFAULT 'percentage'::character varying NOT NULL,
    "discountPercent" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "discountAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "purchaseOrderId" uuid NOT NULL,
    "productId" uuid NOT NULL
);


ALTER TABLE public.purchase_order_items OWNER TO erp_user;

--
-- Name: COLUMN purchase_order_items."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN purchase_order_items."lineNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."lineNumber" IS 'Line item sequence number within the order';


--
-- Name: COLUMN purchase_order_items.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items.status IS 'Item status';


--
-- Name: COLUMN purchase_order_items.quantity; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items.quantity IS 'Ordered quantity';


--
-- Name: COLUMN purchase_order_items."receivedQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."receivedQuantity" IS 'Received quantity so far';


--
-- Name: COLUMN purchase_order_items."unitCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."unitCost" IS 'Unit cost price';


--
-- Name: COLUMN purchase_order_items."discountType"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."discountType" IS 'Discount type: percentage or fixed_amount';


--
-- Name: COLUMN purchase_order_items."discountPercent"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."discountPercent" IS 'Line item discount percentage';


--
-- Name: COLUMN purchase_order_items."discountAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."discountAmount" IS 'Line item discount amount (total for all units or per-unit based on discountType)';


--
-- Name: COLUMN purchase_order_items."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."totalAmount" IS 'Line item total amount (after discount)';


--
-- Name: COLUMN purchase_order_items."purchaseOrderId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."purchaseOrderId" IS 'Purchase order ID';


--
-- Name: COLUMN purchase_order_items."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_order_items."productId" IS 'Product ID';


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "orderNumber" character varying(30) NOT NULL,
    "orderDate" date NOT NULL,
    subtotal numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "discountPercent" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "discountAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "shippingAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    notes text,
    "supplierId" uuid NOT NULL,
    "paidAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.purchase_orders OWNER TO erp_user;

--
-- Name: COLUMN purchase_orders."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN purchase_orders."orderNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."orderNumber" IS 'Unique purchase order number';


--
-- Name: COLUMN purchase_orders."orderDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."orderDate" IS 'Purchase order date';


--
-- Name: COLUMN purchase_orders.subtotal; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders.subtotal IS 'Subtotal amount (before tax and discounts)';


--
-- Name: COLUMN purchase_orders."discountPercent"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."discountPercent" IS 'Discount percentage';


--
-- Name: COLUMN purchase_orders."discountAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."discountAmount" IS 'Discount amount';


--
-- Name: COLUMN purchase_orders."shippingAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."shippingAmount" IS 'Shipping/freight charges';


--
-- Name: COLUMN purchase_orders."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."totalAmount" IS 'Total order amount';


--
-- Name: COLUMN purchase_orders.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders.notes IS 'Special instructions or notes';


--
-- Name: COLUMN purchase_orders."supplierId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."supplierId" IS 'Supplier ID';


--
-- Name: COLUMN purchase_orders."paidAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.purchase_orders."paidAmount" IS 'Total amount paid';


--
-- Name: sales_order_items; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.sales_order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "lineNumber" integer NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" numeric(15,4) NOT NULL,
    "discountType" public.sales_order_items_discounttype_enum DEFAULT 'percentage'::public.sales_order_items_discounttype_enum NOT NULL,
    "discountPercent" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "discountAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "unitCost" numeric(15,4) NOT NULL,
    notes text,
    "salesOrderId" uuid NOT NULL,
    "productId" uuid NOT NULL
);


ALTER TABLE public.sales_order_items OWNER TO erp_user;

--
-- Name: COLUMN sales_order_items."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN sales_order_items."lineNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."lineNumber" IS 'Line item sequence number within the order';


--
-- Name: COLUMN sales_order_items.quantity; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items.quantity IS 'Ordered quantity';


--
-- Name: COLUMN sales_order_items."unitPrice"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."unitPrice" IS 'Unit price at time of order';


--
-- Name: COLUMN sales_order_items."discountType"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."discountType" IS 'Type of discount: percentage or fixed amount';


--
-- Name: COLUMN sales_order_items."discountPercent"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."discountPercent" IS 'Line item discount percentage (0-100)';


--
-- Name: COLUMN sales_order_items."discountAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."discountAmount" IS 'Line item discount amount (fixed amount or calculated from percentage)';


--
-- Name: COLUMN sales_order_items."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."totalAmount" IS 'Line item total amount (after discount)';


--
-- Name: COLUMN sales_order_items."unitCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."unitCost" IS 'Product cost at time of order';


--
-- Name: COLUMN sales_order_items.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items.notes IS 'Special instructions for this item';


--
-- Name: COLUMN sales_order_items."salesOrderId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."salesOrderId" IS 'Sales order ID';


--
-- Name: COLUMN sales_order_items."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_order_items."productId" IS 'Product ID';


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "orderNumber" character varying(30) NOT NULL,
    "orderDate" date NOT NULL,
    "shippingAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "paidAmount" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "isFulfilled" boolean DEFAULT false NOT NULL,
    "fulfilledDate" timestamp without time zone,
    notes text,
    "customerId" uuid NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL
);


ALTER TABLE public.sales_orders OWNER TO erp_user;

--
-- Name: COLUMN sales_orders."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN sales_orders."orderNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."orderNumber" IS 'Unique sales order number';


--
-- Name: COLUMN sales_orders."orderDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."orderDate" IS 'Order date';


--
-- Name: COLUMN sales_orders."shippingAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."shippingAmount" IS 'Shipping/freight charges';


--
-- Name: COLUMN sales_orders."totalAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."totalAmount" IS 'Total order amount';


--
-- Name: COLUMN sales_orders."paidAmount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."paidAmount" IS 'Amount received from customer';


--
-- Name: COLUMN sales_orders."isFulfilled"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."isFulfilled" IS 'Whether order is fulfilled (inventory deducted)';


--
-- Name: COLUMN sales_orders."fulfilledDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."fulfilledDate" IS 'Date when order was fulfilled';


--
-- Name: COLUMN sales_orders.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders.notes IS 'Special instructions or notes';


--
-- Name: COLUMN sales_orders."customerId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders."customerId" IS 'Customer ID';


--
-- Name: COLUMN sales_orders.currency; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.sales_orders.currency IS 'Transaction currency';


--
-- Name: stock_adjustment_items; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.stock_adjustment_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "stockAdjustmentId" uuid NOT NULL,
    "productId" uuid NOT NULL,
    "oldQuantity" numeric(15,4) NOT NULL,
    "newQuantity" numeric(15,4) NOT NULL,
    difference numeric(15,4) NOT NULL,
    "unitCost" numeric(15,4),
    "totalValue" numeric(15,4),
    notes text
);


ALTER TABLE public.stock_adjustment_items OWNER TO erp_user;

--
-- Name: COLUMN stock_adjustment_items."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN stock_adjustment_items."stockAdjustmentId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."stockAdjustmentId" IS 'Stock adjustment header ID';


--
-- Name: COLUMN stock_adjustment_items."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."productId" IS 'Product ID';


--
-- Name: COLUMN stock_adjustment_items."oldQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."oldQuantity" IS 'Quantity before adjustment';


--
-- Name: COLUMN stock_adjustment_items."newQuantity"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."newQuantity" IS 'Quantity after adjustment';


--
-- Name: COLUMN stock_adjustment_items.difference; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items.difference IS 'Difference (newQuantity - oldQuantity)';


--
-- Name: COLUMN stock_adjustment_items."unitCost"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."unitCost" IS 'Unit cost at time of adjustment';


--
-- Name: COLUMN stock_adjustment_items."totalValue"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items."totalValue" IS 'Total value of this line (absolute difference * unit cost)';


--
-- Name: COLUMN stock_adjustment_items.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustment_items.notes IS 'Reason for this specific item adjustment';


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "adjustmentNumber" character varying(50) NOT NULL,
    "adjustmentDate" timestamp with time zone DEFAULT now() NOT NULL,
    status public.stock_adjustments_status_enum DEFAULT 'draft'::public.stock_adjustments_status_enum NOT NULL,
    notes text,
    "itemCount" integer DEFAULT 0 NOT NULL,
    "totalValue" numeric(15,4) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.stock_adjustments OWNER TO erp_user;

--
-- Name: COLUMN stock_adjustments."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN stock_adjustments."adjustmentNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments."adjustmentNumber" IS 'Stock adjustment number (SA-XXXXXX)';


--
-- Name: COLUMN stock_adjustments."adjustmentDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments."adjustmentDate" IS 'Date and time of adjustment';


--
-- Name: COLUMN stock_adjustments.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments.status IS 'Adjustment status';


--
-- Name: COLUMN stock_adjustments.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments.notes IS 'Adjustment notes/reason';


--
-- Name: COLUMN stock_adjustments."itemCount"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments."itemCount" IS 'Number of line items';


--
-- Name: COLUMN stock_adjustments."totalValue"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_adjustments."totalValue" IS 'Total adjustment value (absolute sum)';


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "movementType" public.stock_movements_movementtype_enum NOT NULL,
    "movementDate" timestamp with time zone DEFAULT now() NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "previousBalance" numeric(15,4) NOT NULL,
    "newBalance" numeric(15,4) NOT NULL,
    "unitValue" numeric(15,4),
    "totalValue" numeric(15,4),
    "referenceType" character varying(50),
    "referenceId" uuid,
    reason text,
    notes text,
    "productId" uuid NOT NULL
);


ALTER TABLE public.stock_movements OWNER TO erp_user;

--
-- Name: COLUMN stock_movements."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN stock_movements."movementType"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."movementType" IS 'Type of stock movement';


--
-- Name: COLUMN stock_movements."movementDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."movementDate" IS 'Date and time of movement';


--
-- Name: COLUMN stock_movements.quantity; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements.quantity IS 'Quantity moved (positive for inward, negative for outward)';


--
-- Name: COLUMN stock_movements."previousBalance"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."previousBalance" IS 'Stock quantity before this movement';


--
-- Name: COLUMN stock_movements."newBalance"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."newBalance" IS 'Stock quantity after this movement';


--
-- Name: COLUMN stock_movements."unitValue"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."unitValue" IS 'Unit cost/price at time of movement';


--
-- Name: COLUMN stock_movements."totalValue"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."totalValue" IS 'Total value of this movement';


--
-- Name: COLUMN stock_movements."referenceType"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."referenceType" IS 'Type of source document (sales_order, purchase_order, etc.)';


--
-- Name: COLUMN stock_movements."referenceId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."referenceId" IS 'ID of the source document';


--
-- Name: COLUMN stock_movements.reason; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements.reason IS 'Reason or notes for this movement';


--
-- Name: COLUMN stock_movements.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements.notes IS 'Additional notes';


--
-- Name: COLUMN stock_movements."productId"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.stock_movements."productId" IS 'Product ID';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    type public.suppliers_type_enum DEFAULT 'local'::public.suppliers_type_enum NOT NULL,
    "companyName" character varying(200) NOT NULL,
    "contactPerson" character varying(200),
    phone character varying(20),
    "totalPurchases" numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    "totalOrders" integer DEFAULT 0 NOT NULL,
    "lastPurchaseDate" timestamp with time zone,
    "firstPurchaseDate" timestamp with time zone,
    notes text,
    "streetAddress" character varying(255),
    city character varying(100),
    state character varying(100),
    "postalCode" character varying(20),
    country character varying(100)
);


ALTER TABLE public.suppliers OWNER TO erp_user;

--
-- Name: COLUMN suppliers."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN suppliers.type; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.type IS 'Supplier type (local/international)';


--
-- Name: COLUMN suppliers."companyName"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."companyName" IS 'Supplier company name';


--
-- Name: COLUMN suppliers."contactPerson"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."contactPerson" IS 'Contact person name';


--
-- Name: COLUMN suppliers.phone; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.phone IS 'Primary phone number';


--
-- Name: COLUMN suppliers."totalPurchases"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."totalPurchases" IS 'Total purchase amount from this supplier';


--
-- Name: COLUMN suppliers."totalOrders"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."totalOrders" IS 'Total number of purchase orders';


--
-- Name: COLUMN suppliers."lastPurchaseDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."lastPurchaseDate" IS 'Date of last purchase';


--
-- Name: COLUMN suppliers."firstPurchaseDate"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."firstPurchaseDate" IS 'Date of first purchase';


--
-- Name: COLUMN suppliers.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.notes IS 'Internal notes about the supplier';


--
-- Name: COLUMN suppliers."streetAddress"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."streetAddress" IS 'Street address';


--
-- Name: COLUMN suppliers.city; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.city IS 'City';


--
-- Name: COLUMN suppliers.state; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.state IS 'State/Province';


--
-- Name: COLUMN suppliers."postalCode"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers."postalCode" IS 'Postal/ZIP code';


--
-- Name: COLUMN suppliers.country; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.suppliers.country IS 'Country';


--
-- Name: users; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    "firstName" character varying(100) NOT NULL,
    "lastName" character varying(100) NOT NULL,
    "phoneNumber" character varying(20),
    role public.users_role_enum DEFAULT 'sales_staff'::public.users_role_enum NOT NULL,
    status public.users_status_enum DEFAULT 'active'::public.users_status_enum NOT NULL,
    "lastLoginAt" timestamp with time zone,
    "lastLoginIp" character varying(45),
    "failedLoginAttempts" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp with time zone,
    notes text
);


ALTER TABLE public.users OWNER TO erp_user;

--
-- Name: COLUMN users."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: COLUMN users.username; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.username IS 'Unique username for login';


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.email IS 'User email address';


--
-- Name: COLUMN users.password; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.password IS 'Hashed password';


--
-- Name: COLUMN users."firstName"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."firstName" IS 'User first name';


--
-- Name: COLUMN users."lastName"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."lastName" IS 'User last name';


--
-- Name: COLUMN users."phoneNumber"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."phoneNumber" IS 'User phone number';


--
-- Name: COLUMN users.role; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.role IS 'User role for access control';


--
-- Name: COLUMN users.status; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.status IS 'User account status';


--
-- Name: COLUMN users."lastLoginAt"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."lastLoginAt" IS 'Last login timestamp';


--
-- Name: COLUMN users."lastLoginIp"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."lastLoginIp" IS 'Last login IP address';


--
-- Name: COLUMN users."failedLoginAttempts"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."failedLoginAttempts" IS 'Number of failed login attempts';


--
-- Name: COLUMN users."lockedUntil"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users."lockedUntil" IS 'Account locked until this timestamp';


--
-- Name: COLUMN users.notes; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.users.notes IS 'User profile notes or description';


--
-- Name: vendor_payments; Type: TABLE; Schema: public; Owner: erp_user
--

CREATE TABLE public.vendor_payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "paymentNumber" character varying(50) NOT NULL,
    "supplierId" uuid NOT NULL,
    "purchaseOrderId" uuid,
    "grnId" uuid,
    amount numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "paymentDate" date NOT NULL,
    "paymentMethod" character varying(50) NOT NULL,
    "referenceNumber" character varying(100),
    notes text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL
);


ALTER TABLE public.vendor_payments OWNER TO erp_user;

--
-- Name: COLUMN vendor_payments."isActive"; Type: COMMENT; Schema: public; Owner: erp_user
--

COMMENT ON COLUMN public.vendor_payments."isActive" IS 'Soft delete flag for performance queries';


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.categories (id, "createdAt", "updatedAt", "deletedAt", "isActive", name, path, level, "parentId") FROM stdin;
add8c93e-54a8-4781-b8c5-ce7a151e64f7	2025-10-30 16:52:39.767352+00	2025-10-30 16:52:39.767352+00	\N	t	test	test	0	\N
2e49c0a0-4ff0-40ce-b91b-f4fbdf82b397	2025-11-04 13:47:50.472761+00	2025-11-04 13:47:50.472761+00	\N	t	Category C	Category C	0	\N
67df908f-1cd6-4776-bc0e-a801f0f3a627	2025-11-04 13:47:56.04295+00	2025-11-04 13:47:56.04295+00	\N	t	Category A	Category A	0	\N
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.company_settings (id, "createdAt", "updatedAt", "deletedAt", "isActive", name, address, city, state, "postalCode", country, phone, email, website, "miscInfo", "logoUrl") FROM stdin;
fc1fa63f-92ba-4461-9324-1824939fe102	2025-11-26 18:19:55.188019+00	2025-12-04 13:42:14.827014+00	\N	t	MF Hobby Trading	Pangsapuri Harmoni 1, Putra Heights	Subang Jaya	Selangor	47650	Malaysia	019-353 2547	mfhobbytrading@gmail.com	https://mfhobby.com		/uploads/logos/logo-1764342963058-751847709.webp
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.customers (id, "createdAt", "updatedAt", "deletedAt", "isActive", type, name, phone, "totalSales", "totalOrders", "lastPurchaseDate", "firstPurchaseDate", notes, "pricingScheme", "streetAddress", city, state, "postalCode", country) FROM stdin;
7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	2025-12-01 15:30:42.22576+00	2025-12-20 04:04:19.616744+00	\N	t	business	Customer	111111111	1054.9000	16	2025-12-19 15:08:59.744+00	2025-12-03 16:58:14.034+00	\N	Shopee	aaaaaaaaaaaaaa	31313	13131	31313	1313
971419dd-ef63-426f-b866-908d529f87dc	2025-10-30 17:14:17.398553+00	2025-12-08 14:46:55.039817+00	\N	t	business	test	\N	5890.5000	16	2025-12-08 14:46:55.036+00	2025-10-30 18:18:41.171+00	\N	Retail	\N	\N	\N	\N	\N
\.


--
-- Data for Name: goods_received_note_items; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.goods_received_note_items (id, "createdAt", "updatedAt", "deletedAt", "isActive", "lineNumber", "orderedQuantity", "receivedQuantity", "grnId", "productId", "purchaseOrderItemId") FROM stdin;
bf4fe6ab-a332-4a73-ba21-8444b203e62d	2025-12-16 18:01:26.248898+00	2025-12-16 18:01:26.248898+00	\N	t	1	1.0000	0.0000	5d7f42f7-6d33-48d9-8a29-96fd605ae124	85294f77-4e65-4c4d-9c48-173ed37712cb	859fe827-ec0f-440a-8cb9-2e6ce7ef234f
66c7cbd8-6ab6-4a7b-bc15-3283ea384d21	2025-12-16 18:02:52.282707+00	2025-12-16 18:02:52.282707+00	\N	t	1	1.0000	0.0000	d7ee09b8-9f57-471a-b2bb-ebff4b098392	85294f77-4e65-4c4d-9c48-173ed37712cb	07995340-a7b0-4bc3-b8d1-74f2ce87d5c9
947a16b1-9524-4e98-8cb9-601ca0b1b98c	2025-10-30 17:58:35.735792+00	2025-10-30 18:31:23.810055+00	\N	t	1	123.0000	123.0000	50541070-2445-42db-bb28-af311556309e	85294f77-4e65-4c4d-9c48-173ed37712cb	2f5f04df-b269-4662-967a-8e436b4db504
8eac73fc-0f38-4ed8-93d2-a906fd0a1d46	2025-10-30 17:58:35.735792+00	2025-10-30 18:31:23.810055+00	\N	t	2	147.0000	147.0000	50541070-2445-42db-bb28-af311556309e	c07169f3-7a34-4909-b07c-9a4d71751d3b	c3440675-e63b-4009-8fd3-7020d51df6e0
2d8fba11-ec34-4edf-ac1e-88bdac310527	2025-10-30 18:19:31.681258+00	2025-10-30 18:31:56.574672+00	\N	t	1	56.0000	56.0000	1a637c5e-8a5a-48fc-a42b-c743e0337843	85294f77-4e65-4c4d-9c48-173ed37712cb	598b3aff-89ac-4fa1-a053-25f9600c37c8
c2bef2d2-acc0-4c7c-8b21-511b903b55fa	2025-10-30 18:19:31.681258+00	2025-10-30 18:31:56.574672+00	\N	t	2	55.0000	55.0000	1a637c5e-8a5a-48fc-a42b-c743e0337843	c07169f3-7a34-4909-b07c-9a4d71751d3b	d0118cf0-7a15-46dd-9bcb-a130428b3ca7
55d82f7c-3a1e-4235-90c8-64234e094c0d	2025-12-17 14:28:19.655165+00	2025-12-17 14:28:19.655165+00	\N	t	1	1.0000	0.0000	519d7549-a1ea-482d-94d8-b8bc59ae2e8a	85294f77-4e65-4c4d-9c48-173ed37712cb	eb2c26c4-0587-4b76-95be-cea648493362
6d80bedd-9736-4a57-8302-9fe460d2cfa8	2025-12-17 14:28:41.908659+00	2025-12-17 14:28:41.908659+00	\N	t	1	1.0000	0.0000	5a51deec-c835-423b-a6b8-c98020ecce8a	c07169f3-7a34-4909-b07c-9a4d71751d3b	5b22ac44-9283-41a1-82ef-d8a2ffc26936
cc7f81b6-5c42-479d-9e84-4f426e64f1cd	2025-10-30 19:03:43.250377+00	2025-10-30 19:03:58.06848+00	\N	t	1	1.0000	1.0000	88254a61-6bae-475d-9427-92dbd0dc1e8d	85294f77-4e65-4c4d-9c48-173ed37712cb	e0db5571-99c0-44ea-b8a2-2ccc3c981ea3
5904d4de-2146-4707-857b-0887060ccbfb	2025-12-17 14:29:37.101796+00	2025-12-17 14:29:37.101796+00	\N	t	1	1.0000	0.0000	33096c3b-2b77-46e8-9c15-baa3da986e81	85294f77-4e65-4c4d-9c48-173ed37712cb	ea02384e-550a-45a8-bd57-0e865c37e573
a91d678f-8cf8-4a8f-aa2b-cc9c23403347	2025-12-17 14:38:45.246029+00	2025-12-17 14:38:45.246029+00	\N	t	1	1.0000	0.0000	69b63e21-125a-42a5-8b71-ee0c81301cd6	53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0	449a51bb-5413-47cd-bdaf-a01c365cd750
78dac1e5-1672-44cc-8161-db5727465e1c	2025-10-30 18:34:03.976023+00	2025-11-01 15:56:41.466313+00	\N	t	1	152.0000	152.0000	961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	85294f77-4e65-4c4d-9c48-173ed37712cb	e8618f80-0867-41c2-a9d1-037ceb3a6ad0
d17a05bc-2973-4c6f-97cd-62a445492eca	2025-10-30 18:34:03.976023+00	2025-11-01 15:56:41.466313+00	\N	t	2	152.0000	152.0000	961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	c07169f3-7a34-4909-b07c-9a4d71751d3b	6fc83a76-b81a-480e-a781-aa9b2630c53a
40bb9d0b-0c3c-4c13-9250-5c1f651a48fd	2025-11-05 16:24:59.098284+00	2025-11-05 16:25:02.695351+00	\N	t	1	100.0000	100.0000	5b1a4f3c-391f-46b3-b1fc-5e393d9146bd	a6f3f2b7-f292-408b-912d-f613e31e179c	c633d659-6cf3-4c0f-a44e-fe90efd76fa6
dec7f9b2-d930-4090-a374-aeae0ddbcfed	2025-12-17 14:54:23.776195+00	2025-12-17 14:54:23.776195+00	\N	t	1	1.0000	0.0000	2fc3f020-8ad3-4386-a9cf-dd53db617eb1	85294f77-4e65-4c4d-9c48-173ed37712cb	4b21e0a3-5353-48df-8f49-2accb5799cf8
152bf2a8-b061-4c71-a764-f973e440958f	2025-12-17 15:02:37.02709+00	2025-12-17 15:02:37.02709+00	\N	t	1	1.0000	0.0000	2b846455-901e-4a7d-9dad-2752ebd384cc	85294f77-4e65-4c4d-9c48-173ed37712cb	253707fa-7bef-40a2-914d-10dca750b9cd
2d3ca645-ee0b-4d6d-b0b6-e9d32d2fd847	2025-11-20 14:24:17.908492+00	2025-11-21 13:13:11.808719+00	\N	t	1	100.0000	100.0000	95fc8d7d-cfd0-41c7-938a-6d85bfb73a77	85294f77-4e65-4c4d-9c48-173ed37712cb	4e4eb42c-a49e-444c-9fec-4b4dbcc0a3db
80b1c90d-d419-43fa-aaa8-39898d8a86e9	2025-12-17 15:40:33.120328+00	2025-12-17 15:40:33.120328+00	\N	t	1	1.0000	0.0000	e6304a67-818c-4f07-ac75-10ac92bf524c	85294f77-4e65-4c4d-9c48-173ed37712cb	edb96414-10fc-49de-bcb4-00bb4452d140
9a598cec-ad99-40e9-ae3e-9e7a27f6f199	2025-12-19 16:55:35.303175+00	2025-12-19 16:55:35.303175+00	\N	t	1	1.0000	0.0000	a96fbd0a-7518-4973-a912-fe36001f5a24	85294f77-4e65-4c4d-9c48-173ed37712cb	14fd0d08-254b-4211-8b11-80ea46d91218
c689df55-15cb-4c07-b700-820bc74f1366	2025-11-22 17:52:33.080933+00	2025-12-16 11:57:34.79474+00	\N	t	1	1.0000	0.0000	dcdd3361-dd54-4f8e-85cb-d7f4aa254474	85294f77-4e65-4c4d-9c48-173ed37712cb	14d6c22e-6240-4e6b-9ff2-eaa328465402
67bb1755-ba6e-4389-8955-53330a992757	2025-12-16 13:51:42.416128+00	2025-12-16 13:51:42.416128+00	\N	t	1	1.0000	0.0000	cba00cee-5d33-46e0-9ff3-44dfd64be310	85294f77-4e65-4c4d-9c48-173ed37712cb	119a13ae-2331-41b0-88d6-b96f84a29efd
f19de9c8-e2dc-48df-938e-8f79f55d85bf	2025-12-16 14:49:58.099741+00	2025-12-16 14:49:58.099741+00	\N	t	1	1.0000	0.0000	93d09a39-e841-409d-847d-6aa3a7e99b66	85294f77-4e65-4c4d-9c48-173ed37712cb	b9fe5b21-a294-4b98-8dac-fdd8e1b7c20b
e113f71a-4415-42e0-a5f0-deb48ca421ac	2025-12-16 15:01:44.567095+00	2025-12-16 15:01:44.567095+00	\N	t	1	1.0000	0.0000	ba4e8f16-1484-4bb3-87d3-0570cbaee699	85294f77-4e65-4c4d-9c48-173ed37712cb	66a84880-bad9-42f8-a975-8c6eea2fbfd1
\.


--
-- Data for Name: goods_received_notes; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.goods_received_notes (id, "createdAt", "updatedAt", "deletedAt", "isActive", "grnNumber", status, "receivedDate", "totalQuantityReceived", "purchaseOrderId", "supplierId") FROM stdin;
50541070-2445-42db-bb28-af311556309e	2025-10-30 17:58:35.72833+00	2025-10-30 18:31:23.838667+00	\N	t	GRN-000001	received	2025-10-30	270.0000	371b1cad-adf6-4746-849a-1b6be96305df	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
1a637c5e-8a5a-48fc-a42b-c743e0337843	2025-10-30 18:19:31.671565+00	2025-10-30 18:31:56.598607+00	\N	t	GRN-000002	received	2025-10-30	111.0000	84d7962e-94fd-4337-89fb-9c835e19916c	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
88254a61-6bae-475d-9427-92dbd0dc1e8d	2025-10-30 19:03:43.236394+00	2025-10-30 19:03:58.12148+00	\N	t	GRN-000004	received	2025-10-30	1.0000	b5e5c15b-d8b0-47d0-9a78-877d1591f79d	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	2025-10-30 18:34:03.967569+00	2025-11-01 15:56:41.489034+00	\N	t	GRN-000003	received	2025-10-30	304.0000	187fc444-db2d-4934-83a5-37c61a41dd4c	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
5b1a4f3c-391f-46b3-b1fc-5e393d9146bd	2025-11-05 16:24:59.085642+00	2025-11-05 16:25:02.725036+00	\N	t	GRN-000005	received	2025-11-05	100.0000	c30213d1-3a6e-4001-b6db-1d49705fe2cf	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
95fc8d7d-cfd0-41c7-938a-6d85bfb73a77	2025-11-20 14:24:17.898015+00	2025-11-21 13:13:11.834773+00	\N	t	GRN-000006	received	2025-11-20	100.0000	0db8893f-d848-4813-b7dd-a8e65f4e9f7d	33fcda59-4698-4131-a681-fd610d212a96
dcdd3361-dd54-4f8e-85cb-d7f4aa254474	2025-11-21 17:51:22.944766+00	2025-12-16 11:57:34.835908+00	\N	t	GRN-000007	draft	2025-11-22	0.0000	13f7cccc-ce32-49f7-a758-0fcd6c1b8506	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
cba00cee-5d33-46e0-9ff3-44dfd64be310	2025-12-16 13:51:42.404893+00	2025-12-16 13:51:42.404893+00	\N	t	GRN-000008	draft	2025-12-16	0.0000	17f1b2a1-fe99-4843-8693-a48ed90113a2	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
93d09a39-e841-409d-847d-6aa3a7e99b66	2025-12-16 14:49:58.087197+00	2025-12-16 14:49:58.087197+00	\N	t	GRN-000009	draft	2025-12-16	0.0000	81bbad6f-bb7a-4c16-9784-b12013281cea	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
ba4e8f16-1484-4bb3-87d3-0570cbaee699	2025-12-16 15:01:44.559604+00	2025-12-16 15:01:44.559604+00	\N	t	GRN-000010	draft	2025-12-16	0.0000	854e9e99-7045-4459-90e5-b4c0a8956d91	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
5d7f42f7-6d33-48d9-8a29-96fd605ae124	2025-12-16 18:01:26.237884+00	2025-12-16 18:01:26.237884+00	\N	t	GRN-000011	draft	2025-12-17	0.0000	87ffa09e-fa46-4621-9db5-b72f1fee8746	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
d7ee09b8-9f57-471a-b2bb-ebff4b098392	2025-12-16 18:02:52.270637+00	2025-12-16 18:02:52.270637+00	\N	t	GRN-000012	draft	2025-12-17	0.0000	748f77f6-1a0e-4e9c-b98c-e538f0bad6cd	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
519d7549-a1ea-482d-94d8-b8bc59ae2e8a	2025-12-17 14:28:19.643403+00	2025-12-17 14:28:19.643403+00	\N	t	GRN-000013	draft	2025-12-17	0.0000	4013e391-9e3a-4b07-ad46-000a9f29ea94	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
5a51deec-c835-423b-a6b8-c98020ecce8a	2025-12-17 14:28:41.901617+00	2025-12-17 14:28:41.901617+00	\N	t	GRN-000014	draft	2025-12-17	0.0000	77ecde84-02ae-4371-bd6b-4ebc898712d9	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
33096c3b-2b77-46e8-9c15-baa3da986e81	2025-12-17 14:29:37.094684+00	2025-12-17 14:29:37.094684+00	\N	t	GRN-000015	draft	2025-12-17	0.0000	51dac0f6-e755-4ea0-80c6-f85e91986831	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
69b63e21-125a-42a5-8b71-ee0c81301cd6	2025-12-17 14:38:45.232849+00	2025-12-17 14:38:45.232849+00	\N	t	GRN-000016	draft	2025-12-17	0.0000	983681ef-0bb3-433a-9c98-6a8bbdade071	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
2fc3f020-8ad3-4386-a9cf-dd53db617eb1	2025-12-17 14:54:23.767351+00	2025-12-17 14:54:23.767351+00	\N	t	GRN-000017	draft	2025-12-17	0.0000	3bc9e4e5-9805-453e-9a42-61a169baebb2	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
2b846455-901e-4a7d-9dad-2752ebd384cc	2025-12-17 15:02:37.020356+00	2025-12-17 15:02:37.020356+00	\N	t	GRN-000018	draft	2025-12-17	0.0000	baf4ab47-be8a-450c-9562-ef0ecc7ebdd5	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
e6304a67-818c-4f07-ac75-10ac92bf524c	2025-12-17 15:22:26.721162+00	2025-12-17 15:40:33.149561+00	\N	t	GRN-000019	draft	2025-12-17	0.0000	a0e19891-7f00-4cb5-89dd-6e664f218c0e	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
a96fbd0a-7518-4973-a912-fe36001f5a24	2025-12-19 16:55:35.292081+00	2025-12-19 16:55:35.292081+00	\N	t	GRN-000020	draft	2025-12-20	0.0000	b6b0e2f0-0dd4-47a8-828f-3c86a6909d31	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.invoice_items (id, "createdAt", "updatedAt", "deletedAt", "isActive", "lineNumber", quantity, "unitPrice", discount, "totalAmount", "invoiceId", "productId", "discountType", "discountPercent") FROM stdin;
3e5613b4-c5f9-446a-9224-bdd68cf459a1	2025-10-30 18:18:41.203795+00	2025-10-30 18:18:41.203795+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	d50464d5-9270-497c-8f8c-deaf5b52f864	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
c14a8bb1-fd59-4b29-a654-ca2bab7b5b11	2025-10-30 18:18:41.203795+00	2025-10-30 18:18:41.203795+00	\N	t	2	1.0000	20.0000	0.0000	20.0000	d50464d5-9270-497c-8f8c-deaf5b52f864	c07169f3-7a34-4909-b07c-9a4d71751d3b	percentage	0.00
7d77a70d-a1c9-4256-a234-d58de5bfa5f1	2025-10-30 19:03:26.899353+00	2025-10-30 19:03:26.899353+00	\N	t	1	178.0000	20.0000	0.0000	3560.0000	6fc8bdd0-22cb-4625-8cb9-d69ddb5cad5c	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
c0e50230-85ec-499f-a139-594ea879275a	2025-11-05 16:25:37.229712+00	2025-11-05 16:25:37.229712+00	\N	t	1	100.0000	20.0000	0.0000	2000.0000	06601412-70e9-4e21-ae82-bec828bb2412	a6f3f2b7-f292-408b-912d-f613e31e179c	percentage	0.00
02001b63-3f52-4363-80e9-9072a9491fc5	2025-11-08 18:09:30.794091+00	2025-11-08 18:09:30.794091+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	168c10f2-ba72-4cc6-ad01-e5fba95e266b	53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0	percentage	0.00
cc1c5403-0cb7-4de6-92e9-dfd3da005add	2025-11-21 17:18:45.436243+00	2025-11-21 17:18:45.436243+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	f742768e-1ad1-408e-963c-9303cf25f338	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
f98c327b-7816-4219-8e3e-196fe05b1812	2025-11-21 17:27:46.362704+00	2025-11-21 17:27:46.362704+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	a75f29b5-7adf-4731-98ba-0c7d9db251f7	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
c25b789c-fad3-4bec-967c-b773a8af9b12	2025-11-21 17:50:57.802034+00	2025-11-21 17:50:57.802034+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	ecf4bc32-7102-434c-83ed-5d5aa2f15c1d	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
e4ddffda-d52a-4577-a3c1-33e6c0e19fe1	2025-11-25 16:15:07.792992+00	2025-11-25 16:15:07.792992+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	394511cb-316f-4ddb-9bbc-0618c55ea2f4	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
d48c59e7-c403-4757-af77-8edd3d5fd94b	2025-11-25 16:20:00.547204+00	2025-11-25 16:20:00.547204+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	2efb09eb-f366-4200-a14b-23aab4ea6aca	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
02bda60e-ea43-489e-a884-62c7124e4a2e	2025-11-25 16:26:16.759652+00	2025-11-25 16:26:16.759652+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	203472cd-16a9-4c63-aae3-846d65937edf	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
591c1201-a2f7-49f8-8b72-005009d33ab2	2025-11-25 16:28:51.173005+00	2025-11-25 16:28:51.173005+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	55318bde-8f0e-4302-acd5-08dc89903336	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
0c14f317-892c-4a56-a675-a89e227d5c0d	2025-11-25 16:45:54.48454+00	2025-11-25 16:45:54.48454+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	1fc16a83-a41f-41c9-8768-14082dc7d587	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
f45c7d05-f0fc-4fa3-baf3-473908dfb5da	2025-11-25 16:53:02.15234+00	2025-11-25 16:53:02.15234+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	c1a51036-a408-4769-8264-5ea7615478e3	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
26c2918d-09f4-4763-8d33-2bc396c7240c	2025-11-25 17:04:11.38327+00	2025-11-25 17:04:11.38327+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	7e571d18-b7d6-407d-8783-c6525b01254e	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
a93f6778-da2b-43ad-806f-1cb91c7ed299	2025-11-26 17:07:37.892251+00	2025-11-26 17:07:37.892251+00	\N	t	1	1.0000	20.0000	0.0000	20.0000	f265e677-72f3-4b42-bf45-a09def0262d9	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
42711143-2ffd-4dbc-8559-5e609ce5623b	2025-12-03 16:58:14.078407+00	2025-12-03 16:58:14.078407+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	94dcd63a-a871-4567-8bad-8fd7e366e784	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
a89391f6-017c-4486-9fd6-1dc7be616173	2025-12-05 18:51:14.175372+00	2025-12-05 18:51:14.175372+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	96424a72-cac8-4dda-be9a-9a33052d3e2d	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
fe2ba730-91d3-4eb7-944a-6bd854db4bd1	2025-12-05 19:06:34.855649+00	2025-12-05 19:06:34.855649+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	8e57b38a-fa38-4596-9975-d988f244571b	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
9efb33df-695c-43ec-914f-819d311319be	2025-12-05 19:12:00.320309+00	2025-12-05 19:12:00.320309+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	94782242-8bba-4766-a18f-482ea71317d2	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
44c909b2-e85d-4876-b3a7-48c37e927086	2025-12-16 13:52:09.361511+00	2025-12-16 13:52:09.361511+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	b336b873-9e67-42e3-ac10-6987912e7c07	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
0f2bfadb-2232-4f07-950c-5123160e085d	2025-12-08 13:45:28.250297+00	2025-12-08 13:45:28.250297+00	\N	t	1	2.0000	40.6000	8.1200	73.0800	3741cb94-0acd-468f-9f0f-70bb4fa822d6	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	10.00
ae0099e5-309a-4946-ba7e-d95e730d87d1	2025-12-08 13:45:28.250297+00	2025-12-08 13:45:28.250297+00	\N	t	2	2.0000	30.0000	0.0000	60.0000	3741cb94-0acd-468f-9f0f-70bb4fa822d6	c07169f3-7a34-4909-b07c-9a4d71751d3b	percentage	0.00
e5fcb31a-d258-4017-a3c0-bd1dfe445085	2025-12-08 14:29:24.983748+00	2025-12-08 14:29:24.983748+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	673dff3e-d23e-4135-bcb3-ed4c73a6475a	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
5b8547b8-7689-406b-9e15-df8dceadd793	2025-12-08 14:46:05.906758+00	2025-12-08 14:46:05.906758+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	b49dd9ee-8bd9-4a34-9145-e6aaa3586558	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
a40d30d5-2f7e-4498-a6ec-e55cd732ba65	2025-12-08 14:46:55.0658+00	2025-12-08 14:46:55.0658+00	\N	t	1	1.0000	30.5000	0.0000	30.5000	9b06f609-b3e0-42c1-8c6c-8342e1a34314	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
c4da269e-acf3-4756-a80b-e7b76f8e5a69	2025-12-08 14:53:22.732863+00	2025-12-08 14:53:22.732863+00	\N	t	1	2.0000	40.6000	0.0000	81.2000	1bb83ec6-1836-4d9d-a995-f07092303d77	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
512e6aaf-22b0-44c4-92fe-f1f5633424dc	2025-12-08 14:59:42.516478+00	2025-12-08 14:59:42.516478+00	\N	t	1	3.0000	40.6000	0.0000	121.8000	02362382-b9b8-4c62-bad1-07e6c69466b5	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
ea995a17-5d63-4bd9-aa02-49e69e666072	2025-12-12 14:58:56.697185+00	2025-12-12 14:58:56.697185+00	\N	t	1	5.0000	40.6000	20.3000	182.7000	92fd2758-f62e-41ae-8959-f1296995cbe1	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	10.00
1cae2906-4afd-4e0c-8c40-c355a7fabed3	2025-12-12 16:31:48.587934+00	2025-12-12 16:31:48.587934+00	\N	t	1	1.0000	40.6000	4.0600	36.5400	acf24c31-5442-4523-82ea-1e38931eef7b	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	10.00
c6b89b1a-0c28-44bf-80ab-3ab902655d29	2025-12-12 16:53:27.476653+00	2025-12-12 16:53:27.476653+00	\N	t	1	1.0000	40.6000	8.1200	32.4800	286c45db-e56a-483d-b4d6-23501e964ecd	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	20.00
52561a41-0837-4ed8-a036-b8295bbdf031	2025-12-12 17:13:37.945536+00	2025-12-12 17:13:37.945536+00	\N	t	1	1.0000	30.0000	0.0000	30.0000	71d527bf-baf0-4766-8148-06438357801e	c07169f3-7a34-4909-b07c-9a4d71751d3b	percentage	0.00
727542be-2d32-4808-887d-24831706e93c	2025-12-14 17:30:45.64839+00	2025-12-14 17:30:45.64839+00	\N	t	1	1.0000	40.6000	4.0600	36.5400	0568884f-04f6-4045-98d4-4706bda1ad8a	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	10.00
1b8ba148-ebed-4a46-96e1-2528f003278f	2025-12-19 15:08:59.796888+00	2025-12-19 15:08:59.796888+00	\N	t	1	1.0000	40.6000	0.0000	40.6000	c19c8886-1212-49dc-9349-d1985a18d267	85294f77-4e65-4c4d-9c48-173ed37712cb	percentage	0.00
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.invoices (id, "createdAt", "updatedAt", "deletedAt", "isActive", "invoiceNumber", status, "invoiceDate", "paidDate", "totalAmount", "paidAmount", "balanceDue", "customerId", "salesOrderId", notes, "shippingAmount") FROM stdin;
f265e677-72f3-4b42-bf45-a09def0262d9	2025-11-26 17:07:37.883555+00	2025-11-26 17:07:37.883555+00	\N	t	INV-000015	draft	2025-11-27	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	6e9c92ac-7f21-4988-90c4-87231b55dccb	\N	0.0000
94dcd63a-a871-4567-8bad-8fd7e366e784	2025-12-03 16:58:14.063714+00	2025-12-03 16:58:14.063714+00	\N	t	INV-000016	draft	2025-12-04	\N	40.6000	0.0000	40.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	fe1ddc33-a55f-46ec-9cf9-9d717961ae80	\N	0.0000
96424a72-cac8-4dda-be9a-9a33052d3e2d	2025-12-05 18:51:14.159456+00	2025-12-05 18:51:14.159456+00	\N	t	INV-000017	draft	2025-12-06	\N	50.6000	0.0000	50.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	cf175be3-6870-4f9c-a06e-8d3b65e06f6a	\N	0.0000
8e57b38a-fa38-4596-9975-d988f244571b	2025-12-05 19:06:07.322721+00	2025-12-05 19:06:34.87609+00	\N	t	INV-000018	draft	2025-12-06	\N	50.6000	0.0000	50.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	4b9c09dc-d419-41c0-9f01-0b71ca1b750a	\N	0.0000
94782242-8bba-4766-a18f-482ea71317d2	2025-12-05 19:12:00.291475+00	2025-12-05 19:12:00.291475+00	\N	t	INV-000019	draft	2025-12-06	\N	40.6000	0.0000	40.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	b8c561c9-d3d5-4213-87d7-e5da8555bb2b	\N	0.0000
168c10f2-ba72-4cc6-ad01-e5fba95e266b	2025-11-08 18:09:30.782963+00	2025-11-21 13:53:18.088597+00	\N	t	INV-000004	paid	2025-11-08	2025-11-20	20.0000	20.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	ef413e59-8b2b-4311-8e11-fa70ddf7d669	\N	0.0000
f742768e-1ad1-408e-963c-9303cf25f338	2025-11-21 17:18:45.425449+00	2025-11-21 17:18:46.743966+00	\N	t	INV-000005	paid	2025-11-21	2025-11-21	20.0000	20.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	6c0b72ad-8415-479d-b8e6-fc2d62c767a4	\N	0.0000
92fd2758-f62e-41ae-8959-f1296995cbe1	2025-12-08 15:07:13.041149+00	2025-12-12 14:58:59.952555+00	\N	t	INV-000026	paid	2025-12-08	2025-12-12	212.7000	212.7000	0.0000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	b78cc725-7eb6-443a-9b2a-783c4cdaca40	\N	30.0000
acf24c31-5442-4523-82ea-1e38931eef7b	2025-12-12 16:31:48.575677+00	2025-12-12 16:31:48.575677+00	\N	t	INV-000027	draft	2025-12-13	\N	66.5400	0.0000	66.5400	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	595f87b4-66c4-4479-9968-282d7556280f	\N	30.0000
286c45db-e56a-483d-b4d6-23501e964ecd	2025-12-12 16:53:27.465301+00	2025-12-12 16:53:27.465301+00	\N	t	INV-000028	draft	2025-12-13	\N	44.4800	0.0000	44.4800	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	73aa9b16-f310-4a50-97ee-513a5789cd7e	\N	12.0000
71d527bf-baf0-4766-8148-06438357801e	2025-12-12 17:13:37.933867+00	2025-12-12 17:13:37.933867+00	\N	t	INV-000029	draft	2025-12-13	\N	30.0000	0.0000	30.0000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	6192fa67-76a5-4aad-ab28-4241cb65ddf3	\N	0.0000
0568884f-04f6-4045-98d4-4706bda1ad8a	2025-12-14 17:30:45.637239+00	2025-12-14 18:21:18.667245+00	\N	t	INV-000030	paid	2025-12-15	2025-12-15	46.5400	46.5400	0.0000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	d5ccd664-a937-4325-a136-df36fe07b91c	\N	10.0000
a75f29b5-7adf-4731-98ba-0c7d9db251f7	2025-11-21 17:27:46.351465+00	2025-11-21 17:27:47.63299+00	\N	t	INV-000006	paid	2025-11-21	2025-11-21	20.0000	20.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	c66d7700-aca7-4dea-bd44-40fa9062c1ff	\N	0.0000
b336b873-9e67-42e3-ac10-6987912e7c07	2025-12-16 13:52:09.346105+00	2025-12-16 13:52:12.792881+00	\N	t	INV-000031	partial_paid	2025-12-16	\N	40.6000	10.0000	30.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	6bd03bc4-6da6-43c8-997f-5dabc11fc0e8	\N	0.0000
3741cb94-0acd-468f-9f0f-70bb4fa822d6	2025-12-05 19:17:53.104394+00	2025-12-08 13:45:30.593906+00	\N	t	INV-000020	paid	2025-12-06	2025-12-06	143.0800	143.0800	0.0000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	db2d9a22-ee56-48f3-b9d1-329a1fa2b29f	Notes and discounts should sync perfectly fadfa	0.0000
673dff3e-d23e-4135-bcb3-ed4c73a6475a	2025-12-08 14:29:24.971616+00	2025-12-08 14:29:24.971616+00	\N	t	INV-000021	draft	2025-12-08	\N	50.6000	0.0000	50.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	d2958cc5-4bb0-4050-aa1a-02b9416a1d88	\N	10.0000
b49dd9ee-8bd9-4a34-9145-e6aaa3586558	2025-12-08 14:46:05.895891+00	2025-12-08 14:46:05.895891+00	\N	t	INV-000022	draft	2025-12-08	\N	50.6000	0.0000	50.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	03dd9cba-83ee-400e-a797-aedeffaacca9	\N	10.0000
d50464d5-9270-497c-8f8c-deaf5b52f864	2025-10-30 18:18:41.193445+00	2025-10-30 18:34:29.648859+00	\N	t	INV-000001	paid	2025-10-30	2025-10-30	40.0000	40.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	c9b2867c-9294-407c-bdec-2fb51c52119c	\N	0.0000
9b06f609-b3e0-42c1-8c6c-8342e1a34314	2025-12-08 14:46:55.057898+00	2025-12-08 14:46:55.057898+00	\N	t	INV-000023	draft	2025-12-08	\N	50.5000	0.0000	50.5000	971419dd-ef63-426f-b866-908d529f87dc	35160db4-5fa4-46fc-ac69-c9022c0fb97b	\N	20.0000
1bb83ec6-1836-4d9d-a995-f07092303d77	2025-12-08 14:53:22.718656+00	2025-12-08 14:53:22.718656+00	\N	t	INV-000024	draft	2025-12-08	\N	91.2000	0.0000	91.2000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	9ad8e271-f986-4c9f-a1ea-a93524d3b60c	\N	10.0000
02362382-b9b8-4c62-bad1-07e6c69466b5	2025-12-08 14:59:42.504188+00	2025-12-08 14:59:42.504188+00	\N	t	INV-000025	draft	2025-12-08	\N	141.8000	0.0000	141.8000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	cb43a1c7-035e-4aac-a8fb-a9d734f15278	\N	20.0000
c19c8886-1212-49dc-9349-d1985a18d267	2025-12-19 15:08:59.784189+00	2025-12-19 15:09:04.761142+00	\N	t	INV-000032	partial_paid	2025-12-19	\N	40.6000	10.0000	30.6000	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	da473492-6459-4142-bf6f-7686bf6fe301	\N	0.0000
6fc8bdd0-22cb-4625-8cb9-d69ddb5cad5c	2025-10-30 19:03:26.883868+00	2025-11-01 14:28:10.54261+00	\N	t	INV-000002	paid	2025-10-30	2025-10-30	3560.0000	3560.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	5c6a8dc0-fcf4-4026-b0a7-967d7c5cda18	\N	0.0000
06601412-70e9-4e21-ae82-bec828bb2412	2025-11-05 16:25:37.218593+00	2025-11-06 12:59:29.309857+00	\N	t	INV-000003	paid	2025-11-05	2025-11-05	2000.0000	2000.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	21511ddf-f02b-4599-8c43-0dc827b9260b	\N	0.0000
ecf4bc32-7102-434c-83ed-5d5aa2f15c1d	2025-11-21 17:50:57.790792+00	2025-11-21 17:50:59.048373+00	\N	t	INV-000007	paid	2025-11-22	2025-11-22	20.0000	20.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	26589ef1-0651-4d5b-9ddf-1e30afccc701	\N	0.0000
394511cb-316f-4ddb-9bbc-0618c55ea2f4	2025-11-25 16:15:07.782359+00	2025-11-25 16:15:07.782359+00	\N	t	INV-000008	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	\N	\N	0.0000
2efb09eb-f366-4200-a14b-23aab4ea6aca	2025-11-25 16:20:00.536686+00	2025-11-25 16:20:00.536686+00	\N	t	INV-000009	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	\N	\N	0.0000
203472cd-16a9-4c63-aae3-846d65937edf	2025-11-25 16:26:16.75101+00	2025-11-25 16:26:16.75101+00	\N	t	INV-000010	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	a88e91ad-65a5-4860-bbfa-a121107684ca	\N	0.0000
55318bde-8f0e-4302-acd5-08dc89903336	2025-11-25 16:28:51.163567+00	2025-11-25 16:28:51.163567+00	\N	t	INV-000011	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	af743882-4fec-4243-ba87-e6dd914458d9	\N	0.0000
1fc16a83-a41f-41c9-8768-14082dc7d587	2025-11-25 16:45:54.473264+00	2025-11-25 16:45:54.473264+00	\N	t	INV-000012	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	fd4a8b16-97ac-4105-9040-b093f443d05c	\N	0.0000
c1a51036-a408-4769-8264-5ea7615478e3	2025-11-25 16:53:02.143717+00	2025-11-25 16:53:02.143717+00	\N	t	INV-000013	draft	2025-11-25	\N	20.0000	0.0000	20.0000	971419dd-ef63-426f-b866-908d529f87dc	fd105234-4664-4a6c-a8c9-5e1059c60c3b	\N	0.0000
7e571d18-b7d6-407d-8783-c6525b01254e	2025-11-25 17:04:11.373422+00	2025-11-25 17:04:13.165729+00	\N	t	INV-000014	paid	2025-11-26	2025-11-26	20.0000	20.0000	0.0000	971419dd-ef63-426f-b866-908d529f87dc	c7d24068-6867-4b8b-aa87-1378dcb9f67d	\N	0.0000
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	1730102400000	AddSaleReversalMovementType1730102400000
2	1733107200000	RemoveUnusedCustomerFields1733107200000
3	1763655506861	RemoveCategorySortOrder1763655506861
5	1732189200000	RemoveUnusedPurchaseOrderFields1732189200000
6	1732189300000	RemoveDeliveryTermsAndMetadata1732189300000
7	1732500000000	RemoveUnusedSalesOrderItemFields1732500000000
8	1732196400000	RemoveSalesOrderFields1732196400000
9	1732302000000	RemoveAdjustedByUserIdFromStockAdjustments1732302000000
10	1732550000000	RemoveStockMovementColumns1732550000000
11	1732650000000	RemoveReferenceNumberFromStockMovements1732650000000
12	1732750000000	SetTimezoneToAsiaKualaLumpur1732750000000
13	1732850000000	RemoveUnusedSupplierFields1732850000000
14	1732538917000	CreateSettingsTable1732538917000
15	1732700000000	AddSettingsTables1732700000000
16	1733173200000	RemoveUnusedBusinessSettings1733173200000
17	1764178800000	RemoveSettingsTables1764178800000
18	1764279000000	CreateCompanySettings1764279000000
19	1733227200000	MigrateLegacyPricingToTiers1733227200000
20	1764580000000	CreatePrintSettings1764580000000
21	1733520000000	AddDiscountTypeAndPercentToInvoiceItems1733520000000
23	1764480000000	LinkPricingSettingsToModules1764480000000
24	1764580000001	ConsolidatePrintSettings1764580000001
27	1765202591252	AddShippingToInvoices1765202591252
30	1734310000000	AddAddressFieldsToSuppliers1734310000000
31	1734342000000	AddPaidAmountToPurchaseOrder1734342000000
32	1764380000000	CreatePriceCostingSettings1764380000000
33	1764680000000	AddAddressFieldsToPrintSettings1764680000000
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.payments (id, "createdAt", "updatedAt", "deletedAt", "isActive", "paymentNumber", status, "paymentMethod", "paymentDate", amount, notes, "customerId", "invoiceId") FROM stdin;
689f676f-b6f4-4453-848f-45c10ffec87e	2025-10-30 18:34:29.664811+00	2025-10-30 18:34:29.664811+00	\N	t	PAY-000001	completed	cash	2025-10-30	40.0000	Payment recorded for sales order SO-000001 (Invoice: INV-000001)	971419dd-ef63-426f-b866-908d529f87dc	d50464d5-9270-497c-8f8c-deaf5b52f864
efad96ed-29bd-407e-be59-29c20911ca02	2025-11-01 14:28:10.556395+00	2025-11-01 14:28:10.556395+00	\N	t	PAY-000002	completed	cash	2025-11-01	3560.0000	Payment recorded for sales order SO-000002 (Invoice: INV-000002)	971419dd-ef63-426f-b866-908d529f87dc	6fc8bdd0-22cb-4625-8cb9-d69ddb5cad5c
9dafdf27-535d-4493-b093-625de28b3a43	2025-11-06 12:59:29.326808+00	2025-11-06 12:59:29.326808+00	\N	t	PAY-000003	completed	cash	2025-11-06	2000.0000	Payment recorded for sales order SO-000003 (Invoice: INV-000003)	971419dd-ef63-426f-b866-908d529f87dc	06601412-70e9-4e21-ae82-bec828bb2412
f8c6174c-7df7-42d1-bf5a-cdbec3fe0514	2025-11-21 13:53:18.108875+00	2025-11-21 13:53:18.108875+00	\N	t	PAY-000004	completed	cash	2025-11-21	20.0000	Payment recorded for sales order SO-000004 (Invoice: INV-000004)	971419dd-ef63-426f-b866-908d529f87dc	168c10f2-ba72-4cc6-ad01-e5fba95e266b
36764298-17e8-489c-a34d-c935217071c3	2025-11-21 17:18:46.762818+00	2025-11-21 17:18:46.762818+00	\N	t	PAY-000005	completed	cash	2025-11-21	20.0000	Payment recorded for sales order SO-000005 (Invoice: INV-000005)	971419dd-ef63-426f-b866-908d529f87dc	f742768e-1ad1-408e-963c-9303cf25f338
e93fc0c0-aba4-43b5-b645-e0d9a1a2a427	2025-11-21 17:27:47.653225+00	2025-11-21 17:27:47.653225+00	\N	t	PAY-000006	completed	cash	2025-11-21	20.0000	Payment recorded for sales order SO-000006 (Invoice: INV-000006)	971419dd-ef63-426f-b866-908d529f87dc	a75f29b5-7adf-4731-98ba-0c7d9db251f7
347eb774-56ab-4fe9-b785-1c20b17c9c54	2025-11-21 17:50:59.068176+00	2025-11-21 17:50:59.068176+00	\N	t	PAY-000007	completed	cash	2025-11-22	20.0000	Payment recorded for sales order SO-000007 (Invoice: INV-000007)	971419dd-ef63-426f-b866-908d529f87dc	ecf4bc32-7102-434c-83ed-5d5aa2f15c1d
7285ec86-e07a-41ee-87f1-a05ce7962799	2025-11-25 17:04:13.184521+00	2025-11-25 17:04:13.184521+00	\N	t	PAY-000008	completed	cash	2025-11-26	20.0000	Payment recorded for sales order SO-000012 (Invoice: INV-000014)	971419dd-ef63-426f-b866-908d529f87dc	7e571d18-b7d6-407d-8783-c6525b01254e
1d1013f2-47c4-495c-9c48-a999427d172f	2025-12-08 13:45:30.612567+00	2025-12-08 13:45:30.612567+00	\N	t	PAY-000009	completed	cash	2025-12-08	143.0800	Payment recorded for sales order SO-000018 (Invoice: INV-000020)	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	3741cb94-0acd-468f-9f0f-70bb4fa822d6
33ac11a1-e1e5-495b-840f-95b6f054b9aa	2025-12-12 14:58:59.980979+00	2025-12-12 14:58:59.980979+00	\N	t	PAY-000010	completed	cash	2025-12-12	212.7000	Payment recorded for sales order SO-000024 (Invoice: INV-000026)	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	92fd2758-f62e-41ae-8959-f1296995cbe1
65d46422-5f7a-4b87-a89f-65bded328f50	2025-12-14 18:21:18.684765+00	2025-12-14 18:21:18.684765+00	\N	t	PAY-000011	completed	cash	2025-12-15	46.5400	Payment recorded for sales order SO-000028 (Invoice: INV-000030)	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	0568884f-04f6-4045-98d4-4706bda1ad8a
31c1128e-1bfe-4363-b5ea-8954d391fb8b	2025-12-16 13:52:12.809636+00	2025-12-16 13:52:12.809636+00	\N	t	PAY-000012	completed	cash	2025-12-16	10.0000	Payment recorded for sales order SO-000029 (Invoice: INV-000031)	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	b336b873-9e67-42e3-ac10-6987912e7c07
1820f709-a741-4b4e-a637-a4f0b51bb406	2025-12-19 15:09:04.784969+00	2025-12-19 15:09:04.784969+00	\N	t	PAY-000013	completed	cash	2025-12-19	10.0000	Payment recorded for sales order SO-000030 (Invoice: INV-000032)	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	c19c8886-1212-49dc-9349-d1985a18d267
\.


--
-- Data for Name: plugins; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.plugins (id, "createdAt", "updatedAt", "deletedAt", "isActive", identifier, name, description, version, type, status, author, license, homepage, repository, "iconUrl", "installedDate", "lastActivatedDate", "lastUpdatedDate", "installPath", dependencies, requirements, "configSchema", config, "defaultConfig", hooks, endpoints, "uiComponents", "performanceMetrics", "usageStats", "lastError", "lastErrorAt", "errorCount", tags, media, changelog, metadata) FROM stdin;
\.


--
-- Data for Name: price_costing_settings; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.price_costing_settings (id, "createdAt", "updatedAt", "deletedAt", "isActive", currency, "costingMethod", "customerPricingSchemes") FROM stdin;
0a92a675-9e8b-4c77-9b5c-68c987866930	2025-11-28 16:26:44.901166+00	2025-12-13 09:01:24.492802+00	\N	t	MYR	AVERAGE	[{"name": "Retail", "currency": "MYR"}, {"name": "Shopee", "currency": "MYR"}]
\.


--
-- Data for Name: print_settings; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.print_settings (id, "createdAt", "updatedAt", "deletedAt", "isActive", "logoUrl", "companyName", address, phone, email, website, "miscInfo", "salesPerPageFooter", "salesEndOfDocFooter", "purchasingPerPageFooter", "purchasingEndOfDocFooter", "inventoryPerPageFooter", "inventoryEndOfDocFooter", "reportPerPageFooter", "reportEndOfDocFooter", "salesOrderTemplate", "invoiceTemplate", "paymentReceiptTemplate", "purchaseOrderTemplate", "grnTemplate", "vendorPaymentTemplate", city, state, "postalCode", country) FROM stdin;
f389b711-a5f2-45ac-bb35-3e9049989d42	2025-12-05 15:17:08.978412+00	2025-12-14 15:20:19.26297+00	\N	t	/uploads/logos/logo-1764342963058-751847709.webp	MF Hobby Trading	Pangsapuri Harmoni 1, Putra Heights	019-353 2547	mfhobbytrading@gmail.com	https://mfhobby.com										{"title": "Sales Order", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	{"title": "Invoice", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	{"title": "Payment Receipt", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	{"title": "Purchase Order", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	{"title": "Goods Received Note", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	{"title": "Vendor Payment", "format": "html-print", "margins": {"page": "20px", "print": "20px 20px 40px 20px"}, "fontSize": {"table": 11, "title": 20, "header": 14}, "pageSize": "A4", "sections": {"notes": true, "title": true, "footer": true, "headerInfo": true, "itemsTable": true, "customerInfo": true, "totalsSection": true}, "fontFamily": "Arial, sans-serif", "tableStyle": {"border": "1px solid #ddd", "cellPadding": "6px", "headerColor": "white", "alternateRows": true, "headerBackground": "#1976d2", "alternateRowColor": "#f9f9f9"}, "orientation": "portrait"}	Subang Jaya	Selangor	47650	Malaysia
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.products (id, "createdAt", "updatedAt", "deletedAt", "isActive", name, description, barcode, type, "baseCost", "stockQuantity", notes, "categoryId", "pricingTiers") FROM stdin;
53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0	2025-11-05 12:07:42.280061+00	2025-12-01 12:57:52.777+00	\N	t	Product D		\N	Stocked Product	0.0000	-1.0000		add8c93e-54a8-4781-b8c5-ce7a151e64f7	{"Retail": 0.0000, "Special": 0.0000, "Wholesale": 0.0000}
a6f3f2b7-f292-408b-912d-f613e31e179c	2025-11-04 14:39:34.761571+00	2025-12-01 12:57:52.8+00	\N	t	Product C		\N	Stocked Product	10.0000	1.0000		2e49c0a0-4ff0-40ce-b91b-f4fbdf82b397	{"Retail": 10.0000, "Special": 30.0000, "Wholesale": 20.0000}
80ebc4f8-6f75-4f9a-88f5-1ef5ed6fd25b	2025-11-25 14:20:34.018483+00	2025-12-01 12:57:52.821+00	\N	t	Product E		\N	Stocked Product	0.0000	0.0000		67df908f-1cd6-4776-bc0e-a801f0f3a627	{"Retail": 0.0000, "Special": 0.0000, "Wholesale": 0.0000}
cf4b7360-7fff-491c-bd95-7a5ee22f619c	2025-11-25 14:21:48.25525+00	2025-12-01 12:57:52.844+00	\N	t	Product F		\N	Stocked Product	0.0000	0.0000		67df908f-1cd6-4776-bc0e-a801f0f3a627	{"Retail": 0.0000, "Special": 0.0000, "Wholesale": 0.0000}
c07169f3-7a34-4909-b07c-9a4d71751d3b	2025-10-30 16:53:13.274086+00	2025-12-03 16:57:26.341079+00	\N	t	Product B		\N	Stocked Product	25.6939	353.0000		add8c93e-54a8-4781-b8c5-ce7a151e64f7	{"Retail": 20, "Shopee": 30, "Special": 0, "Wholesale": 0}
85294f77-4e65-4c4d-9c48-173ed37712cb	2025-10-30 16:53:02.544041+00	2025-12-16 11:57:34.868402+00	\N	t	Product A		\N	Stocked Product	14.4338	246.0000		add8c93e-54a8-4781-b8c5-ce7a151e64f7	{"Retail": 30.5, "Shopee": 40.6}
\.


--
-- Data for Name: purchase_cost_history; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.purchase_cost_history (id, "createdAt", "updatedAt", "deletedAt", "isActive", "productId", "grnId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") FROM stdin;
929491d7-2580-4d1d-a1a0-850deba1a995	2025-11-01 15:56:41.618435+00	2025-11-01 15:56:41.618435+00	\N	t	c07169f3-7a34-4909-b07c-9a4d71751d3b	961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	16.8800	0.0415	16.9215	152.0000	152.0000	2025-10-30 00:00:00
e47e6caf-82bc-4137-ae30-72ef5324bf06	2025-11-05 16:25:02.815783+00	2025-11-06 12:59:33.332+00	\N	t	a6f3f2b7-f292-408b-912d-f613e31e179c	5b1a4f3c-391f-46b3-b1fc-5e393d9146bd	10.0000	0.0000	10.0000	100.0000	0.0000	2025-11-05 00:00:00
32ee0c83-f994-4fca-a68e-aaade5780058	2025-10-30 18:31:24.004301+00	2025-10-30 18:32:45.888+00	\N	t	c07169f3-7a34-4909-b07c-9a4d71751d3b	50541070-2445-42db-bb28-af311556309e	18.5700	0.0824	18.6524	147.0000	147.0000	2025-10-30 00:00:00
868a6e17-d4c3-4fb4-b90c-fcfe9b21d9e5	2025-11-21 13:13:11.922434+00	2025-11-21 13:13:11.922434+00	\N	t	85294f77-4e65-4c4d-9c48-173ed37712cb	95fc8d7d-cfd0-41c7-938a-6d85bfb73a77	13.0000	0.0000	13.0000	100.0000	100.0000	2025-11-20 00:00:00
87381df2-03bf-4b1f-a3f4-e150ae01d392	2025-10-30 18:31:56.748967+00	2025-10-30 18:34:31.731+00	\N	t	c07169f3-7a34-4909-b07c-9a4d71751d3b	1a637c5e-8a5a-48fc-a42b-c743e0337843	68.5500	0.2078	68.7578	55.0000	54.0000	2025-10-30 00:00:00
0c023159-3613-44a1-8ae6-d3efbcf4962a	2025-10-30 19:03:58.305204+00	2025-11-21 13:42:32.547+00	\N	t	85294f77-4e65-4c4d-9c48-173ed37712cb	88254a61-6bae-475d-9427-92dbd0dc1e8d	10.0000	0.0000	10.0000	1.0000	0.0000	2025-10-30 00:00:00
e875d4b7-73bc-4c95-8483-ee10692935c5	2025-10-30 18:31:23.976211+00	2025-11-25 17:04:14.192+00	\N	t	85294f77-4e65-4c4d-9c48-173ed37712cb	50541070-2445-42db-bb28-af311556309e	12.5800	0.0558	12.6358	123.0000	96.0000	2025-10-30 00:00:00
d92984e2-cd3b-4b1a-899d-367ff8200422	2025-10-30 18:31:56.727854+00	2025-12-06 14:25:15.709+00	\N	t	85294f77-4e65-4c4d-9c48-173ed37712cb	1a637c5e-8a5a-48fc-a42b-c743e0337843	18.5700	0.0563	18.6263	56.0000	52.0000	2025-10-30 00:00:00
d8612fd4-0b82-4c02-b1c5-7c622a5c5777	2025-11-01 15:56:41.597637+00	2025-12-06 14:35:54.999+00	\N	t	85294f77-4e65-4c4d-9c48-173ed37712cb	961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	15.2500	0.0375	15.2875	152.0000	1.0000	2025-10-30 00:00:00
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.purchase_order_items (id, "createdAt", "updatedAt", "deletedAt", "isActive", "lineNumber", status, quantity, "receivedQuantity", "unitCost", "discountType", "discountPercent", "discountAmount", "totalAmount", "purchaseOrderId", "productId") FROM stdin;
2f5f04df-b269-4662-967a-8e436b4db504	2025-10-30 17:58:35.673968+00	2025-10-30 18:31:23.904458+00	\N	t	1	received	123.0000	123.0000	12.5800	percentage	0.00	0.0000	1547.3400	371b1cad-adf6-4746-849a-1b6be96305df	85294f77-4e65-4c4d-9c48-173ed37712cb
c3440675-e63b-4009-8fd3-7020d51df6e0	2025-10-30 17:58:35.673968+00	2025-10-30 18:31:23.966051+00	\N	t	2	received	147.0000	147.0000	18.5700	percentage	0.00	0.0000	2729.7900	371b1cad-adf6-4746-849a-1b6be96305df	c07169f3-7a34-4909-b07c-9a4d71751d3b
598b3aff-89ac-4fa1-a053-25f9600c37c8	2025-10-30 18:19:31.601732+00	2025-10-30 18:31:56.66073+00	\N	t	1	received	56.0000	56.0000	18.5700	percentage	0.00	0.0000	1039.9200	84d7962e-94fd-4337-89fb-9c835e19916c	85294f77-4e65-4c4d-9c48-173ed37712cb
d0118cf0-7a15-46dd-9bcb-a130428b3ca7	2025-10-30 18:19:31.601732+00	2025-10-30 18:31:56.720309+00	\N	t	2	received	55.0000	55.0000	68.5500	percentage	0.00	0.0000	3770.2500	84d7962e-94fd-4337-89fb-9c835e19916c	c07169f3-7a34-4909-b07c-9a4d71751d3b
4b21e0a3-5353-48df-8f49-2accb5799cf8	2025-12-17 14:54:23.678258+00	2025-12-17 14:54:23.678258+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	3bc9e4e5-9805-453e-9a42-61a169baebb2	85294f77-4e65-4c4d-9c48-173ed37712cb
253707fa-7bef-40a2-914d-10dca750b9cd	2025-12-17 15:02:36.978175+00	2025-12-17 15:02:36.978175+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	baf4ab47-be8a-450c-9562-ef0ecc7ebdd5	85294f77-4e65-4c4d-9c48-173ed37712cb
e0db5571-99c0-44ea-b8a2-2ccc3c981ea3	2025-10-30 19:03:43.128213+00	2025-10-30 19:03:58.253107+00	\N	t	1	received	1.0000	1.0000	10.0000	percentage	0.00	0.0000	10.0000	b5e5c15b-d8b0-47d0-9a78-877d1591f79d	85294f77-4e65-4c4d-9c48-173ed37712cb
edb96414-10fc-49de-bcb4-00bb4452d140	2025-12-17 15:40:33.051579+00	2025-12-17 15:40:33.069414+00	\N	t	1	pending	1.0000	0.0000	14.4338	fixed_amount	0.00	0.0000	14.4338	a0e19891-7f00-4cb5-89dd-6e664f218c0e	85294f77-4e65-4c4d-9c48-173ed37712cb
14fd0d08-254b-4211-8b11-80ea46d91218	2025-12-19 16:55:35.234335+00	2025-12-19 16:55:35.234335+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	b6b0e2f0-0dd4-47a8-828f-3c86a6909d31	85294f77-4e65-4c4d-9c48-173ed37712cb
e8618f80-0867-41c2-a9d1-037ceb3a6ad0	2025-10-30 18:34:03.884503+00	2025-11-01 15:56:41.545079+00	\N	t	1	received	152.0000	152.0000	15.2500	percentage	0.00	0.0000	2318.0000	187fc444-db2d-4934-83a5-37c61a41dd4c	85294f77-4e65-4c4d-9c48-173ed37712cb
6fc83a76-b81a-480e-a781-aa9b2630c53a	2025-10-30 18:34:03.884503+00	2025-11-01 15:56:41.591958+00	\N	t	2	received	152.0000	152.0000	16.8800	percentage	0.00	0.0000	2565.7600	187fc444-db2d-4934-83a5-37c61a41dd4c	c07169f3-7a34-4909-b07c-9a4d71751d3b
c633d659-6cf3-4c0f-a44e-fe90efd76fa6	2025-11-05 16:24:58.973592+00	2025-11-05 16:25:02.807271+00	\N	t	1	received	100.0000	100.0000	10.0000	percentage	0.00	0.0000	1000.0000	c30213d1-3a6e-4001-b6db-1d49705fe2cf	a6f3f2b7-f292-408b-912d-f613e31e179c
4e4eb42c-a49e-444c-9fec-4b4dbcc0a3db	2025-11-20 14:24:17.802516+00	2025-11-21 13:13:11.915778+00	\N	t	1	received	100.0000	100.0000	13.0000	percentage	0.00	0.0000	1300.0000	0db8893f-d848-4813-b7dd-a8e65f4e9f7d	85294f77-4e65-4c4d-9c48-173ed37712cb
14d6c22e-6240-4e6b-9ff2-eaa328465402	2025-11-22 17:52:33.001956+00	2025-12-16 11:57:34.900431+00	\N	t	1	received	1.0000	0.0000	14.4236	fixed_amount	0.00	0.0000	14.4236	13f7cccc-ce32-49f7-a758-0fcd6c1b8506	85294f77-4e65-4c4d-9c48-173ed37712cb
119a13ae-2331-41b0-88d6-b96f84a29efd	2025-12-16 13:51:42.335722+00	2025-12-16 13:51:42.335722+00	\N	t	1	pending	1.0000	0.0000	14.4338	fixed_amount	0.00	10.0000	4.4338	17f1b2a1-fe99-4843-8693-a48ed90113a2	85294f77-4e65-4c4d-9c48-173ed37712cb
b9fe5b21-a294-4b98-8dac-fdd8e1b7c20b	2025-12-16 14:49:58.008198+00	2025-12-16 14:49:58.008198+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	10.00	1.4434	12.9904	81bbad6f-bb7a-4c16-9784-b12013281cea	85294f77-4e65-4c4d-9c48-173ed37712cb
66a84880-bad9-42f8-a975-8c6eea2fbfd1	2025-12-16 15:01:44.507641+00	2025-12-16 15:01:44.507641+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	854e9e99-7045-4459-90e5-b4c0a8956d91	85294f77-4e65-4c4d-9c48-173ed37712cb
859fe827-ec0f-440a-8cb9-2e6ce7ef234f	2025-12-16 18:01:26.140249+00	2025-12-16 18:01:26.140249+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	87ffa09e-fa46-4621-9db5-b72f1fee8746	85294f77-4e65-4c4d-9c48-173ed37712cb
07995340-a7b0-4bc3-b8d1-74f2ce87d5c9	2025-12-16 18:02:52.185843+00	2025-12-16 18:02:52.185843+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	748f77f6-1a0e-4e9c-b98c-e538f0bad6cd	85294f77-4e65-4c4d-9c48-173ed37712cb
eb2c26c4-0587-4b76-95be-cea648493362	2025-12-17 14:28:19.545967+00	2025-12-17 14:28:19.545967+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	4013e391-9e3a-4b07-ad46-000a9f29ea94	85294f77-4e65-4c4d-9c48-173ed37712cb
5b22ac44-9283-41a1-82ef-d8a2ffc26936	2025-12-17 14:28:41.847087+00	2025-12-17 14:28:41.847087+00	\N	t	1	pending	1.0000	0.0000	25.6939	percentage	0.00	0.0000	25.6939	77ecde84-02ae-4371-bd6b-4ebc898712d9	c07169f3-7a34-4909-b07c-9a4d71751d3b
ea02384e-550a-45a8-bd57-0e865c37e573	2025-12-17 14:29:37.050397+00	2025-12-17 14:29:37.050397+00	\N	t	1	pending	1.0000	0.0000	14.4338	percentage	0.00	0.0000	14.4338	51dac0f6-e755-4ea0-80c6-f85e91986831	85294f77-4e65-4c4d-9c48-173ed37712cb
449a51bb-5413-47cd-bdaf-a01c365cd750	2025-12-17 14:38:45.179088+00	2025-12-17 14:38:45.179088+00	\N	t	1	pending	1.0000	0.0000	0.0000	percentage	0.00	0.0000	0.0000	983681ef-0bb3-433a-9c98-6a8bbdade071	53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.purchase_orders (id, "createdAt", "updatedAt", "deletedAt", "isActive", "orderNumber", "orderDate", subtotal, "discountPercent", "discountAmount", "shippingAmount", "totalAmount", notes, "supplierId", "paidAmount") FROM stdin;
81bbad6f-bb7a-4c16-9784-b12013281cea	2025-12-16 14:49:58.008198+00	2025-12-16 14:50:10.738875+00	\N	t	PO-000009	2025-12-16	12.9904	0.00	0.0000	10.0000	22.9904	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	22.9904
13f7cccc-ce32-49f7-a758-0fcd6c1b8506	2025-11-21 17:51:22.887208+00	2025-12-16 14:55:28.71658+00	\N	t	PO-000007	2025-11-22	14.4236	0.00	0.0000	10.0000	24.4236	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	24.4236
854e9e99-7045-4459-90e5-b4c0a8956d91	2025-12-16 15:01:44.507641+00	2025-12-16 17:54:02.694275+00	\N	t	PO-000010	2025-12-16	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	65.0000
87ffa09e-fa46-4621-9db5-b72f1fee8746	2025-12-16 18:01:26.140249+00	2025-12-16 18:01:32.685456+00	\N	t	PO-000011	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	10.0000
748f77f6-1a0e-4e9c-b98c-e538f0bad6cd	2025-12-16 18:02:52.185843+00	2025-12-16 18:30:39.009794+00	\N	t	PO-000012	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	10.0000
4013e391-9e3a-4b07-ad46-000a9f29ea94	2025-12-17 14:28:19.545967+00	2025-12-17 14:28:21.731177+00	\N	t	PO-000013	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	1.0000
77ecde84-02ae-4371-bd6b-4ebc898712d9	2025-12-17 14:28:41.847087+00	2025-12-17 14:28:44.494662+00	\N	t	PO-000014	2025-12-17	25.6939	0.00	0.0000	0.0000	25.6939	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	1.0000
51dac0f6-e755-4ea0-80c6-f85e91986831	2025-12-17 14:29:37.050397+00	2025-12-17 14:29:37.050397+00	\N	t	PO-000015	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	0.0000
983681ef-0bb3-433a-9c98-6a8bbdade071	2025-12-17 14:38:45.179088+00	2025-12-17 14:39:31.524415+00	\N	t	PO-000016	2025-12-17	0.0000	0.00	0.0000	0.0000	0.0000	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	1.0000
3bc9e4e5-9805-453e-9a42-61a169baebb2	2025-12-17 14:54:23.678258+00	2025-12-17 14:54:23.678258+00	\N	t	PO-000017	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	0.0000
baf4ab47-be8a-450c-9562-ef0ecc7ebdd5	2025-12-17 15:02:36.978175+00	2025-12-17 15:02:36.978175+00	\N	t	PO-000018	2025-12-17	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	0.0000
a0e19891-7f00-4cb5-89dd-6e664f218c0e	2025-12-17 15:22:26.636004+00	2025-12-17 15:40:37.101739+00	\N	t	PO-000019	2025-12-17	14.4338	0.00	0.0000	10.0000	24.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	10.0000
371b1cad-adf6-4746-849a-1b6be96305df	2025-10-30 17:58:35.673968+00	2025-10-30 18:31:24.027047+00	\N	t	PO-000001	2025-10-30	4277.1300	0.00	0.0000	18.9800	4296.1100	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	4296.1100
84d7962e-94fd-4337-89fb-9c835e19916c	2025-10-30 18:19:31.601732+00	2025-10-30 18:31:56.76867+00	\N	t	PO-000002	2025-10-30	4810.1700	0.00	0.0000	14.5800	4824.7500	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	4824.7500
b5e5c15b-d8b0-47d0-9a78-877d1591f79d	2025-10-30 19:03:43.128213+00	2025-10-30 19:03:58.373595+00	\N	t	PO-000004	2025-10-30	10.0000	0.00	0.0000	0.0000	10.0000	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	10.0000
187fc444-db2d-4934-83a5-37c61a41dd4c	2025-10-30 18:34:03.884503+00	2025-11-01 15:56:41.635193+00	\N	t	PO-000003	2025-10-30	4883.7600	0.00	0.0000	12.0000	4895.7600	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	4895.7600
c30213d1-3a6e-4001-b6db-1d49705fe2cf	2025-11-05 16:24:58.973592+00	2025-11-05 16:25:02.84839+00	\N	t	PO-000005	2025-11-05	1000.0000	0.00	0.0000	0.0000	1000.0000	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	1000.0000
0db8893f-d848-4813-b7dd-a8e65f4e9f7d	2025-11-20 14:24:17.802516+00	2025-11-21 13:13:11.946312+00	\N	t	PO-000006	2025-11-20	1300.0000	0.00	0.0000	0.0000	1300.0000	\N	33fcda59-4698-4131-a681-fd610d212a96	1300.0000
b6b0e2f0-0dd4-47a8-828f-3c86a6909d31	2025-12-19 16:55:35.234335+00	2025-12-19 16:55:42.606546+00	\N	t	PO-000020	2025-12-20	14.4338	0.00	0.0000	0.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	14.4338
17f1b2a1-fe99-4843-8693-a48ed90113a2	2025-12-16 13:51:42.335722+00	2025-12-16 14:34:19.057189+00	\N	t	PO-000008	2025-12-16	4.4338	0.00	0.0000	10.0000	14.4338	\N	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	14.4338
\.


--
-- Data for Name: sales_order_items; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.sales_order_items (id, "createdAt", "updatedAt", "deletedAt", "isActive", "lineNumber", quantity, "unitPrice", "discountType", "discountPercent", "discountAmount", "totalAmount", "unitCost", notes, "salesOrderId", "productId") FROM stdin;
d6521ee1-1d51-4fb9-ab60-5e25f7433515	2025-10-30 18:18:41.139842+00	2025-10-30 18:18:41.139842+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	12.6358	\N	c9b2867c-9294-407c-bdec-2fb51c52119c	85294f77-4e65-4c4d-9c48-173ed37712cb
67c39036-2987-4f4f-a479-c58ba4cdc842	2025-10-30 18:18:41.149242+00	2025-10-30 18:18:41.149242+00	\N	t	2	1	20.0000	percentage	0.00	0.0000	20.0000	18.6524	\N	c9b2867c-9294-407c-bdec-2fb51c52119c	c07169f3-7a34-4909-b07c-9a4d71751d3b
1e51fe5f-1888-4b0e-8855-c850f35537e1	2025-10-30 19:03:26.802786+00	2025-10-30 19:03:26.802786+00	\N	t	1	178	20.0000	percentage	0.00	0.0000	3560.0000	14.5099	\N	5c6a8dc0-fcf4-4026-b0a7-967d7c5cda18	85294f77-4e65-4c4d-9c48-173ed37712cb
3d6f670c-3968-479f-b19d-5b30fbab2157	2025-11-05 16:25:37.168193+00	2025-11-05 16:25:37.168193+00	\N	t	1	100	20.0000	percentage	0.00	0.0000	2000.0000	10.0000	\N	21511ddf-f02b-4599-8c43-0dc827b9260b	a6f3f2b7-f292-408b-912d-f613e31e179c
fc14b1da-67ba-4036-8c51-b961f979e5e1	2025-11-08 18:09:30.724968+00	2025-11-08 18:09:30.724968+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	0.0000	\N	ef413e59-8b2b-4311-8e11-fa70ddf7d669	53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0
9266de9a-6509-425e-81f7-b8bbc270bec6	2025-11-21 17:18:45.369963+00	2025-11-21 17:18:45.369963+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.4236	\N	6c0b72ad-8415-479d-b8e6-fc2d62c767a4	85294f77-4e65-4c4d-9c48-173ed37712cb
6cd78c9c-8ba5-4f3f-9f6a-a9bdcbcf38e3	2025-11-21 17:27:46.316319+00	2025-11-21 17:27:46.316319+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.4236	\N	c66d7700-aca7-4dea-bd44-40fa9062c1ff	85294f77-4e65-4c4d-9c48-173ed37712cb
85098d31-15a1-4c29-8e4a-2c924712fe18	2025-11-21 17:50:57.737948+00	2025-11-21 17:50:57.737948+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.4236	\N	26589ef1-0651-4d5b-9ddf-1e30afccc701	85294f77-4e65-4c4d-9c48-173ed37712cb
a583eca6-9202-4199-815f-a1ddf0de0fa8	2025-11-25 16:26:16.702293+00	2025-11-25 16:26:16.702293+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	a88e91ad-65a5-4860-bbfa-a121107684ca	85294f77-4e65-4c4d-9c48-173ed37712cb
cdf492eb-b2a2-4e95-9e26-3266f2769ba2	2025-11-25 16:28:51.114695+00	2025-11-25 16:28:51.114695+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	af743882-4fec-4243-ba87-e6dd914458d9	85294f77-4e65-4c4d-9c48-173ed37712cb
f128c443-2781-4a58-89bf-a4888f39749b	2025-11-25 16:45:54.403864+00	2025-11-25 16:45:54.403864+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	fd4a8b16-97ac-4105-9040-b093f443d05c	85294f77-4e65-4c4d-9c48-173ed37712cb
3fd83c5b-20fc-492a-9287-88cda946efb2	2025-11-25 16:53:02.1063+00	2025-11-25 16:53:02.1063+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	fd105234-4664-4a6c-a8c9-5e1059c60c3b	85294f77-4e65-4c4d-9c48-173ed37712cb
d5a20417-dc55-4905-bc7e-f6083522d422	2025-11-25 17:04:11.318819+00	2025-11-25 17:04:11.318819+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	c7d24068-6867-4b8b-aa87-1378dcb9f67d	85294f77-4e65-4c4d-9c48-173ed37712cb
175b16c6-ac56-4597-8c1b-5d1e4a92c7f1	2025-11-26 17:07:37.841545+00	2025-11-26 17:07:37.841545+00	\N	t	1	1	20.0000	percentage	0.00	0.0000	20.0000	14.0061	\N	6e9c92ac-7f21-4988-90c4-87231b55dccb	85294f77-4e65-4c4d-9c48-173ed37712cb
b77ec40c-b120-4992-9cf4-edfccf5a9be3	2025-12-03 16:58:14.011259+00	2025-12-03 16:58:14.011259+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.0061	\N	fe1ddc33-a55f-46ec-9cf9-9d717961ae80	85294f77-4e65-4c4d-9c48-173ed37712cb
add5f8ab-eb58-410c-b51f-fac3b12c2826	2025-12-05 18:51:14.100167+00	2025-12-05 18:51:14.100167+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.0061	\N	cf175be3-6870-4f9c-a06e-8d3b65e06f6a	85294f77-4e65-4c4d-9c48-173ed37712cb
362b1e34-df2f-41e9-9246-12a626b57ce7	2025-12-05 19:06:34.794789+00	2025-12-05 19:06:34.794789+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.0061	\N	4b9c09dc-d419-41c0-9f01-0b71ca1b750a	85294f77-4e65-4c4d-9c48-173ed37712cb
88c185e5-94b7-4c87-bd3c-3f4bf06bc94a	2025-12-05 19:12:00.20581+00	2025-12-05 19:12:00.20581+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.0061	\N	b8c561c9-d3d5-4213-87d7-e5da8555bb2b	85294f77-4e65-4c4d-9c48-173ed37712cb
0f007d95-6c8f-4d98-8d77-45f2795da180	2025-12-12 14:58:56.606471+00	2025-12-12 14:58:56.606471+00	\N	t	1	5	40.6000	percentage	10.00	20.3000	182.7000	14.4569	\N	b78cc725-7eb6-443a-9b2a-783c4cdaca40	85294f77-4e65-4c4d-9c48-173ed37712cb
30e564c2-621b-4541-a48f-f2e398f6ca20	2025-12-08 13:45:28.206646+00	2025-12-08 13:45:28.206646+00	\N	t	1	2	40.6000	percentage	10.00	8.1200	73.0800	14.4569	\N	db2d9a22-ee56-48f3-b9d1-329a1fa2b29f	85294f77-4e65-4c4d-9c48-173ed37712cb
b6aec621-03bf-4368-8ef1-064ffa529936	2025-12-08 13:45:28.217628+00	2025-12-08 13:45:28.217628+00	\N	t	2	2	30.0000	percentage	0.00	0.0000	60.0000	25.6939	\N	db2d9a22-ee56-48f3-b9d1-329a1fa2b29f	c07169f3-7a34-4909-b07c-9a4d71751d3b
7edf1a94-457f-454d-83e6-f2c4fa80ae0d	2025-12-08 14:29:24.89881+00	2025-12-08 14:29:24.89881+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.4569	\N	d2958cc5-4bb0-4050-aa1a-02b9416a1d88	85294f77-4e65-4c4d-9c48-173ed37712cb
31d27c6f-f7c4-4834-8832-b2129f8b88d8	2025-12-08 14:46:05.839493+00	2025-12-08 14:46:05.839493+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.4569	\N	03dd9cba-83ee-400e-a797-aedeffaacca9	85294f77-4e65-4c4d-9c48-173ed37712cb
ff747083-5f89-46cf-8ad0-b6be330a3daa	2025-12-08 14:46:55.022165+00	2025-12-08 14:46:55.022165+00	\N	t	1	1	30.5000	percentage	0.00	0.0000	30.5000	14.4569	\N	35160db4-5fa4-46fc-ac69-c9022c0fb97b	85294f77-4e65-4c4d-9c48-173ed37712cb
eb170b6e-bc14-4b9d-96c1-4f026062ddf1	2025-12-08 14:53:22.665124+00	2025-12-08 14:53:22.665124+00	\N	t	1	2	40.6000	percentage	0.00	0.0000	81.2000	14.4569	\N	9ad8e271-f986-4c9f-a1ea-a93524d3b60c	85294f77-4e65-4c4d-9c48-173ed37712cb
7a6d4959-ad38-457c-8cf2-9adc4499162d	2025-12-08 14:59:42.438279+00	2025-12-08 14:59:42.438279+00	\N	t	1	3	40.6000	percentage	0.00	0.0000	121.8000	14.4569	\N	cb43a1c7-035e-4aac-a8fb-a9d734f15278	85294f77-4e65-4c4d-9c48-173ed37712cb
7042d4f8-62a0-4c21-986b-61bcd684d9dc	2025-12-12 16:31:48.526338+00	2025-12-12 16:31:48.526338+00	\N	t	1	1	40.6000	percentage	10.00	4.0600	36.5400	14.4569	\N	595f87b4-66c4-4479-9968-282d7556280f	85294f77-4e65-4c4d-9c48-173ed37712cb
3e4c354e-26bc-42af-9afe-fe734b92d06f	2025-12-12 16:53:27.411152+00	2025-12-12 16:53:27.411152+00	\N	t	1	1	40.6000	percentage	20.00	8.1200	32.4800	14.4569	\N	73aa9b16-f310-4a50-97ee-513a5789cd7e	85294f77-4e65-4c4d-9c48-173ed37712cb
1274d856-3dfd-4bf9-8059-1d54c6529476	2025-12-12 17:13:37.848475+00	2025-12-12 17:13:37.848475+00	\N	t	1	1	30.0000	percentage	0.00	0.0000	30.0000	25.6939	\N	6192fa67-76a5-4aad-ab28-4241cb65ddf3	c07169f3-7a34-4909-b07c-9a4d71751d3b
28977fdf-418c-412a-84c5-b91edde50122	2025-12-14 17:30:45.596546+00	2025-12-14 17:30:45.596546+00	\N	t	1	1	40.6000	percentage	10.00	4.0600	36.5400	14.4569	\N	d5ccd664-a937-4325-a136-df36fe07b91c	85294f77-4e65-4c4d-9c48-173ed37712cb
aa3d8354-2b0a-4ce7-8daa-87f8ea766a7b	2025-12-16 13:52:09.299887+00	2025-12-16 13:52:09.299887+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.4338	\N	6bd03bc4-6da6-43c8-997f-5dabc11fc0e8	85294f77-4e65-4c4d-9c48-173ed37712cb
55e555d2-db3c-4a5c-8b13-0a7be69ff733	2025-12-19 15:08:59.725469+00	2025-12-19 15:08:59.725469+00	\N	t	1	1	40.6000	percentage	0.00	0.0000	40.6000	14.4338	\N	da473492-6459-4142-bf6f-7686bf6fe301	85294f77-4e65-4c4d-9c48-173ed37712cb
\.


--
-- Data for Name: sales_orders; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.sales_orders (id, "createdAt", "updatedAt", "deletedAt", "isActive", "orderNumber", "orderDate", "shippingAmount", "totalAmount", "paidAmount", "isFulfilled", "fulfilledDate", notes, "customerId", currency) FROM stdin;
21511ddf-f02b-4599-8c43-0dc827b9260b	2025-11-05 16:25:37.152134+00	2025-11-06 12:59:33.362949+00	\N	t	SO-000003	2025-11-05	0.0000	2000.0000	2000.0000	t	2025-11-06 12:59:33.356	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
c9b2867c-9294-407c-bdec-2fb51c52119c	2025-10-30 18:18:41.129443+00	2025-10-30 18:34:31.766699+00	\N	t	SO-000001	2025-10-30	0.0000	40.0000	40.0000	t	2025-10-30 18:34:31.759	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
db2d9a22-ee56-48f3-b9d1-329a1fa2b29f	2025-12-05 19:17:52.805905+00	2025-12-08 13:45:30.578898+00	\N	t	SO-000018	2025-12-06	10.0000	143.0800	143.0800	f	\N	Notes and discounts should sync perfectly fadfa	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
d2958cc5-4bb0-4050-aa1a-02b9416a1d88	2025-12-08 14:29:24.854286+00	2025-12-08 14:29:24.854286+00	\N	t	SO-000019	2025-12-08	10.0000	50.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
5c6a8dc0-fcf4-4026-b0a7-967d7c5cda18	2025-10-30 19:03:26.775452+00	2025-11-21 13:42:32.585211+00	\N	t	SO-000002	2025-10-30	0.0000	3560.0000	3560.0000	t	2025-11-21 13:42:32.577	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
03dd9cba-83ee-400e-a797-aedeffaacca9	2025-12-08 14:46:05.811148+00	2025-12-08 14:46:05.811148+00	\N	t	SO-000020	2025-12-08	10.0000	50.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
35160db4-5fa4-46fc-ac69-c9022c0fb97b	2025-12-08 14:46:55.013182+00	2025-12-08 14:46:55.013182+00	\N	t	SO-000021	2025-12-08	20.0000	50.5000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
9ad8e271-f986-4c9f-a1ea-a93524d3b60c	2025-12-08 14:53:22.652865+00	2025-12-08 14:53:22.652865+00	\N	t	SO-000022	2025-12-08	10.0000	91.2000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
cb43a1c7-035e-4aac-a8fb-a9d734f15278	2025-12-08 14:59:42.410265+00	2025-12-08 14:59:42.410265+00	\N	t	SO-000023	2025-12-08	20.0000	141.8000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
ef413e59-8b2b-4311-8e11-fa70ddf7d669	2025-11-08 18:09:30.678801+00	2025-11-21 13:53:18.87052+00	\N	t	SO-000004	2025-11-08	0.0000	20.0000	20.0000	t	2025-11-21 13:53:18.862	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
6c0b72ad-8415-479d-b8e6-fc2d62c767a4	2025-11-21 17:18:45.346844+00	2025-11-21 17:18:47.458239+00	\N	t	SO-000005	2025-11-21	0.0000	20.0000	20.0000	t	2025-11-21 17:18:47.451	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
c66d7700-aca7-4dea-bd44-40fa9062c1ff	2025-11-21 17:27:46.306858+00	2025-11-21 17:27:48.573454+00	\N	t	SO-000006	2025-11-21	0.0000	20.0000	20.0000	t	2025-11-21 17:27:48.567	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
26589ef1-0651-4d5b-9ddf-1e30afccc701	2025-11-21 17:50:57.714459+00	2025-11-21 17:51:00.494321+00	\N	t	SO-000007	2025-11-22	0.0000	20.0000	20.0000	t	2025-11-22 01:51:00.488	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
a88e91ad-65a5-4860-bbfa-a121107684ca	2025-11-25 16:26:16.67978+00	2025-11-25 16:26:16.67978+00	\N	t	SO-000008	2025-11-26	0.0000	20.0000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
af743882-4fec-4243-ba87-e6dd914458d9	2025-11-25 16:28:51.09138+00	2025-11-25 16:28:51.09138+00	\N	t	SO-000009	2025-11-26	0.0000	20.0000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
fd4a8b16-97ac-4105-9040-b093f443d05c	2025-11-25 16:45:54.365393+00	2025-11-25 16:45:54.365393+00	\N	t	SO-000010	2025-11-26	0.0000	20.0000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
fd105234-4664-4a6c-a8c9-5e1059c60c3b	2025-11-25 16:53:02.097009+00	2025-11-25 16:53:02.097009+00	\N	t	SO-000011	2025-11-25	0.0000	20.0000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
b78cc725-7eb6-443a-9b2a-783c4cdaca40	2025-12-08 15:07:12.953045+00	2025-12-12 14:58:59.931247+00	\N	t	SO-000024	2025-12-08	30.0000	212.7000	212.7000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
c7d24068-6867-4b8b-aa87-1378dcb9f67d	2025-11-25 17:04:11.295163+00	2025-11-25 17:04:14.228971+00	\N	t	SO-000012	2025-11-26	0.0000	20.0000	20.0000	t	2025-11-26 01:04:14.222	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
6e9c92ac-7f21-4988-90c4-87231b55dccb	2025-11-26 17:07:37.824221+00	2025-11-26 17:07:37.824221+00	\N	t	SO-000013	2025-11-27	0.0000	20.0000	0.0000	f	\N	\N	971419dd-ef63-426f-b866-908d529f87dc	USD
fe1ddc33-a55f-46ec-9cf9-9d717961ae80	2025-12-03 16:58:13.98786+00	2025-12-03 16:58:13.98786+00	\N	t	SO-000014	2025-12-04	0.0000	40.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
cf175be3-6870-4f9c-a06e-8d3b65e06f6a	2025-12-05 18:51:14.071422+00	2025-12-05 18:51:14.071422+00	\N	t	SO-000015	2025-12-06	10.0000	50.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
4b9c09dc-d419-41c0-9f01-0b71ca1b750a	2025-12-05 19:06:07.242579+00	2025-12-05 19:06:34.81303+00	\N	t	SO-000016	2025-12-06	10.0000	50.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
b8c561c9-d3d5-4213-87d7-e5da8555bb2b	2025-12-05 19:12:00.177319+00	2025-12-05 19:12:00.177319+00	\N	t	SO-000017	2025-12-06	0.0000	40.6000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
595f87b4-66c4-4479-9968-282d7556280f	2025-12-12 16:31:48.503409+00	2025-12-12 16:31:48.503409+00	\N	t	SO-000025	2025-12-13	30.0000	66.5400	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
73aa9b16-f310-4a50-97ee-513a5789cd7e	2025-12-12 16:53:27.388417+00	2025-12-12 16:53:27.388417+00	\N	t	SO-000026	2025-12-13	12.0000	44.4800	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
6192fa67-76a5-4aad-ab28-4241cb65ddf3	2025-12-12 17:13:37.820064+00	2025-12-12 17:13:37.820064+00	\N	t	SO-000027	2025-12-13	0.0000	30.0000	0.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
d5ccd664-a937-4325-a136-df36fe07b91c	2025-12-14 17:30:45.57848+00	2025-12-14 18:21:18.650249+00	\N	t	SO-000028	2025-12-15	10.0000	46.5400	46.5400	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
6bd03bc4-6da6-43c8-997f-5dabc11fc0e8	2025-12-16 13:52:09.286472+00	2025-12-16 13:52:12.777817+00	\N	t	SO-000029	2025-12-16	0.0000	40.6000	10.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
da473492-6459-4142-bf6f-7686bf6fe301	2025-12-19 15:08:59.700347+00	2025-12-19 15:09:04.700195+00	\N	t	SO-000030	2025-12-19	0.0000	40.6000	10.0000	f	\N	\N	7b8f9f4e-81f3-4ab0-a16d-8a78a1294e97	USD
\.


--
-- Data for Name: stock_adjustment_items; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.stock_adjustment_items (id, "createdAt", "updatedAt", "deletedAt", "isActive", "stockAdjustmentId", "productId", "oldQuantity", "newQuantity", difference, "unitCost", "totalValue", notes) FROM stdin;
4c710bc4-0b89-4aad-9d27-93c24a4d793d	2025-11-19 15:32:09.202249+00	2025-11-19 15:32:09.202249+00	\N	t	fd5354f5-97ee-4078-84fd-8332a96b0463	85294f77-4e65-4c4d-9c48-173ed37712cb	153.0000	152.0000	-1.0000	16.1864	16.1864	\N
c5167815-e174-4653-86f4-915188d8b3ed	2025-11-21 16:05:49.136123+00	2025-11-21 16:05:49.136123+00	\N	t	c05e9c61-ab61-41d3-a3a4-c89b0839e6f5	a6f3f2b7-f292-408b-912d-f613e31e179c	0.0000	1.0000	1.0000	10.0000	10.0000	\N
d9bca0a9-a48a-4a02-b2b3-bacc65375349	2025-11-21 17:51:50.702403+00	2025-11-21 17:51:50.702403+00	\N	t	eeab0b77-27b1-4ae6-932d-fa2457b2debf	85294f77-4e65-4c4d-9c48-173ed37712cb	250.0000	249.0000	-1.0000	13.9704	13.9704	\N
8a646674-bd92-4b79-9f3a-a53ebde5b2b2	2025-11-21 17:57:19.970227+00	2025-11-21 17:57:19.970227+00	\N	t	96b1acd7-e345-4b05-89d2-4fbf4b14b6f7	85294f77-4e65-4c4d-9c48-173ed37712cb	249.0000	248.0000	-1.0000	13.9704	13.9704	\N
\.


--
-- Data for Name: stock_adjustments; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.stock_adjustments (id, "createdAt", "updatedAt", "deletedAt", "isActive", "adjustmentNumber", "adjustmentDate", status, notes, "itemCount", "totalValue") FROM stdin;
fd5354f5-97ee-4078-84fd-8332a96b0463	2025-11-19 15:32:09.202249+00	2025-11-19 15:33:10.014048+00	\N	t	SA-000001	2025-11-19 00:00:00+00	completed	\N	1	16.1864
c05e9c61-ab61-41d3-a3a4-c89b0839e6f5	2025-11-21 16:05:49.136123+00	2025-11-21 16:18:44.140392+00	\N	t	SA-000002	2025-11-21 00:00:00+00	completed	\N	1	10.0000
eeab0b77-27b1-4ae6-932d-fa2457b2debf	2025-11-21 17:51:50.702403+00	2025-11-21 17:51:57.416329+00	\N	t	SA-000003	2025-11-22 00:00:00+00	completed	\N	1	13.9704
96b1acd7-e345-4b05-89d2-4fbf4b14b6f7	2025-11-21 17:57:19.970227+00	2025-11-21 17:57:22.973744+00	\N	t	SA-000004	2025-11-22 00:00:00+00	completed	\N	1	13.9704
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.stock_movements (id, "createdAt", "updatedAt", "deletedAt", "isActive", "movementType", "movementDate", quantity, "previousBalance", "newBalance", "unitValue", "totalValue", "referenceType", "referenceId", reason, notes, "productId") FROM stdin;
f9f00e21-de35-420a-b6c4-eecff61a9733	2025-10-30 18:31:56.681048+00	2025-10-30 18:32:45.989729+00	\N	t	purchase_receipt	2025-10-30 18:31:56.681048+00	55.0000	147.0000	202.0000	68.5500	3770.2500	purchase_order	84d7962e-94fd-4337-89fb-9c835e19916c	Purchase order received: PO-000002	\N	c07169f3-7a34-4909-b07c-9a4d71751d3b
e94077bc-b817-4967-821b-2b550957af53	2025-10-30 18:31:23.858323+00	2025-10-30 18:31:23.858323+00	\N	t	purchase_receipt	2025-10-30 18:31:23.858323+00	123.0000	0.0000	123.0000	12.5800	1547.3400	purchase_order	371b1cad-adf6-4746-849a-1b6be96305df	Purchase order received: PO-000001	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
5d87e234-df1e-4e33-95ff-bb8cdffb83fb	2025-10-30 18:31:23.92779+00	2025-10-30 18:31:23.92779+00	\N	t	purchase_receipt	2025-10-30 18:31:23.92779+00	147.0000	0.0000	147.0000	18.5700	2729.7900	purchase_order	371b1cad-adf6-4746-849a-1b6be96305df	Purchase order received: PO-000001	\N	c07169f3-7a34-4909-b07c-9a4d71751d3b
1bb75449-7c5c-42f3-833b-a114b41a52a6	2025-10-30 18:31:56.619543+00	2025-10-30 18:32:45.96752+00	\N	t	purchase_receipt	2025-10-30 18:31:56.619543+00	56.0000	123.0000	179.0000	18.5700	1039.9200	purchase_order	84d7962e-94fd-4337-89fb-9c835e19916c	Purchase order received: PO-000002	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
17169a60-c9ee-4681-bd2b-fc1c6ff4beb8	2025-10-30 18:34:31.677474+00	2025-10-30 18:35:08.849543+00	\N	t	sale	2025-10-30 18:34:31.676+00	-1.0000	179.0000	178.0000	\N	\N	sales_order	c9b2867c-9294-407c-bdec-2fb51c52119c	Sales order fulfillment: SO-000001	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
b16447fb-f51a-4338-be2f-b0dcb8c4a5af	2025-10-30 18:34:31.722266+00	2025-10-30 18:35:08.870539+00	\N	t	sale	2025-10-30 18:34:31.721+00	-1.0000	202.0000	201.0000	\N	\N	sales_order	c9b2867c-9294-407c-bdec-2fb51c52119c	Sales order fulfillment: SO-000001	\N	c07169f3-7a34-4909-b07c-9a4d71751d3b
3f0f2053-f0cf-44b5-864c-dd4b9d73e931	2025-10-30 19:03:58.164799+00	2025-10-30 19:04:39.771714+00	\N	t	purchase_receipt	2025-10-30 19:03:58.164799+00	1.0000	178.0000	179.0000	10.0000	10.0000	purchase_order	b5e5c15b-d8b0-47d0-9a78-877d1591f79d	Purchase order received: PO-000004	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
484379bf-eeac-4b29-9ee1-360285151cee	2025-11-01 15:56:41.561101+00	2025-11-01 15:56:41.561101+00	\N	t	purchase_receipt	2025-11-01 15:56:41.561101+00	152.0000	201.0000	353.0000	16.8800	2565.7600	purchase_order	187fc444-db2d-4934-83a5-37c61a41dd4c	Purchase order received: PO-000003	\N	c07169f3-7a34-4909-b07c-9a4d71751d3b
f926b026-9fdb-43f2-981f-c8bd92283396	2025-11-05 16:25:02.746859+00	2025-11-05 16:25:02.746859+00	\N	t	purchase_receipt	2025-11-05 16:25:02.746859+00	100.0000	0.0000	100.0000	10.0000	1000.0000	purchase_order	c30213d1-3a6e-4001-b6db-1d49705fe2cf	Purchase order received: PO-000005	\N	a6f3f2b7-f292-408b-912d-f613e31e179c
af5741f0-6337-447d-a3e1-02475b250a81	2025-11-06 12:59:33.31199+00	2025-11-06 12:59:33.31199+00	\N	t	sale	2025-11-06 12:59:33.311+00	-100.0000	100.0000	0.0000	\N	\N	sales_order	21511ddf-f02b-4599-8c43-0dc827b9260b	Sales order fulfillment: SO-000003	\N	a6f3f2b7-f292-408b-912d-f613e31e179c
9ed9754d-f7a1-49e7-a3f2-a823e40579b3	2025-11-01 15:56:41.506228+00	2025-11-21 13:42:26.598646+00	\N	t	purchase_receipt	2025-11-01 15:56:41.506228+00	152.0000	179.0000	331.0000	15.2500	2318.0000	purchase_order	187fc444-db2d-4934-83a5-37c61a41dd4c	Purchase order received: PO-000003	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
cb008055-3343-4217-9d3c-6bf044811ae2	2025-11-19 15:32:13.821386+00	2025-11-21 13:42:26.608377+00	\N	t	adjustment_decrease	2025-11-19 15:32:13.821386+00	-1.0000	331.0000	330.0000	16.1864	16.1864	stock_adjustment	fd5354f5-97ee-4078-84fd-8332a96b0463	Stock Adjustment SA-000001	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
dfc4a44c-a9c9-4fad-8458-f832290bc954	2025-11-19 15:33:02.632924+00	2025-11-21 13:42:26.617318+00	\N	t	adjustment_increase	2025-11-19 15:33:02.632924+00	1.0000	330.0000	331.0000	16.1864	16.1864	stock_adjustment	fd5354f5-97ee-4078-84fd-8332a96b0463	Revert Stock Adjustment SA-000001	Reverting adjustment back to draft: 	85294f77-4e65-4c4d-9c48-173ed37712cb
25155cd5-90f6-455d-870a-5064bb530149	2025-11-19 15:33:10.025379+00	2025-11-21 13:42:26.627322+00	\N	t	adjustment_decrease	2025-11-19 15:33:10.025379+00	-1.0000	331.0000	330.0000	16.1864	16.1864	stock_adjustment	fd5354f5-97ee-4078-84fd-8332a96b0463	Stock Adjustment SA-000001	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
f856067f-17ef-467f-b581-f4bc2b08f832	2025-11-21 13:13:11.868189+00	2025-11-21 13:42:26.638259+00	\N	t	purchase_receipt	2025-11-21 13:13:11.868189+00	100.0000	330.0000	430.0000	13.0000	1300.0000	purchase_order	0db8893f-d848-4813-b7dd-a8e65f4e9f7d	Purchase order received: PO-000006	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
068bb5d7-4eb0-4baa-84c9-c1b826cee9f2	2025-11-21 13:42:32.522413+00	2025-11-21 13:42:32.522413+00	\N	t	sale	2025-11-21 13:42:32.52+00	-178.0000	430.0000	252.0000	\N	\N	sales_order	5c6a8dc0-fcf4-4026-b0a7-967d7c5cda18	Sales order fulfillment: SO-000002	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
10be1b28-f2b9-4f13-ac89-2d9741dca9c5	2025-11-21 13:53:18.832175+00	2025-11-21 13:53:18.832175+00	\N	t	sale	2025-11-21 13:53:18.831+00	-1.0000	0.0000	-1.0000	\N	\N	sales_order	ef413e59-8b2b-4311-8e11-fa70ddf7d669	Sales order fulfillment: SO-000004	\N	53a2221a-be2d-4c8e-a5aa-3bd0f7bcddb0
df20a701-5796-4dac-b10c-299fb0924bf9	2025-11-21 16:18:44.172535+00	2025-11-21 16:18:44.172535+00	\N	t	adjustment_increase	2025-11-21 16:18:44.172535+00	1.0000	0.0000	1.0000	10.0000	10.0000	stock_adjustment	c05e9c61-ab61-41d3-a3a4-c89b0839e6f5	Stock Adjustment SA-000002	\N	a6f3f2b7-f292-408b-912d-f613e31e179c
958e29a4-3d59-4982-ad79-1bfb1f99cda1	2025-11-21 17:18:47.401693+00	2025-11-21 17:18:47.401693+00	\N	t	sale	2025-11-21 17:18:47.4+00	-1.0000	252.0000	251.0000	\N	\N	sales_order	6c0b72ad-8415-479d-b8e6-fc2d62c767a4	Sales order fulfillment: SO-000005	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
f4f69cf7-8146-4cb3-b6be-a3690dd383d5	2025-11-21 17:27:48.524761+00	2025-11-21 17:27:48.524761+00	\N	t	sale	2025-11-21 17:27:48.523+00	-1.0000	251.0000	250.0000	\N	\N	sales_order	c66d7700-aca7-4dea-bd44-40fa9062c1ff	Sales order fulfillment: SO-000006	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
37c92ebe-72c1-4a9e-b2a0-af8c39158569	2025-11-21 17:51:00.439952+00	2025-11-21 17:51:00.439952+00	\N	t	sale	2025-11-21 17:51:00.438+00	-1.0000	250.0000	249.0000	\N	\N	sales_order	26589ef1-0651-4d5b-9ddf-1e30afccc701	Sales order fulfillment: SO-000007	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
fcd88c99-6c79-4d2c-af74-77a4c419cc5d	2025-11-21 17:51:57.4444+00	2025-11-22 17:52:26.687709+00	\N	t	adjustment_decrease	2025-11-21 17:51:57.4444+00	-1.0000	249.0000	248.0000	13.9704	13.9704	stock_adjustment	eeab0b77-27b1-4ae6-932d-fa2457b2debf	Stock Adjustment SA-000003	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
350fdd5e-fb0a-4280-8567-36eb8883a03e	2025-11-21 17:57:22.98444+00	2025-11-22 17:52:26.696893+00	\N	t	adjustment_decrease	2025-11-21 17:57:22.98444+00	-1.0000	248.0000	247.0000	13.9704	13.9704	stock_adjustment	96b1acd7-e345-4b05-89d2-4fbf4b14b6f7	Stock Adjustment SA-000004	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
fa2ecd9f-463e-4169-97fa-feba822aef22	2025-11-25 17:04:14.170772+00	2025-12-16 04:45:14.537255+00	\N	t	sale	2025-11-25 17:04:14.169+00	-1.0000	247.0000	246.0000	\N	\N	sales_order	c7d24068-6867-4b8b-aa87-1378dcb9f67d	Sales order fulfillment: SO-000012	\N	85294f77-4e65-4c4d-9c48-173ed37712cb
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.suppliers (id, "createdAt", "updatedAt", "deletedAt", "isActive", type, "companyName", "contactPerson", phone, "totalPurchases", "totalOrders", "lastPurchaseDate", "firstPurchaseDate", notes, "streetAddress", city, state, "postalCode", country) FROM stdin;
5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	2025-10-30 16:53:40.737896+00	2025-12-20 03:12:44.52186+00	\N	t	local	Company875	\N	313131	33475.7859	23	2025-12-19 16:55:35.259+00	2025-10-30 16:54:11.841+00	\N	13123131	313131	31313	131313	13131
33fcda59-4698-4131-a681-fd610d212a96	2025-11-20 14:09:55.56023+00	2025-11-20 14:24:17.845788+00	\N	t	local	Company B	\N	\N	1300.0000	1	2025-11-20 14:24:17.839+00	2025-11-20 14:24:17.839+00	\N	\N	\N	\N	\N	\N
d1178f1c-5003-4421-85aa-f855ef3c5516	2025-12-14 14:29:20.132805+00	2025-12-14 14:32:50.583354+00	2025-12-14 14:32:50.583354+00	t	local	Test Address Supplier Co.	John Smith	+1234567890	0.0000	0	\N	\N	Test supplier for address validation	456 Updated Business Boulevard	Silicon Valley	CA	94025	USA
3599b9ff-52aa-4f4a-8778-3b016a0218d4	2025-11-22 19:41:29.545592+00	2025-12-14 14:33:47.880669+00	\N	t	local	aasda	aaa	123456	0.0000	0	\N	\N	\N	242	resrs	sfs	wsrw	wrwrw
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.users (id, "createdAt", "updatedAt", "deletedAt", "isActive", username, email, password, "firstName", "lastName", "phoneNumber", role, status, "lastLoginAt", "lastLoginIp", "failedLoginAttempts", "lockedUntil", notes) FROM stdin;
\.


--
-- Data for Name: vendor_payments; Type: TABLE DATA; Schema: public; Owner: erp_user
--

COPY public.vendor_payments (id, "createdAt", "updatedAt", "deletedAt", "isActive", "paymentNumber", "supplierId", "purchaseOrderId", "grnId", amount, "paymentDate", "paymentMethod", "referenceNumber", notes, status) FROM stdin;
8a1ae762-4d9d-44eb-ad94-cb5011c051d1	2025-10-30 18:31:23.243277+00	2025-10-30 18:31:23.243277+00	\N	t	VP-000001	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	371b1cad-adf6-4746-849a-1b6be96305df	50541070-2445-42db-bb28-af311556309e	4296.1100	2025-10-30	bank_transfer	\N	Auto-generated payment for PO PO-000001	completed
3f8302d4-7d0c-4eae-9336-378bf9a06496	2025-10-30 18:31:55.969572+00	2025-10-30 18:31:55.969572+00	\N	t	VP-000002	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	84d7962e-94fd-4337-89fb-9c835e19916c	1a637c5e-8a5a-48fc-a42b-c743e0337843	4824.7500	2025-10-30	bank_transfer	\N	Auto-generated payment for PO PO-000002	completed
121ab4a0-f6fc-4759-90d5-ede0b4189518	2025-10-30 19:03:57.305955+00	2025-10-30 19:03:57.305955+00	\N	t	VP-000003	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	b5e5c15b-d8b0-47d0-9a78-877d1591f79d	88254a61-6bae-475d-9427-92dbd0dc1e8d	10.0000	2025-10-30	bank_transfer	\N	Auto-generated payment for PO PO-000004	completed
6110d314-6f87-43c7-875c-a765b82f1e18	2025-11-01 15:56:40.71281+00	2025-11-01 15:56:40.71281+00	\N	t	VP-000004	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	187fc444-db2d-4934-83a5-37c61a41dd4c	961ceac5-a1ae-4d0b-8a62-f00ad60a4cd0	4895.7600	2025-11-01	bank_transfer	\N	Auto-generated payment for PO PO-000003	completed
43340d8d-0274-4fd9-88a4-3c61eaf6298c	2025-11-05 16:25:01.930618+00	2025-11-05 16:25:01.930618+00	\N	t	VP-000005	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	c30213d1-3a6e-4001-b6db-1d49705fe2cf	5b1a4f3c-391f-46b3-b1fc-5e393d9146bd	1000.0000	2025-11-05	bank_transfer	\N	Auto-generated payment for PO PO-000005	completed
bed8d2ff-8f55-4aa1-814a-15abd1a32372	2025-11-21 13:13:11.131744+00	2025-11-21 13:13:11.131744+00	\N	t	VP-000006	33fcda59-4698-4131-a681-fd610d212a96	0db8893f-d848-4813-b7dd-a8e65f4e9f7d	95fc8d7d-cfd0-41c7-938a-6d85bfb73a77	1300.0000	2025-11-21	bank_transfer	\N	Auto-generated payment for PO PO-000006	completed
cd4ca39d-f497-44ca-8b2b-240ad5035ece	2025-12-16 14:50:03.713956+00	2025-12-16 14:50:03.7311+00	\N	t	VP-000007	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	93d09a39-e841-409d-847d-6aa3a7e99b66	10.0000	2025-12-16	cash	\N	Payment recorded via system	pending
bedb5bc7-5ff9-407b-9ee0-ab64e30b2a58	2025-12-16 14:50:10.721261+00	2025-12-16 14:50:10.738875+00	\N	t	VP-000008	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	93d09a39-e841-409d-847d-6aa3a7e99b66	12.9904	2025-12-16	cash	\N	Payment recorded via system	pending
a8284268-148a-42c9-a22b-50fa010122cd	2025-12-16 14:52:21.215053+00	2025-12-16 14:52:21.234787+00	\N	t	VP-000009	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	dcdd3361-dd54-4f8e-85cb-d7f4aa254474	10.0000	2025-12-16	cash	\N	Payment recorded via system	pending
a97295f2-2d99-4712-8e4d-bee3cef9067a	2025-12-16 14:53:00.850501+00	2025-12-16 14:53:00.876166+00	\N	t	VP-000010	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	dcdd3361-dd54-4f8e-85cb-d7f4aa254474	10.0000	2025-12-16	cash	\N	Payment recorded via system	pending
f68b3b9e-6ca7-4178-b4b0-215c0d0af0f0	2025-12-16 14:55:28.700784+00	2025-12-16 14:55:28.71658+00	\N	t	VP-000011	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	dcdd3361-dd54-4f8e-85cb-d7f4aa254474	4.4236	2025-12-16	cash	\N	Payment recorded via system	pending
6cfd798b-81f7-458e-a8a8-6391b24c29d6	2025-12-16 15:01:50.026835+00	2025-12-16 15:01:50.042398+00	\N	t	VP-000012	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	10.0000	2025-12-16	cash	\N	Payment recorded via system	pending
d50bf2cd-d4f1-48b7-9a76-d356a3d5d2fd	2025-12-16 15:09:15.305099+00	2025-12-16 15:09:15.353756+00	\N	t	VP-000013	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	4.4338	2025-12-16	cash	\N	Payment recorded via system	completed
e6e3bad5-ddee-4670-9a02-6be5f1cec38e	2025-12-16 15:40:19.511641+00	2025-12-16 15:40:19.552391+00	\N	t	VP-000014	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	0.0662	2025-12-16	cash	\N	Payment recorded via system	completed
d683407c-0cba-44c8-b397-5cecc9d9fbcd	2025-12-16 16:18:25.575381+00	2025-12-16 16:18:25.812247+00	\N	t	VP-000015	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	0.1000	2025-12-17	cash	\N	Payment recorded via system	completed
d73dda59-baa0-4207-a649-aea83f3a951d	2025-12-16 16:36:44.094758+00	2025-12-16 16:36:44.423068+00	\N	t	VP-000016	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.4000	2025-12-17	cash	\N	Payment recorded via system	completed
fcf37b41-5e58-4d92-8325-c37e0af515a8	2025-12-16 16:37:41.751629+00	2025-12-16 16:37:41.751629+00	\N	t	VP-TEST-001	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	854e9e99-7045-4459-90e5-b4c0a8956d91	ba4e8f16-1484-4bb3-87d3-0570cbaee699	1.0000	2025-12-16	cash	\N	\N	completed
edc342cf-84a7-4229-acdb-fc1ebf0298fa	2025-12-16 16:52:57.751494+00	2025-12-16 16:52:58.240971+00	\N	t	VP-000NaN	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-17	cash	\N	Payment recorded via system	completed
6374cbe6-2282-41e7-8878-083e9991c0b4	2025-12-16 17:19:57.094513+00	2025-12-16 17:19:57.129398+00	\N	t	VP-000017	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	15.0000	2025-12-16	cash	\N	Payment recorded via system	completed
f44960b8-1d51-4a44-ba43-64e6f9ebb55d	2025-12-16 17:29:14.804412+00	2025-12-16 17:29:14.845493+00	\N	t	VP-000018	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-16	cash	\N	Payment recorded via system	completed
5f5d2a8c-106b-43cc-b399-a459faec24db	2025-12-16 17:30:07.0582+00	2025-12-16 17:30:07.0582+00	\N	t	VP-DIRECT-TEST	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	854e9e99-7045-4459-90e5-b4c0a8956d91	ba4e8f16-1484-4bb3-87d3-0570cbaee699	99.0000	2025-12-16	cash	\N	Direct test	completed
a439c110-20c9-45a7-a699-abe45569595f	2025-12-16 17:39:30.895745+00	2025-12-16 17:39:30.932907+00	\N	t	VP-000019	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-16	cash	\N	Payment recorded via system	completed
47d1602c-2544-43a0-9bea-297c1fcd6d87	2025-12-16 17:42:20.520724+00	2025-12-16 17:42:20.554596+00	\N	t	VP-000020	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	\N	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-16	cash	\N	Payment recorded via system	completed
9e9ea475-5bff-4a84-ae80-c2177fac7ca9	2025-12-16 17:53:32.340342+00	2025-12-16 17:53:32.340342+00	\N	t	VP-000021	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	854e9e99-7045-4459-90e5-b4c0a8956d91	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-16	cash	\N	Payment recorded via system	completed
1f7f1295-7aba-4892-a92f-dc31fb245cad	2025-12-16 17:54:02.681795+00	2025-12-16 17:54:02.681795+00	\N	t	VP-000022	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	854e9e99-7045-4459-90e5-b4c0a8956d91	ba4e8f16-1484-4bb3-87d3-0570cbaee699	5.0000	2025-12-16	cash	\N	Payment recorded via system	completed
5421bb52-8076-4d12-b75a-9923dd332361	2025-12-16 18:01:32.666346+00	2025-12-16 18:01:32.666346+00	\N	t	VP-000023	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	87ffa09e-fa46-4621-9db5-b72f1fee8746	5d7f42f7-6d33-48d9-8a29-96fd605ae124	10.0000	2025-12-16	cash	\N	Payment recorded via system	completed
6cb9b629-d439-4d5c-9454-92ca96e496ef	2025-12-16 18:30:38.955454+00	2025-12-16 18:30:38.955454+00	\N	t	VP-000024	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	748f77f6-1a0e-4e9c-b98c-e538f0bad6cd	d7ee09b8-9f57-471a-b2bb-ebff4b098392	10.0000	2025-12-16	cash	\N	Payment recorded via system	completed
2597a330-2fe4-4688-819b-a5b0cf9d2502	2025-12-17 14:28:21.719321+00	2025-12-17 14:28:21.719321+00	\N	t	VP-000025	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	4013e391-9e3a-4b07-ad46-000a9f29ea94	519d7549-a1ea-482d-94d8-b8bc59ae2e8a	1.0000	2025-12-17	cash	\N	Payment recorded via system	completed
a13d5e60-c5b7-426b-bfb9-2d8e1a15753b	2025-12-17 14:28:44.485728+00	2025-12-17 14:28:44.485728+00	\N	t	VP-000026	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	77ecde84-02ae-4371-bd6b-4ebc898712d9	5a51deec-c835-423b-a6b8-c98020ecce8a	1.0000	2025-12-17	cash	\N	Payment recorded via system	completed
0e86c050-4f84-4e15-b1e7-8c7d435111dd	2025-12-17 14:39:31.514762+00	2025-12-17 14:39:31.514762+00	\N	t	VP-000027	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	983681ef-0bb3-433a-9c98-6a8bbdade071	69b63e21-125a-42a5-8b71-ee0c81301cd6	1.0000	2025-12-17	cash	\N	Payment recorded via system	completed
e2fd9461-d62d-4a98-a546-f6f282023a49	2025-12-17 15:40:37.086497+00	2025-12-17 15:40:37.086497+00	\N	t	VP-000028	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	a0e19891-7f00-4cb5-89dd-6e664f218c0e	e6304a67-818c-4f07-ac75-10ac92bf524c	10.0000	2025-12-17	cash	\N	Payment recorded via system	completed
74f75d5e-4c9e-4b43-b907-baf836e950ad	2025-12-19 16:55:42.598598+00	2025-12-19 16:55:42.598598+00	\N	t	VP-000029	5b5220f7-b236-4e5d-a4cb-aa6de7930fe0	b6b0e2f0-0dd4-47a8-828f-3c86a6909d31	a96fbd0a-7518-4973-a912-fe36001f5a24	14.4338	2025-12-19	cash	\N	Payment recorded via system	completed
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: erp_user
--

SELECT pg_catalog.setval('public.migrations_id_seq', 33, true);


--
-- Name: company_settings PK_036b4634217db79c17305442dbe; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT "PK_036b4634217db79c17305442dbe" PRIMARY KEY (id);


--
-- Name: goods_received_notes PK_038ce46920fcf1dd05dcb776514; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT "PK_038ce46920fcf1dd05dcb776514" PRIMARY KEY (id);


--
-- Name: purchase_orders PK_05148947415204a897e8beb2553; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "PK_05148947415204a897e8beb2553" PRIMARY KEY (id);


--
-- Name: products PK_0806c755e0aca124e67c0cf6d7d; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY (id);


--
-- Name: price_costing_settings PK_0f232a720603e954d03d7851eba; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.price_costing_settings
    ADD CONSTRAINT "PK_0f232a720603e954d03d7851eba" PRIMARY KEY (id);


--
-- Name: customers PK_133ec679a801fab5e070f73d3ea; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY (id);


--
-- Name: payments PK_197ab7af18c93fbb0c9b28b4a59; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id);


--
-- Name: categories PK_24dbc6126a28ff948da33e97d3b; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY (id);


--
-- Name: stock_adjustment_items PK_428a603db1761a92d021d00f65f; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_adjustment_items
    ADD CONSTRAINT "PK_428a603db1761a92d021d00f65f" PRIMARY KEY (id);


--
-- Name: sales_orders PK_5328297e067ca929fbe7cf989dd; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT "PK_5328297e067ca929fbe7cf989dd" PRIMARY KEY (id);


--
-- Name: invoice_items PK_53b99f9e0e2945e69de1a12b75a; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "PK_53b99f9e0e2945e69de1a12b75a" PRIMARY KEY (id);


--
-- Name: stock_movements PK_57a26b190618550d8e65fb860e7; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY (id);


--
-- Name: invoices PK_668cef7c22a427fd822cc1be3ce; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY (id);


--
-- Name: stock_adjustments PK_7dc03d92f242dd489d33b80d063; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT "PK_7dc03d92f242dd489d33b80d063" PRIMARY KEY (id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: vendor_payments PK_90ac4c49a72f71adc03762add2d; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT "PK_90ac4c49a72f71adc03762add2d" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: sales_order_items PK_a5f8d983ae4db44dcc923faf2ef; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT "PK_a5f8d983ae4db44dcc923faf2ef" PRIMARY KEY (id);


--
-- Name: suppliers PK_b70ac51766a9e3144f778cfe81e; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY (id);


--
-- Name: purchase_cost_history PK_b82957e1288fdf48a2857f14420; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_cost_history
    ADD CONSTRAINT "PK_b82957e1288fdf48a2857f14420" PRIMARY KEY (id);


--
-- Name: plugins PK_bb3d17826b76295957a253ba73e; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT "PK_bb3d17826b76295957a253ba73e" PRIMARY KEY (id);


--
-- Name: print_settings PK_bcdd1972ac4884eb966f9756f38; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT "PK_bcdd1972ac4884eb966f9756f38" PRIMARY KEY (id);


--
-- Name: goods_received_note_items PK_cbfa9462fc165dc391657dd0fe3; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_note_items
    ADD CONSTRAINT "PK_cbfa9462fc165dc391657dd0fe3" PRIMARY KEY (id);


--
-- Name: purchase_order_items PK_e8b7568d25c41e3290db596b312; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "PK_e8b7568d25c41e3290db596b312" PRIMARY KEY (id);


--
-- Name: stock_adjustments UQ_043a83d3e28667389c00b71a22c; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT "UQ_043a83d3e28667389c00b71a22c" UNIQUE ("adjustmentNumber");


--
-- Name: plugins UQ_0479844f05c1132f8929cab1c8a; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT "UQ_0479844f05c1132f8929cab1c8a" UNIQUE (name);


--
-- Name: purchase_orders UQ_0a4ef1738b13da938b62393dc04; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "UQ_0a4ef1738b13da938b62393dc04" UNIQUE ("orderNumber");


--
-- Name: plugins UQ_7b3b7167b2c13f731fde039c085; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT "UQ_7b3b7167b2c13f731fde039c085" UNIQUE (identifier);


--
-- Name: goods_received_notes UQ_7d5121a8e10392f758b27b32e68; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT "UQ_7d5121a8e10392f758b27b32e68" UNIQUE ("grnNumber");


--
-- Name: vendor_payments UQ_8e6533beb23d3e917150e71f874; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT "UQ_8e6533beb23d3e917150e71f874" UNIQUE ("paymentNumber");


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: payments UQ_a4faec749345edbe3aa3e3b4d47; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "UQ_a4faec749345edbe3aa3e3b4d47" UNIQUE ("paymentNumber");


--
-- Name: products UQ_adfc522baf9d9b19cd7d9461b7e; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "UQ_adfc522baf9d9b19cd7d9461b7e" UNIQUE (barcode);


--
-- Name: invoices UQ_bf8e0f9dd4558ef209ec111782d; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "UQ_bf8e0f9dd4558ef209ec111782d" UNIQUE ("invoiceNumber");


--
-- Name: sales_orders UQ_ea901f7691ec7f314f072d9dee8; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT "UQ_ea901f7691ec7f314f072d9dee8" UNIQUE ("orderNumber");


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: IDX_043a83d3e28667389c00b71a22; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_043a83d3e28667389c00b71a22" ON public.stock_adjustments USING btree ("adjustmentNumber");


--
-- Name: IDX_0479844f05c1132f8929cab1c8; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_0479844f05c1132f8929cab1c8" ON public.plugins USING btree (name);


--
-- Name: IDX_0a4ef1738b13da938b62393dc0; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_0a4ef1738b13da938b62393dc0" ON public.purchase_orders USING btree ("orderNumber");


--
-- Name: IDX_0c3ff892a9f2ed16f59d31ccca; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_0c3ff892a9f2ed16f59d31ccca" ON public.purchase_orders USING btree ("supplierId");


--
-- Name: IDX_100eef6409ee96d0673ee510e6; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_100eef6409ee96d0673ee510e6" ON public.plugins USING btree (status);


--
-- Name: IDX_11dc46e10639fc4819f045ee6b; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_11dc46e10639fc4819f045ee6b" ON public.goods_received_notes USING btree ("purchaseOrderId");


--
-- Name: IDX_17e3734d294fe84a440c9f304d; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_17e3734d294fe84a440c9f304d" ON public.stock_movements USING btree ("referenceType", "referenceId");


--
-- Name: IDX_1b086ceed97e71200cdfd8a9de; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_1b086ceed97e71200cdfd8a9de" ON public.purchase_order_items USING btree (status);


--
-- Name: IDX_1de7eb246940b05765d2c99a7e; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_1de7eb246940b05765d2c99a7e" ON public.purchase_order_items USING btree ("purchaseOrderId");


--
-- Name: IDX_1df049f8943c6be0c1115541ef; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_1df049f8943c6be0c1115541ef" ON public.invoices USING btree ("customerId");


--
-- Name: IDX_2717eb052d24c9623498b7e8a1; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_2717eb052d24c9623498b7e8a1" ON public.stock_adjustments USING btree ("adjustmentDate");


--
-- Name: IDX_27faf14e8959f0e40d7b722dc0; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_27faf14e8959f0e40d7b722dc0" ON public.payments USING btree ("paymentDate");


--
-- Name: IDX_2a1f164548627f45fdd82f2066; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_2a1f164548627f45fdd82f2066" ON public.goods_received_note_items USING btree ("purchaseOrderItemId");


--
-- Name: IDX_32b41cdb985a296213e9a928b5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON public.payments USING btree (status);


--
-- Name: IDX_35ee1cb5098e17e30ee5cbc705; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_35ee1cb5098e17e30ee5cbc705" ON public.plugins USING btree (type);


--
-- Name: IDX_36904321ead23a5735f9eef7b2; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_36904321ead23a5735f9eef7b2" ON public.goods_received_note_items USING btree ("grnId");


--
-- Name: IDX_40946e98ab87148f58703fa1c5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_40946e98ab87148f58703fa1c5" ON public.customers USING btree ("isActive");


--
-- Name: IDX_43d19956aeab008b49e0804c14; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_43d19956aeab008b49e0804c14" ON public.payments USING btree ("invoiceId");


--
-- Name: IDX_45080b47646b52ab371e4bf001; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_45080b47646b52ab371e4bf001" ON public.stock_adjustments USING btree (status);


--
-- Name: IDX_476d93a57a1603d283181bf00a; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_476d93a57a1603d283181bf00a" ON public.goods_received_note_items USING btree ("productId");


--
-- Name: IDX_4c9fb58de893725258746385e1; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_4c9fb58de893725258746385e1" ON public.products USING btree (name);


--
-- Name: IDX_4e2e8a1fd6c764003d4f962af4; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_4e2e8a1fd6c764003d4f962af4" ON public.customers USING btree ("pricingScheme");


--
-- Name: IDX_591aca148f00fd61c720c81424; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_591aca148f00fd61c720c81424" ON public.stock_movements USING btree ("movementType");


--
-- Name: IDX_602b8b0355735d0c97294acb3f; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_602b8b0355735d0c97294acb3f" ON public.goods_received_notes USING btree (status);


--
-- Name: IDX_696ae281d8c0ff6f86c5a658b2; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_696ae281d8c0ff6f86c5a658b2" ON public.invoices USING btree ("invoiceDate");


--
-- Name: IDX_6b67146a69ed5fe5fe7f3224d3; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_6b67146a69ed5fe5fe7f3224d3" ON public.sales_order_items USING btree ("salesOrderId");


--
-- Name: IDX_73ea4840fc9114a341502b5054; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_73ea4840fc9114a341502b5054" ON public.suppliers USING btree (type);


--
-- Name: IDX_7b3b7167b2c13f731fde039c08; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_7b3b7167b2c13f731fde039c08" ON public.plugins USING btree (identifier);


--
-- Name: IDX_7bec360ed9928668b73dac2ec1; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_7bec360ed9928668b73dac2ec1" ON public.invoice_items USING btree ("productId");


--
-- Name: IDX_7d5121a8e10392f758b27b32e6; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_7d5121a8e10392f758b27b32e6" ON public.goods_received_notes USING btree ("grnNumber");


--
-- Name: IDX_7fb50d0b66a6167f82314895f5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_7fb50d0b66a6167f82314895f5" ON public.vendor_payments USING btree ("supplierId", status);


--
-- Name: IDX_7fb6895fc8fad9f5200e91abb5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_7fb6895fc8fad9f5200e91abb5" ON public.invoice_items USING btree ("invoiceId");


--
-- Name: IDX_804c9e218b77e89e488b7fbfba; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_804c9e218b77e89e488b7fbfba" ON public.stock_movements USING btree (quantity);


--
-- Name: IDX_824be6feda5e655c49c4e0c534; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_824be6feda5e655c49c4e0c534" ON public.payments USING btree ("customerId");


--
-- Name: IDX_876c06b5396f3c4acb7144ca92; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_876c06b5396f3c4acb7144ca92" ON public.suppliers USING btree ("isActive");


--
-- Name: IDX_88acd889fbe17d0e16cc4bc917; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_88acd889fbe17d0e16cc4bc917" ON public.customers USING btree (phone);


--
-- Name: IDX_8927499592cf39c177c4639976; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_8927499592cf39c177c4639976" ON public.invoices USING btree ("salesOrderId");


--
-- Name: IDX_89f7d0e12b07146088771d9292; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_89f7d0e12b07146088771d9292" ON public.stock_adjustment_items USING btree ("productId");


--
-- Name: IDX_8be43e7dd0ae89d236418c690c; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_8be43e7dd0ae89d236418c690c" ON public.purchase_orders USING btree ("orderDate");


--
-- Name: IDX_93f1348901243704741e276a2e; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_93f1348901243704741e276a2e" ON public.goods_received_notes USING btree ("receivedDate");


--
-- Name: IDX_95836cf122ca5a4eb2e40ea552; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_95836cf122ca5a4eb2e40ea552" ON public.sales_order_items USING btree ("productId");


--
-- Name: IDX_97672ac88f789774dd47f7c8be; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON public.users USING btree (email);


--
-- Name: IDX_994af44e59f0a97eb2e21a5f66; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_994af44e59f0a97eb2e21a5f66" ON public.users USING btree ("isActive", status);


--
-- Name: IDX_9978ca165b4c0f27571f3d1d92; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_9978ca165b4c0f27571f3d1d92" ON public.sales_orders USING btree ("customerId");


--
-- Name: IDX_9a6f051e66982b5f0318981bca; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_9a6f051e66982b5f0318981bca" ON public.categories USING btree ("parentId");


--
-- Name: IDX_a1c9067a5e8b5aa4b5a9b357ec; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_a1c9067a5e8b5aa4b5a9b357ec" ON public.categories USING btree (name, "parentId");


--
-- Name: IDX_a23bf8737a4dd516f5736376e9; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_a23bf8737a4dd516f5736376e9" ON public.stock_adjustment_items USING btree ("stockAdjustmentId");


--
-- Name: IDX_a3acb59db67e977be45e382fc5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_a3acb59db67e977be45e382fc5" ON public.stock_movements USING btree ("productId");


--
-- Name: IDX_a4faec749345edbe3aa3e3b4d4; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_a4faec749345edbe3aa3e3b4d4" ON public.payments USING btree ("paymentNumber");


--
-- Name: IDX_ac0f09364e3701d9ed35435288; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ac0f09364e3701d9ed35435288" ON public.invoices USING btree (status);


--
-- Name: IDX_adfc522baf9d9b19cd7d9461b7; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_adfc522baf9d9b19cd7d9461b7" ON public.products USING btree (barcode);


--
-- Name: IDX_b9ab4db6fbe12384c8f7e6eb30; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_b9ab4db6fbe12384c8f7e6eb30" ON public.stock_movements USING btree ("movementDate");


--
-- Name: IDX_bf8e0f9dd4558ef209ec111782; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_bf8e0f9dd4558ef209ec111782" ON public.invoices USING btree ("invoiceNumber");


--
-- Name: IDX_c23dd23f2c31fccc97adb7b6e5; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_c23dd23f2c31fccc97adb7b6e5" ON public.goods_received_notes USING btree ("supplierId");


--
-- Name: IDX_c929408ab43003b2a331322fb3; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_c929408ab43003b2a331322fb3" ON public.purchase_cost_history USING btree ("productId", "remainingQuantity");


--
-- Name: IDX_ca4efcb2224db51459f018ee2e; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ca4efcb2224db51459f018ee2e" ON public.categories USING btree (path);


--
-- Name: IDX_d0a1444aa92229d7f1af237184; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_d0a1444aa92229d7f1af237184" ON public.plugins USING btree ("isActive");


--
-- Name: IDX_d5662d5ea5da62fc54b0f12a46; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_d5662d5ea5da62fc54b0f12a46" ON public.products USING btree (type);


--
-- Name: IDX_d6ee2d4bf901675877bb94977c; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_d6ee2d4bf901675877bb94977c" ON public.users USING btree (role, status);


--
-- Name: IDX_dd44f67433aadad2785aecd5be; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_dd44f67433aadad2785aecd5be" ON public.customers USING btree (type);


--
-- Name: IDX_ddc57d61f6518481a25ea9c9aa; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ddc57d61f6518481a25ea9c9aa" ON public.plugins USING btree ("installedDate");


--
-- Name: IDX_ea901f7691ec7f314f072d9dee; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_ea901f7691ec7f314f072d9dee" ON public.sales_orders USING btree ("orderNumber");


--
-- Name: IDX_ef7f8f1699296ab0bfabc5fd48; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ef7f8f1699296ab0bfabc5fd48" ON public.suppliers USING btree (phone);


--
-- Name: IDX_f08364f59c0933ae0583a4f530; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_f08364f59c0933ae0583a4f530" ON public.vendor_payments USING btree ("grnId");


--
-- Name: IDX_f1d44769daeb2f0c001f640e89; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_f1d44769daeb2f0c001f640e89" ON public.vendor_payments USING btree ("paymentDate");


--
-- Name: IDX_f87b1b82a3aff16d1cb5e49a65; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_f87b1b82a3aff16d1cb5e49a65" ON public.purchase_order_items USING btree ("productId");


--
-- Name: IDX_fbb017b75d15fa15e821535ab2; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_fbb017b75d15fa15e821535ab2" ON public.purchase_cost_history USING btree ("productId", "receivedDate");


--
-- Name: IDX_fe0bb3f6520ee0469504521e71; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON public.users USING btree (username);


--
-- Name: IDX_ff39b9ac40872b2de41751eedc; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ff39b9ac40872b2de41751eedc" ON public.products USING btree ("isActive");


--
-- Name: IDX_ff56834e735fa78a15d0cf2192; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_ff56834e735fa78a15d0cf2192" ON public.products USING btree ("categoryId");


--
-- Name: IDX_fffc00bae87b600c1979dc0159; Type: INDEX; Schema: public; Owner: erp_user
--

CREATE INDEX "IDX_fffc00bae87b600c1979dc0159" ON public.sales_orders USING btree ("orderDate");


--
-- Name: purchase_orders FK_0c3ff892a9f2ed16f59d31cccae; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "FK_0c3ff892a9f2ed16f59d31cccae" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: vendor_payments FK_10e453c3de2d44d36c05fa3a531; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT "FK_10e453c3de2d44d36c05fa3a531" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id);


--
-- Name: goods_received_notes FK_11dc46e10639fc4819f045ee6b1; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT "FK_11dc46e10639fc4819f045ee6b1" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON DELETE SET NULL;


--
-- Name: purchase_order_items FK_1de7eb246940b05765d2c99a7ec; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "FK_1de7eb246940b05765d2c99a7ec" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: invoices FK_1df049f8943c6be0c1115541efb; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_1df049f8943c6be0c1115541efb" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: goods_received_note_items FK_2a1f164548627f45fdd82f2066b; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_note_items
    ADD CONSTRAINT "FK_2a1f164548627f45fdd82f2066b" FOREIGN KEY ("purchaseOrderItemId") REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;


--
-- Name: goods_received_note_items FK_36904321ead23a5735f9eef7b28; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_note_items
    ADD CONSTRAINT "FK_36904321ead23a5735f9eef7b28" FOREIGN KEY ("grnId") REFERENCES public.goods_received_notes(id) ON DELETE CASCADE;


--
-- Name: vendor_payments FK_4336c8e492b1a628c00c89345c9; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT "FK_4336c8e492b1a628c00c89345c9" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id);


--
-- Name: payments FK_43d19956aeab008b49e0804c145; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_43d19956aeab008b49e0804c145" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: goods_received_note_items FK_476d93a57a1603d283181bf00a2; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_note_items
    ADD CONSTRAINT "FK_476d93a57a1603d283181bf00a2" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items FK_6b67146a69ed5fe5fe7f3224d31; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT "FK_6b67146a69ed5fe5fe7f3224d31" FOREIGN KEY ("salesOrderId") REFERENCES public.sales_orders(id) ON DELETE CASCADE;


--
-- Name: invoice_items FK_7bec360ed9928668b73dac2ec17; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "FK_7bec360ed9928668b73dac2ec17" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: invoice_items FK_7fb6895fc8fad9f5200e91abb59; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "FK_7fb6895fc8fad9f5200e91abb59" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: payments FK_824be6feda5e655c49c4e0c534b; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_824be6feda5e655c49c4e0c534b" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: invoices FK_8927499592cf39c177c46399769; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_8927499592cf39c177c46399769" FOREIGN KEY ("salesOrderId") REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: stock_adjustment_items FK_89f7d0e12b07146088771d9292a; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_adjustment_items
    ADD CONSTRAINT "FK_89f7d0e12b07146088771d9292a" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items FK_95836cf122ca5a4eb2e40ea552c; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT "FK_95836cf122ca5a4eb2e40ea552c" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sales_orders FK_9978ca165b4c0f27571f3d1d924; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT "FK_9978ca165b4c0f27571f3d1d924" FOREIGN KEY ("customerId") REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: categories FK_9a6f051e66982b5f0318981bcaa; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: purchase_cost_history FK_a200937c3bef6072ce44d760fe3; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_cost_history
    ADD CONSTRAINT "FK_a200937c3bef6072ce44d760fe3" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_adjustment_items FK_a23bf8737a4dd516f5736376e90; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_adjustment_items
    ADD CONSTRAINT "FK_a23bf8737a4dd516f5736376e90" FOREIGN KEY ("stockAdjustmentId") REFERENCES public.stock_adjustments(id) ON DELETE CASCADE;


--
-- Name: stock_movements FK_a3acb59db67e977be45e382fc56; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: goods_received_notes FK_c23dd23f2c31fccc97adb7b6e58; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT "FK_c23dd23f2c31fccc97adb7b6e58" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: vendor_payments FK_f08364f59c0933ae0583a4f530e; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT "FK_f08364f59c0933ae0583a4f530e" FOREIGN KEY ("grnId") REFERENCES public.goods_received_notes(id);


--
-- Name: purchase_order_items FK_f87b1b82a3aff16d1cb5e49a656; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "FK_f87b1b82a3aff16d1cb5e49a656" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: products FK_ff56834e735fa78a15d0cf21926; Type: FK CONSTRAINT; Schema: public; Owner: erp_user
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: erp_user
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict dxU2VxONygfip1PHDcrKDkcQJyNMBRKIaGiOOCU6AcAuKTczZ0FIVHzKYKoyHFr

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict Av6FFCSKJ2SaC1NhYlA1z3ARH14beOPZW8pZph7yeicUZbkBYuYE3TCsSPtkfAq

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict Av6FFCSKJ2SaC1NhYlA1z3ARH14beOPZW8pZph7yeicUZbkBYuYE3TCsSPtkfAq

--
-- PostgreSQL database cluster dump complete
--

