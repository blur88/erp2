# Price List Migration Plan

**Migration from JSONB-based Pricing to Normalized Price List Model**

**Status**: Phase 1 Complete - Database Schema Created
**Target Completion**: TBD
**Migration Type**: Zero-downtime with backward compatibility

---

## Executive Summary

This plan outlines the migration from the current JSONB-based pricing system (`Product.pricingTiers`, `Customer.pricingScheme`) to a normalized relational database model using dedicated `PriceList` and `PriceListItem` entities.

### Current System
- **Product Entity**: `pricingTiers` JSONB field storing `{ "Retail": 100.00, "Wholesale": 80.00 }`
- **Customer Entity**: `pricingScheme` string field storing scheme name
- **Settings Entity**: `customerPricingSchemes` JSONB storing scheme configurations

### Target System
- **PriceList Entity**: Master table for pricing schemes
- **PriceListItem Entity**: Product-specific prices per price list
- **Customer Entity**: Foreign key relationship to PriceList
- **Product Entity**: OneToMany relationship with PriceListItem

---

## Migration Phases

### Phase 1: Database Schema Creation ✅ COMPLETED
**Estimated Effort**: 2-3 hours
**Risk Level**: Low
**Completion Date**: 2026-01-12

#### Tasks
1. Create new entity files
   - [x] Create `backend/src/database/entities/price-list.entity.ts`
   - [x] Create `backend/src/database/entities/price-list-item.entity.ts`
   - [x] Export entities in `backend/src/database/entities/index.ts`

2. Update existing entities
   - [x] Add `priceListItems` relationship to `Product` entity
   - [x] Mark `pricingTiers` as deprecated in `Product` entity
   - [x] Add `priceListId` and `priceList` relationship to `Customer` entity
   - [x] Mark `pricingScheme` as deprecated (but keep) in `Customer` entity

3. Generate and review migration
   - [x] Created migration file `1768231502083-CreatePriceListTables.ts`
   - [x] Migration includes proper indexes and foreign keys
   - [x] Tables automatically created by TypeORM synchronize feature
   - [ ] Data migration logic will be added in Phase 2

#### Implementation Notes
- Database schema was auto-created by TypeORM synchronize feature during backend rebuild
- Migration file created manually for documentation and deployment to other environments
- All tables, indexes, and foreign keys verified in production database
- Database structure validated:
  - `price_lists` table: 12 columns with proper indexes and constraints
  - `price_list_items` table: 13 columns with unique constraint on (priceListId, productId)
  - `customers.priceListId`: Foreign key added with ON DELETE SET NULL
- Deprecated fields kept in entities with @deprecated JSDoc comments

#### Acceptance Criteria
- ✅ All entities compile without TypeScript errors
- ✅ Migration file created successfully
- ✅ Migration includes proper indexes and foreign keys
- ✅ Old fields marked as deprecated but not dropped
- ✅ Database tables verified in PostgreSQL
- ✅ All relationships properly configured

---

### Phase 2: Data Migration Script
**Estimated Effort**: 3-4 hours
**Risk Level**: Medium

#### Tasks
1. Create migration logic for price lists
   - [ ] Read existing `customerPricingSchemes` from `price_costing_settings` table
   - [ ] Create `PriceList` records for each scheme
   - [ ] Set first scheme as default (`isDefault = true`)
   - [ ] Handle duplicate scheme names

2. Create migration logic for price list items
   - [ ] Query all products with non-empty `pricingTiers`
   - [ ] For each product, extract pricing tier data
   - [ ] Create `PriceListItem` records linking product to price list
   - [ ] Set `costBasis` from `Product.baseCost`
   - [ ] Handle missing or invalid price data

3. Create migration logic for customer assignments
   - [ ] Query all customers with `pricingScheme` values
   - [ ] Map `pricingScheme` string to `PriceList.id`
   - [ ] Update `Customer.priceListId` with matched price list
   - [ ] Log customers with unmatched pricing schemes

4. Add rollback logic
   - [ ] Implement `down()` migration method
   - [ ] Ensure data can be restored to JSONB fields if needed

5. Create migration validation queries
   - [ ] Count records before migration
   - [ ] Count records after migration
   - [ ] Compare data integrity (prices match)
   - [ ] Create validation report

