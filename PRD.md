# 📄 Product Requirements Document (PRD)

**Project:** ERP Software Development
**Version:** 1.0.0

---

## 1. Overview

### 1.1 Purpose

The ERP software will serve as a **centralized platform** to manage business operations, focusing on **inventory, sales, purchasing, and reporting**. The solution will be **self-hosted** (no cloud dependency) and **Dockerized for consistent deployment**.

### 1.2 Objectives

* Provide a lightweight ERP system for small teams.
* Manage inventory, purchasing, and sales with accurate records.
* Support **multi selling prices** for products.
* Ensure simple reporting for decision-making.
* Designed for up to **5 concurrent users**.

### 1.3 Target Users

* **Small internal teams** (inventory staff, sales staff, procurement staff).
* **Management** (basic reporting).
* **Admins** (system setup, in future scope).

---

## 2. Scope

### 2.1 In-Scope (MVP Release)

* **Inventory Management**

  * Product catalog (name, SKU, category, unit, base cost)
  * Stock tracking (single warehouse only)
  * Multi selling prices (retail, wholesale, special)
  * Stock adjustments

* **Sales & Orders**

  * Sales orders
  * Invoices
  * Customer database
  * Payment recording (basic)

* **Purchasing & Suppliers**

  * Supplier database
  * Purchase orders (PO)
  * Goods received notes (GRN)
  * Supplier invoices (basic recording only)

* **Reporting & Dashboard**

  * Sales summary
  * Stock movement report
  * Supplier purchase summary
  * Export reports (Excel/PDF)

### 2.2 Future Scope

* **User & Role Management** (multi-user roles, access control, audit logs)
* **Warehouse Management** (multi-warehouse, transfers, batch/lot tracking)
* **Quotations** (before order confirmation)
* **Finance Module** (General Ledger, AR, AP, Cash/Bank, Financial Reports)
* **HR & Payroll**
* **CRM (Customer Relationship Management)**
* **Manufacturing Module** (BOM, production planning)
* **Advanced BI & AI-based forecasting**
* **Mobile App (sales & inventory interface)**

---

## 3. Functional Requirements

### 3.1 Inventory Management

* Maintain product catalog with multiple selling prices.
* Track available stock (single warehouse).
* Perform stock adjustments (manual correction).
* Simple product search/filter.

### 3.2 Sales Module

* Record sales orders and invoices.
* Maintain customer list with contact details.
* Apply multiple price levels per product.
* Record payments against invoices.

### 3.3 Purchasing Module

* Create and track purchase orders (PO).
* Record goods received and update stock automatically.
* Record supplier invoices.
* Maintain supplier list.

### 3.4 Reporting & Dashboard

* Sales report by date range.
* Stock movement report (in/out/adjustments).
* Supplier purchase summary.
* Export all reports to Excel/PDF.

---

## 4. Non-Functional Requirements

* **User Limit:** Support up to 5 concurrent users.
* **Deployment:** Self-hosted, Docker containers only (no cloud).
* **Performance:** Optimized for small dataset (SME-level operations).
* **Security:** Basic authentication (future: role-based).
* **Scalability:** Not required beyond 5 users (future expansion possible).
* **Extensibility:** API-first design for potential future integrations.

---

## 5. System Architecture

* **Frontend:** React.js (responsive, SPA)
* **Backend:** Node.js (Express or NestJS)
* **Database:** PostgreSQL (primary), Redis (for caching/session if needed)
* **Deployment:** Docker containers (Linux host)
* **API:** REST with OpenAPI/Swagger documentation

---

## 6. User Interface (Initial Concepts)

* **Dashboard:** Displays sales summary, stock alerts, supplier overview.
* **Sidebar Navigation:** Inventory, Sales, Purchasing, Reports.
* **Tables & Filters:** Searchable and exportable for all modules.
* **Forms:** Intuitive product, order, and supplier entry forms with validation.

---

## 7. Timeline (High-Level)

| Phase         | Deliverables                | Timeline |
| ------------- | --------------------------- | -------- |
| Phase 0       | Setup (Docker, CI/CD, repo) | 2 weeks  |
| Phase 1       | Inventory Module            | 3 weeks  |
| Phase 2       | Sales Module                | 3 weeks  |
| Phase 3       | Purchasing Module           | 3 weeks  |
| Phase 4       | Reporting & Dashboard       | 2 weeks  |
| Phase 5       | Testing, UAT, Documentation | 2 weeks  |
| **Total MVP** | \~15 weeks                  |          |
