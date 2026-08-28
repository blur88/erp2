#!/bin/bash

# ERP System - Local Development Stack
#
# This script builds and runs the stack from local source for DEVELOPMENT.
# It is NOT the production deploy path.
#
#   Production  ->  ./setup.sh          (docker-compose.prod.yml, prebuilt image)
#   Development ->  ./deploy.sh         (this script, builds from ./backend + ./frontend)
#
# Compose files are named explicitly below rather than relying on compose's
# implicit merge of docker-compose.override.yml, so the selected configuration
# is visible on every command (#1158).

set -e

echo "🚀 Starting ERP System (local development stack)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Development stack: base + the local override (ports, debug logging).
# setup.sh owns the production stack and pins docker-compose.prod.yml.
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.override.yml"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p uploads logs backups
    mkdir -p database/init
    chmod 755 uploads logs backups
    
    print_success "Directories created"
}

# Copy environment file if it doesn't exist
setup_environment() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        cp .env.example .env
        print_warning "Created .env file from .env.example"
        print_warning "Please review and update the .env file with your production values"
    else
        print_success "Environment file already exists"
    fi
}

# Build and start services
deploy_services() {
    print_status "Building and starting services..."
    
    # Pull latest images
    docker compose $COMPOSE_FILES pull
    
    # Build custom images
    docker compose $COMPOSE_FILES build --no-cache
    
    # Start services
    docker compose $COMPOSE_FILES up -d
    
    print_success "Services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    print_status "Waiting for PostgreSQL..."
    until docker compose $COMPOSE_FILES exec postgres pg_isready -U erp_user; do
        sleep 2
    done
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    until docker compose $COMPOSE_FILES exec redis redis-cli ping; do
        sleep 2
    done
    
    # Wait for backend API
    print_status "Waiting for Backend API..."
    until curl -f http://localhost:3001/api/health > /dev/null 2>&1; do
        sleep 5
    done
    
    # Wait for frontend
    print_status "Waiting for Frontend..."
    until curl -f http://localhost:3000 > /dev/null 2>&1; do
        sleep 5
    done

    # Wait for NGINX
    print_status "Waiting for NGINX..."
    until curl -f http://localhost:8080/health > /dev/null 2>&1; do
        sleep 2
    done

    print_success "All services are ready"
}

# Display service status
show_status() {
    print_status "Service Status:"
    docker compose $COMPOSE_FILES ps
    
    echo ""
    print_success "🎉 ERP System deployed successfully!"
    echo ""
    echo "Access URLs:"
    echo "  🌐 Frontend Application: http://localhost:3000"
    echo "  🔧 Backend API: http://localhost:3001/api"
    echo "  📚 API Documentation: http://localhost:3001/api/docs"
    echo ""
    echo "Demo Accounts:"
    echo "  👤 Admin: admin / Admin@123!"
    echo "  ⚠️  Change the default password immediately after first login!"
    echo ""
    echo "Useful Commands:"
    echo "  📊 View logs: ./deploy.sh logs"
    echo "  🔄 Restart services: ./deploy.sh restart"
    echo "  🛑 Stop services: ./deploy.sh stop"
    echo "  🧹 Clean up: ./deploy.sh clean"
    echo ""
}

# Cleanup function for errors
cleanup_on_error() {
    print_error "Deployment failed. Cleaning up..."
    docker compose $COMPOSE_FILES down
    exit 1
}

# Set up error handling
trap cleanup_on_error ERR

# Main deployment flow
main() {
    echo "==============================================="
    echo "   ERP System - Docker Deployment Script"
    echo "==============================================="
    echo ""
    
    check_prerequisites
    create_directories
    setup_environment
    deploy_services
    wait_for_services
    show_status
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        print_status "Stopping ERP System..."
        docker compose $COMPOSE_FILES down
        print_success "ERP System stopped"
        ;;
    "restart")
        print_status "Restarting ERP System..."
        docker compose $COMPOSE_FILES restart
        print_success "ERP System restarted"
        ;;
    "logs")
        docker compose $COMPOSE_FILES logs -f
        ;;
    "clean")
        print_warning "This will remove all containers, networks, and volumes!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker compose $COMPOSE_FILES down -v --remove-orphans
            docker system prune -f
            print_success "Cleanup completed"
        fi
        ;;
    "status")
        docker compose $COMPOSE_FILES ps
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|logs|clean|status}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the complete ERP system (default)"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - View real-time logs"
        echo "  clean    - Remove all containers and volumes"
        echo "  status   - Show service status"
        exit 1
        ;;
esac