#### Acceptance Criteria
- ✅ Migration successfully creates all price lists from settings
- ✅ All product prices migrated to price list items
- ✅ All customers linked to correct price lists
- ✅ No data loss during migration
- ✅ Rollback migration works correctly
- ✅ Validation queries show 100% data integrity

---

### Phase 3: Backend Service Layer Updates
**Estimated Effort**: 4-5 hours
**Risk Level**: Medium

#### Tasks
1. Create PriceList module
   - [ ] Create `backend/src/modules/price-lists/` directory structure
   - [ ] Create `price-lists.module.ts`
   - [ ] Create `price-lists.service.ts`
   - [ ] Create `price-lists.controller.ts`
   - [ ] Create DTOs: `create-price-list.dto.ts`, `update-price-list.dto.ts`, `query-price-lists.dto.ts`
   - [ ] Register module in `app.module.ts`

2. Implement PriceList service methods
   - [ ] `findAll()` - List all price lists with pagination
   - [ ] `findOne()` - Get price list by ID with items
   - [ ] `findByCode()` - Get price list by code
   - [ ] `create()` - Create new price list
   - [ ] `update()` - Update price list metadata
   - [ ] `remove()` - Soft delete price list
   - [ ] `setDefault()` - Set a price list as default
   - [ ] `getEffectivePriceLists()` - Get all currently effective price lists

3. Implement PriceListItem service methods
   - [ ] `bulkUpdatePrices()` - Update multiple product prices in a price list
   - [ ] `copyPriceList()` - Duplicate an entire price list
   - [ ] `applyPercentageAdjustment()` - Increase/decrease all prices by percentage
   - [ ] `syncProductPrices()` - Sync specific products to price list
   - [ ] `getPriceForProduct()` - Get effective price for product in price list

4. Update PricingService
   - [ ] Modify `calculatePrice()` to check price list items first
   - [ ] Add fallback to legacy `pricingTiers` JSONB
   - [ ] Add logging for legacy fallback usage
   - [ ] Update `analyzeMargins()` to use price list items
   - [ ] Update `updatePricesWithValidation()` to update price list items
   - [ ] Update `generateCategoryPricingRecommendations()` to use price lists

5. Update ProductService
   - [ ] Modify `findOne()` to include `priceListItems` relation
   - [ ] Add method `getProductPrices()` to return all prices across price lists
   - [ ] Update bulk operations to sync with price list items

6. Update CustomerService
   - [ ] Modify queries to include `priceList` relation
   - [ ] Add validation when setting `priceListId`
   - [ ] Ensure backward compatibility with `pricingScheme` string

7. Update SalesOrderService
   - [ ] Update price calculation to use customer's price list
   - [ ] Ensure order items use correct price from price list
   - [ ] Add price list information to order metadata

#### Acceptance Criteria
- ✅ All service methods have unit tests with >80% coverage
- ✅ Price list CRUD operations work correctly
- ✅ Price calculation uses new model successfully
- ✅ Legacy JSONB fallback works when needed
- ✅ No breaking changes to existing API endpoints
- ✅ All existing tests pass

---

### Phase 4: API Endpoints Implementation
**Estimated Effort**: 3-4 hours
**Risk Level**: Low

#### Tasks
1. Implement PriceList endpoints
   - [ ] `GET /api/price-lists` - List all price lists
   - [ ] `GET /api/price-lists/:id` - Get price list details with items
   - [ ] `GET /api/price-lists/code/:code` - Get by code
   - [ ] `POST /api/price-lists` - Create new price list
   - [ ] `PATCH /api/price-lists/:id` - Update price list
   - [ ] `DELETE /api/price-lists/:id` - Soft delete price list
   - [ ] `POST /api/price-lists/:id/set-default` - Set as default
   - [ ] `GET /api/price-lists/effective` - Get effective price lists

2. Implement PriceListItem endpoints
   - [ ] `GET /api/price-lists/:id/items` - Get all items in price list
   - [ ] `POST /api/price-lists/:id/items/bulk` - Bulk update prices
   - [ ] `POST /api/price-lists/:id/copy` - Copy price list
   - [ ] `POST /api/price-lists/:id/adjust` - Apply percentage adjustment
   - [ ] `GET /api/price-lists/:id/products/:productId` - Get specific product price

3. Update existing endpoints
   - [ ] Update `GET /api/inventory/products/:id` to include price list items
   - [ ] Update `GET /api/customers/:id` to include price list relationship
   - [ ] Ensure all responses maintain backward compatibility

