#!/bin/bash
set -e

echo "PostgreSQL 15 to 18 Upgrade Script"
echo "==================================="
echo ""

# Step 1: Export data using pg_dumpall
echo "Step 1: Exporting all data from PostgreSQL 15..."
docker compose exec -T postgres pg_dumpall -U erp_user > /home/blur/erp2/backups/full_backup_$(date +%Y%m%d_%H%M%S).sql
echo "✓ Full backup created"
echo ""

# Step 2: Stop all services
echo "Step 2: Stopping services..."
docker compose stop backend frontend nginx
docker compose stop postgres
echo "✓ Services stopped"
echo ""

# Step 3: Rename old volume
echo "Step 3: Renaming old PostgreSQL volume..."
docker volume create erp2_postgres_data_old
docker run --rm -v erp2_postgres_data:/from -v erp2_postgres_data_old:/to alpine sh -c "cd /from && cp -av . /to"
echo "✓ Old volume backed up"
echo ""

# Step 4: Remove old container and volume
echo "Step 4: Removing old container..."
docker compose rm -f postgres
echo "✓ Container removed"
echo ""

# Step 5: Update docker-compose.yml to PostgreSQL 18
echo "Step 5: Updating docker-compose.yml..."
sed -i 's/postgres:15-alpine/postgres:18.1-alpine3.23/' /home/blur/erp2/docker-compose.yml
echo "✓ docker-compose.yml updated"
echo ""

# Step 6: Start new PostgreSQL 18 with fresh volume
echo "Step 6: Starting fresh PostgreSQL 18..."
docker volume rm erp2_postgres_data || true
docker volume create erp2_postgres_data
docker compose up -d postgres
echo "Waiting for PostgreSQL 18 to start..."
sleep 10
echo "✓ PostgreSQL 18 started"
echo ""

# Step 7: Restore data
echo "Step 7: Restoring data to PostgreSQL 18..."
LATEST_BACKUP=$(ls -t /home/blur/erp2/backups/full_backup_*.sql | head -1)
echo "Using backup: $LATEST_BACKUP"
docker compose exec -T postgres psql -U erp_user -d postgres < "$LATEST_BACKUP"
echo "✓ Data restored"
echo ""

# Step 8: Verify
echo "Step 8: Verifying installation..."
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT version();"
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM products;"
echo ""

# Step 9: Start all services
echo "Step 9: Starting all services..."
docker compose up -d
echo "✓ All services started"
echo ""

echo "==================================="
echo "PostgreSQL upgrade complete!"
echo "Old data volume preserved as: erp2_postgres_data_old"
echo "You can remove it with: docker volume rm erp2_postgres_data_old"
echo "==================================="
