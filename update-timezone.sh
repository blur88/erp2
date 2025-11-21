#!/bin/bash

# Script to update timezone to Asia/Kuala_Lumpur for the ERP system
# This script will:
# 1. Stop all containers
# 2. Rebuild backend with new timezone configuration
# 3. Start all containers
# 4. Run the migration to set database timezone
# 5. Verify timezone settings

set -e

echo "========================================="
echo "Updating ERP System Timezone"
echo "Target Timezone: Asia/Kuala_Lumpur"
echo "========================================="
echo ""

# Step 1: Stop all containers
echo "Step 1: Stopping all containers..."
docker compose down
echo "✓ Containers stopped"
echo ""

# Step 2: Rebuild backend
echo "Step 2: Rebuilding backend with new configuration..."
docker compose build backend
echo "✓ Backend rebuilt"
echo ""

# Step 3: Start all containers
echo "Step 3: Starting all containers..."
docker compose up -d
echo "✓ Containers started"
echo ""

# Step 4: Wait for database to be ready
echo "Step 4: Waiting for database to be ready..."
sleep 10
echo "✓ Database ready"
echo ""

# Step 5: Run migrations
echo "Step 5: Running timezone migration..."
docker compose exec -T backend npm run migration:run
echo "✓ Migration completed"
echo ""

# Step 6: Verify timezone settings
echo "Step 6: Verifying timezone settings..."
echo ""

echo "Checking Docker environment variables:"
docker compose exec -T postgres sh -c 'echo "TZ=$TZ"'
docker compose exec -T backend sh -c 'echo "TZ=$TZ"'
echo ""

echo "Checking PostgreSQL timezone:"
docker compose exec -T postgres psql -U erp_user -d erp_db -c "SHOW timezone;"
echo ""

echo "Checking current time in PostgreSQL:"
docker compose exec -T postgres psql -U erp_user -d erp_db -c "SELECT NOW() as current_time, CURRENT_TIMESTAMP as timestamp;"
echo ""

echo "Checking Node.js timezone:"
docker compose exec -T backend node -e "console.log('TZ:', process.env.TZ); console.log('Current time:', new Date().toString());"
echo ""

echo "========================================="
echo "Timezone Update Complete!"
echo "========================================="
echo ""
echo "All timestamps will now use Asia/Kuala_Lumpur timezone."
echo "Existing data timestamps remain in their original timezone"
echo "but will be displayed in Asia/Kuala_Lumpur timezone."
echo ""