4. Add Swagger documentation
   - [ ] Document all new endpoints with `@ApiOperation()`
   - [ ] Add request/response examples
   - [ ] Document all DTOs with `@ApiProperty()`

#### Acceptance Criteria
- ✅ All endpoints documented in Swagger
- ✅ All endpoints return proper HTTP status codes
- ✅ Pagination works correctly for list endpoints
- ✅ Error handling returns meaningful messages
- ✅ All endpoints have integration tests

---

### Phase 5: Frontend Implementation
**Estimated Effort**: 6-8 hours
**Risk Level**: Medium

#### Tasks
1. Create Redux slice for price lists
   - [ ] Create `frontend/src/store/slices/priceListSlice.ts`
   - [ ] Add async thunks: `fetchPriceLists`, `fetchPriceListById`, `createPriceList`, `updatePriceList`, `deletePriceList`
   - [ ] Add slice to store configuration

2. Create API service layer
   - [ ] Create `frontend/src/services/priceListApi.ts`
   - [ ] Implement all API calls matching backend endpoints
   - [ ] Add TypeScript interfaces for requests/responses

3. Create Price List management pages
   - [ ] Create `frontend/src/pages/settings/PriceLists.tsx` - List view
   - [ ] Create `frontend/src/pages/settings/PriceListForm.tsx` - Create/Edit form
   - [ ] Create `frontend/src/pages/settings/PriceListDetails.tsx` - Detail view with items

4. Create Price List Item components
   - [ ] Create `frontend/src/components/price-lists/PriceListItemTable.tsx` - Editable table
   - [ ] Create `frontend/src/components/price-lists/BulkPriceUpdateDialog.tsx` - Bulk update
   - [ ] Create `frontend/src/components/price-lists/PriceListSelector.tsx` - Dropdown selector
   - [ ] Create `frontend/src/components/price-lists/CopyPriceListDialog.tsx` - Copy dialog

5. Update existing components
   - [ ] Update product form to show all price list prices
   - [ ] Update customer form to use `PriceListSelector` instead of string input
   - [ ] Update sales order form to display customer's price list
   - [ ] Update product list to show prices from default price list

6. Add navigation
   - [ ] Add "Price Lists" menu item under Settings section
   - [ ] Update breadcrumbs for new pages
   - [ ] Add proper routing in `App.tsx`

7. Add validation and error handling
   - [ ] Validate price list codes are unique
   - [ ] Validate prices are positive numbers
   - [ ] Show user-friendly error messages
   - [ ] Add loading states for all async operations

#### Acceptance Criteria
- ✅ Users can view all price lists
- ✅ Users can create new price lists
- ✅ Users can edit price list metadata
- ✅ Users can bulk update prices in a price list
- ✅ Users can copy price lists
- ✅ Customer form shows price list dropdown
- ✅ Product form shows prices from all price lists
- ✅ All forms have proper validation
- ✅ UI matches existing design system (Material-UI)

---

### Phase 6: Testing and Validation
**Estimated Effort**: 4-5 hours
**Risk Level**: High

#### Tasks
1. Backend unit tests
   - [ ] Test PriceList entity validations
   - [ ] Test PriceListItem entity validations
   - [ ] Test PriceListService methods
   - [ ] Test PricingService with price lists
   - [ ] Test migration data integrity
   - [ ] Aim for >80% code coverage

2. Backend integration tests
   - [ ] Test price list CRUD operations via API
   - [ ] Test price calculation with price lists
   - [ ] Test customer price list assignment
   - [ ] Test sales order pricing with price lists
   - [ ] Test edge cases (missing prices, inactive lists, expired dates)

3. Frontend unit tests
   - [ ] Test Redux slice reducers and thunks
   - [ ] Test PriceListSelector component
   - [ ] Test form validation logic
   - [ ] Test API service error handling

4. End-to-end testing scenarios
   - [ ] Create a new price list via UI
   - [ ] Add prices for multiple products
   - [ ] Assign price list to customer
   - [ ] Create sales order and verify correct price used
   - [ ] Update price list and verify changes reflect
   - [ ] Copy price list and verify independence
   - [ ] Deactivate price list and verify fallback behavior

5. Data migration validation
   - [ ] Run migration on copy of production database
   - [ ] Verify all price data migrated correctly
   - [ ] Compare before/after reports for data integrity
   - [ ] Test rollback migration on test database
   - [ ] Document any data issues found

