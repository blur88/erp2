#!/bin/bash

# Script to verify timezone settings across all components

echo "========================================="
echo "ERP System Timezone Verification"
echo "========================================="
echo ""

echo "1. Docker Environment Variables:"
echo "--------------------------------"
echo "PostgreSQL TZ:"
docker compose exec -T postgres sh -c 'echo $TZ' || echo "Not set"
echo ""
echo "Redis TZ:"
docker compose exec -T redis sh -c 'echo $TZ' || echo "Not set"
echo ""
echo "Backend TZ:"
docker compose exec -T backend sh -c 'echo $TZ' || echo "Not set"
echo ""
echo "Frontend TZ:"
docker compose exec -T frontend sh -c 'echo $TZ' || echo "Not set"
echo ""

echo "2. PostgreSQL Timezone Settings:"
echo "--------------------------------"
docker compose exec -T postgres psql -U erp_user -d erp_db -c "SHOW timezone;" 2>/dev/null || echo "Database not ready"
echo ""

echo "3. Current Time Comparison:"
echo "--------------------------------"
echo "System time (host):"
date
echo ""
echo "PostgreSQL time:"
docker compose exec -T postgres psql -U erp_user -d erp_db -c "SELECT NOW() as postgresql_time;" 2>/dev/null || echo "Database not ready"
echo ""
echo "Node.js Backend time:"
docker compose exec -T backend node -e "console.log('Node.js time:', new Date().toString());" 2>/dev/null || echo "Backend not ready"
echo ""

echo "4. Sample Data Timestamps:"
echo "--------------------------------"
echo "Recent products (showing timestamps):"
docker compose exec -T postgres psql -U erp_user -d erp_db -c "SELECT name, \"createdAt\", \"updatedAt\" FROM products WHERE \"deletedAt\" IS NULL ORDER BY \"createdAt\" DESC LIMIT 3;" 2>/dev/null || echo "No data or database not ready"
echo ""

echo "========================================="
echo "Verification Complete"
echo "========================================="