6. Performance testing
   - [ ] Benchmark price calculation performance (old vs new)
   - [ ] Test with large datasets (10k+ products, 100+ price lists)
   - [ ] Verify query performance with proper indexes
   - [ ] Test bulk operations performance

#### Acceptance Criteria
- ✅ All unit tests pass with >80% coverage
- ✅ All integration tests pass
- ✅ End-to-end scenarios complete successfully
- ✅ Migration validated on test database
- ✅ Performance benchmarks meet requirements
- ✅ No regressions in existing functionality

---

### Phase 7: Documentation and Deployment
**Estimated Effort**: 2-3 hours
**Risk Level**: Low

#### Tasks
1. Update documentation
   - [ ] Update `CLAUDE.md` with new pricing model information
   - [ ] Document price list API endpoints
   - [ ] Create user guide for price list management
   - [ ] Document migration process and rollback procedure
   - [ ] Add architectural diagrams for new pricing system

2. Create deployment checklist
   - [ ] Backup production database before migration
   - [ ] Schedule maintenance window (if needed)
   - [ ] Prepare rollback plan
   - [ ] Document post-deployment validation steps
   - [ ] Create communication plan for users

3. Pre-deployment preparation
   - [ ] Review all code changes
   - [ ] Ensure all tests pass in CI/CD pipeline
   - [ ] Build and test Docker containers
   - [ ] Verify environment variables are configured
   - [ ] Prepare monitoring and logging for new endpoints

4. Execute deployment
   - [ ] Deploy backend with migration
   - [ ] Verify migration completed successfully
   - [ ] Deploy frontend with new features
   - [ ] Run post-deployment validation
   - [ ] Monitor logs for errors
   - [ ] Test critical user flows

5. Post-deployment validation
   - [ ] Verify existing customers still have correct prices
   - [ ] Verify existing sales orders calculate correctly
   - [ ] Verify new price list features work
   - [ ] Check error logs for issues
   - [ ] Performance monitoring for first 24 hours

6. User communication
   - [ ] Announce new price list features
   - [ ] Provide training materials if needed
   - [ ] Create FAQ for common questions
   - [ ] Set up support channel for issues

#### Acceptance Criteria
- ✅ All documentation updated
- ✅ Deployment checklist completed
- ✅ Migration successful with no data loss
- ✅ All post-deployment validations pass
- ✅ Users notified of new features
- ✅ No critical issues reported within 24 hours

---

## Rollback Plan

### Immediate Rollback (Within 1 hour of deployment)
If critical issues are discovered immediately:

1. **Stop the application**
   ```bash
   docker compose down
   ```

2. **Rollback database migration**
   ```bash
   cd backend
   npm run migration:revert
   ```

3. **Revert to previous code version**
   ```bash
   git revert HEAD
   docker compose build
   docker compose up -d
   ```

4. **Verify system restored**
   - Check existing functionality works
   - Verify prices calculate correctly
   - Monitor logs for errors

### Delayed Rollback (After 1 hour)
If issues are discovered after significant usage:

1. **Do NOT rollback database** - Data may have been created in new tables
2. **Deploy hotfix** - Fix the issue in code
3. **Keep both systems running** - Legacy JSONB fallback ensures continuity
4. **Plan data reconciliation** - Sync any data created during issue period

---

## Risk Assessment

### High Risk Items
1. **Data Migration Integrity**
   - **Risk**: Price data could be lost or corrupted during migration
   - **Mitigation**: Full database backup, validation queries, dry-run on test database
   - **Fallback**: Rollback migration, restore from backup

2. **Performance Impact**
   - **Risk**: Price calculations may be slower with JOIN queries
   - **Mitigation**: Proper indexing, eager loading, query optimization
   - **Fallback**: Add caching layer if needed

3. **Sales Order Pricing Errors**
   - **Risk**: Orders may use wrong prices if migration issues occur
   - **Mitigation**: Extensive testing, backward compatibility with JSONB
   - **Fallback**: Legacy pricing system still available

### Medium Risk Items
1. **Customer Experience**
   - **Risk**: UI changes may confuse users
   - **Mitigation**: User training, documentation, similar UI patterns
   - **Fallback**: Can revert to old UI while keeping new backend

2. **Deployment Downtime**
   - **Risk**: Migration may take longer than expected
   - **Mitigation**: Test migration speed on production-size database
   - **Fallback**: Schedule during low-usage hours

### Low Risk Items
1. **Code Complexity**
   - **Risk**: New code may introduce bugs
   - **Mitigation**: Comprehensive testing, code review
   - **Fallback**: Good test coverage catches issues early

---

## Success Metrics

### Technical Metrics
- ✅ Zero data loss during migration
- ✅ All tests passing with >80% coverage
- ✅ Price calculation performance within 10% of baseline
- ✅ API response times <200ms for price queries
- ✅ Zero critical bugs in first week

### Business Metrics
- ✅ All existing customers maintain correct pricing
- ✅ New price lists can be created and assigned
- ✅ Sales orders continue processing without errors
- ✅ User adoption of new price list features
- ✅ Reduction in pricing errors and discrepancies

### User Experience Metrics
- ✅ Price list management tasks completable in <2 minutes
- ✅ No user complaints about pricing errors
- ✅ Positive feedback on new features
- ✅ Support tickets about pricing <5 per week

---

## Timeline Estimate

**Total Estimated Effort**: 24-32 hours

- **Phase 1**: 2-3 hours (Database Schema)
- **Phase 2**: 3-4 hours (Data Migration)
- **Phase 3**: 4-5 hours (Backend Services)
- **Phase 4**: 3-4 hours (API Endpoints)
- **Phase 5**: 6-8 hours (Frontend)
- **Phase 6**: 4-5 hours (Testing)
- **Phase 7**: 2-3 hours (Documentation & Deployment)

**Recommended Schedule**: 1-2 weeks with thorough testing

---

## Dependencies

### External Dependencies
- PostgreSQL database access
- Docker environment for testing
- CI/CD pipeline for automated testing

### Internal Dependencies
- Backend must be completed before frontend
- Data migration must be validated before deployment
- Testing must be completed before user rollout

### Team Dependencies
- Backend developer for service layer
- Frontend developer for UI components
- DBA for migration review (if available)
- QA for testing validation
- Product owner for acceptance criteria

---

## Post-Migration Optimization

### Phase 8: Cleanup (After 30 days of stable operation)
- [ ] Remove deprecated `pricingTiers` JSONB field from Product entity
- [ ] Remove deprecated `pricingScheme` string field from Customer entity
- [ ] Remove `customerPricingSchemes` from settings entity
- [ ] Remove legacy fallback code from PricingService
- [ ] Generate migration to drop deprecated columns
- [ ] Update all documentation to remove references to old system

### Phase 9: Advanced Features (Future enhancements)
- [ ] Quantity-based pricing (price breaks)
- [ ] Customer-specific price overrides
- [ ] Time-based promotional pricing
- [ ] Multi-currency price list support
- [ ] Price list import/export via CSV/Excel
- [ ] Price change history and audit trail
- [ ] Automated price updates based on cost changes
- [ ] Competitor price monitoring integration

---

## Notes

### Backward Compatibility Strategy
During transition period (recommended 30 days):
- Both systems run in parallel
- New model takes precedence
- Legacy JSONB used as fallback
- All writes go to both systems
- Monitoring logs show legacy usage

### Code Naming Conventions
- **PriceList**: Master entity for pricing schemes
- **PriceListItem**: Individual product prices
- **priceListId**: Foreign key reference
- **priceListItems**: Relationship property
- **getPriceFromPriceList()**: New method name
- **getPriceByScheme()**: Deprecated method (keep for compatibility)

### Database Indexes Required
```sql
-- Price Lists
CREATE INDEX IDX_price_lists_code ON price_lists(code);
CREATE INDEX IDX_price_lists_isActive ON price_lists(isActive);

-- Price List Items
CREATE INDEX IDX_price_list_items_priceListId ON price_list_items(priceListId);
CREATE INDEX IDX_price_list_items_productId ON price_list_items(productId);
CREATE UNIQUE INDEX UQ_price_list_product ON price_list_items(priceListId, productId);

-- Customers
CREATE INDEX IDX_customers_priceListId ON customers(priceListId);
```

---

## Approval and Sign-off

- [ ] Technical Lead Review
- [ ] Product Owner Approval
- [ ] Database Administrator Review (if applicable)
- [ ] QA Sign-off
- [ ] Security Review (if required)
- [ ] Go-Live Approval

---

**Document Version**: 1.0
**Last Updated**: 2026-01-12
**Author**: Claude Code
**Status**: Ready for Review
